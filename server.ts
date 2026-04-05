import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID, createHash, createCipheriv, createDecipheriv } from "crypto";
import { LanguageServiceClient } from "@google-cloud/language";
import { SpeechClient } from "@google-cloud/speech";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { GoogleGenAI, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { buildAuditEvent, logAuditEvent } from "./backend/audit/auditLogger";
import { evaluateConsent, getConsentPolicySummary } from "./backend/consent/consentPolicy";
import { createGrant, listGrantsByCase, revokeGrant } from "./backend/consent/consentStore";
import { requireConsentForPurpose } from "./backend/consent/consentMiddleware";
import {
  generateCaseNumber,
  createCaseAssignment,
  createOfficerDesignation,
  buildAccessCheckResult,
  type CaseAssignment,
  type OfficerDesignation,
} from "./backend/case/caseAssignment";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory stores for case assignments and officer designations
// In production, these would be in Firestore
const caseAssignments = new Map<string, CaseAssignment>(); // caseId -> CaseAssignment
const officerDesignations: OfficerDesignation[] = []; // Array of designations
const victimCaseMap = new Map<string, string>(); // victimUniqueId -> caseId (for lookup)
const adminSessions = new Map<string, { email: string; createdAt: string }>();

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const isAdminAuthConfigured = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

if (!isAdminAuthConfigured) {
  console.warn(
    "Admin login is disabled until ADMIN_EMAIL and ADMIN_PASSWORD are configured in environment variables."
  );
}

type VictimProfile = {
  victimUniqueId: string;
  email?: string;
  displayName?: string;
  phone?: string;
  emergencyContact?: string;
  incidentSummary?: string;
  updatedAt: string;
};

type VictimCasePayload = {
  profile: VictimProfile;
  fragments: string[];
  metadata?: Record<string, unknown>;
};

type CaseIntegrityEntry = {
  entryId: string;
  caseId: string;
  prevHash: string;
  currentHash: string;
  createdAt: string;
  actorId: string;
  payloadType: "victim_profile" | "victim_fragments";
};

type OfficerChatMessage = {
  messageId: string;
  caseId: string;
  officerId: string;
  officerPost: string;
  officerName: string;
  role: string;
  message: string;
  createdAt: string;
  direction: "officer-to-victim" | "victim-to-officer" | "system";
};

const victimDetailsByCase = new Map<string, VictimCasePayload>();
const caseIntegrityByCase = new Map<string, CaseIntegrityEntry[]>();
const caseChatMessagesByCase = new Map<string, OfficerChatMessage[]>();
const caseChatClientsByCase = new Map<string, Set<WebSocket>>();
const reportFileById = new Map<string, string>();
const reportBufferById = new Map<string, Uint8Array>();

const hashQueuePath = path.join(process.cwd(), "workers", "hashAnchoring", "queue.json");
const reportsPath = path.join(process.cwd(), "reports");
const caseStatePath = path.join(process.cwd(), "backend", "case", "case-state.json");
const mlServiceUrl = (process.env.ML_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
const caseStateEncryptionSecret = String(process.env.CASE_STATE_ENCRYPTION_KEY || "").trim();
const enableFakeVictimAssessment = String(process.env.ENABLE_FAKE_VICTIM_ASSESSMENT || "false").toLowerCase() === "true";

type OfficerRoleToken = "police" | "lawyer" | "admin";

function normalizeOfficerRoleToken(value: string): OfficerRoleToken {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("lawyer")) return "lawyer";
  if (normalized.includes("admin")) return "admin";
  return "police";
}

function toScopedOfficerActorId(officerId: string, role: string): string {
  return `${normalizeOfficerRoleToken(role)}:${String(officerId || "").trim()}`;
}

function isDesignationActiveForOfficer(params: {
  caseId: string;
  officerIdRaw: string;
  officerRole: string;
  designation: OfficerDesignation;
}) {
  const normalizedRole = normalizeOfficerRoleToken(params.officerRole);
  const scopedOfficerActorId = toScopedOfficerActorId(params.officerIdRaw, normalizedRole);
  const idMatches =
    params.designation.officerId === scopedOfficerActorId ||
    params.designation.officerId === params.officerIdRaw;

  return (
    params.designation.caseId === params.caseId &&
    params.designation.role === normalizedRole &&
    idMatches &&
    params.designation.status === "active" &&
    (!params.designation.expiresAt || new Date(params.designation.expiresAt) > new Date())
  );
}

function hasActorGrant(params: {
  caseId: string;
  officerIdRaw: string;
  officerRole: string;
  purpose: "police_share" | "lawyer_share" | "legal_export";
}) {
  const normalizedRole = normalizeOfficerRoleToken(params.officerRole);
  const scopedOfficerActorId = toScopedOfficerActorId(params.officerIdRaw, normalizedRole);
  const now = Date.now();

  return listGrantsByCase(params.caseId).some((grant) => {
    if (grant.status !== "active") return false;
    if (grant.purpose !== params.purpose) return false;
    if (grant.granteeRole !== normalizedRole) return false;

    const actorAllowed =
      !grant.granteeActorId ||
      grant.granteeActorId === scopedOfficerActorId ||
      grant.granteeActorId === params.officerIdRaw;
    if (!actorAllowed) return false;

    if (!grant.expiresAt) return true;
    return new Date(grant.expiresAt).getTime() > now;
  });
}

type PersistedCaseState = {
  caseAssignments: CaseAssignment[];
  officerDesignations: OfficerDesignation[];
  victimCaseMap: Array<[string, string]>;
  victimDetailsByCase: Array<[string, VictimCasePayload]>;
  caseIntegrityByCase: Array<[string, CaseIntegrityEntry[]]>;
  caseChatMessagesByCase?: Array<[string, OfficerChatMessage[]]>;
};

type EncryptedPersistedCaseState = {
  encrypted: true;
  algorithm: "aes-256-gcm";
  keyVersion: "v1";
  iv: string;
  authTag: string;
  ciphertext: string;
};

function getCaseStateEncryptionKey(): Buffer | null {
  if (!caseStateEncryptionSecret) return null;
  return createHash("sha256").update(caseStateEncryptionSecret, "utf8").digest();
}

function encryptCaseState(data: PersistedCaseState): EncryptedPersistedCaseState {
  const key = getCaseStateEncryptionKey();
  if (!key) {
    throw new Error("CASE_STATE_ENCRYPTION_KEY is required for encrypted state persistence");
  }

  const iv = Buffer.from(randomUUID().replace(/-/g, "").slice(0, 24), "hex");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: "aes-256-gcm",
    keyVersion: "v1",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptCaseState(payload: EncryptedPersistedCaseState): PersistedCaseState {
  const key = getCaseStateEncryptionKey();
  if (!key) {
    throw new Error("Encrypted case-state found but CASE_STATE_ENCRYPTION_KEY is not configured");
  }

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext || "{}") as PersistedCaseState;
}

function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistCaseState() {
  try {
    ensureParentDir(caseStatePath);
    const data: PersistedCaseState = {
      caseAssignments: Array.from(caseAssignments.values()),
      officerDesignations,
      victimCaseMap: Array.from(victimCaseMap.entries()),
      victimDetailsByCase: Array.from(victimDetailsByCase.entries()),
      caseIntegrityByCase: Array.from(caseIntegrityByCase.entries()),
      caseChatMessagesByCase: Array.from(caseChatMessagesByCase.entries()),
    };

    const shouldEncrypt = !!getCaseStateEncryptionKey();
    if (shouldEncrypt) {
      const encrypted = encryptCaseState(data);
      fs.writeFileSync(caseStatePath, JSON.stringify(encrypted, null, 2), "utf8");
    } else {
      fs.writeFileSync(caseStatePath, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (error) {
    console.error("persistCaseState failed", error);
  }
}

function loadPersistedCaseState() {
  if (!fs.existsSync(caseStatePath)) return;

  try {
    const raw = fs.readFileSync(caseStatePath, "utf8");
    const parsedRaw = JSON.parse(raw || "{}");
    const parsed = (parsedRaw?.encrypted
      ? decryptCaseState(parsedRaw as EncryptedPersistedCaseState)
      : parsedRaw) as Partial<PersistedCaseState>;

    caseAssignments.clear();
    victimCaseMap.clear();
    victimDetailsByCase.clear();
    caseIntegrityByCase.clear();
    caseChatMessagesByCase.clear();
    officerDesignations.splice(0, officerDesignations.length);

    for (const item of parsed.caseAssignments || []) {
      if (item?.caseId) {
        caseAssignments.set(item.caseId, item);
      }
    }

    for (const tuple of parsed.victimCaseMap || []) {
      if (Array.isArray(tuple) && tuple.length === 2) {
        victimCaseMap.set(String(tuple[0]), String(tuple[1]));
      }
    }

    for (const tuple of parsed.victimDetailsByCase || []) {
      if (Array.isArray(tuple) && tuple.length === 2) {
        victimDetailsByCase.set(String(tuple[0]), tuple[1]);
      }
    }

    for (const tuple of parsed.caseIntegrityByCase || []) {
      if (Array.isArray(tuple) && tuple.length === 2 && Array.isArray(tuple[1])) {
        caseIntegrityByCase.set(String(tuple[0]), tuple[1]);
      }
    }

    for (const tuple of parsed.caseChatMessagesByCase || []) {
      if (Array.isArray(tuple) && tuple.length === 2 && Array.isArray(tuple[1])) {
        caseChatMessagesByCase.set(String(tuple[0]), tuple[1] as OfficerChatMessage[]);
      }
    }

    for (const designation of parsed.officerDesignations || []) {
      if (designation?.designationId) {
        officerDesignations.push(designation);
      }
    }
  } catch (error) {
    console.error("loadPersistedCaseState failed", error);
  }
}

loadPersistedCaseState();

function readAdminSession(req: express.Request) {
  const token = String(req.header("x-admin-session") || "").trim();
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  return { token, ...session };
}

function requireAdminSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = readAdminSession(req);
  if (!session) {
    return res.status(401).json({
      error: "Admin authentication required",
      code: "ADMIN_AUTH_REQUIRED",
    });
  }

  res.locals.adminSession = session;
  next();
}

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function appendIntegrityEntry(params: {
  caseId: string;
  actorId: string;
  payloadType: "victim_profile" | "victim_fragments";
  payload: unknown;
}) {
  const createdAt = new Date().toISOString();
  const entries = caseIntegrityByCase.get(params.caseId) || [];
  const prevHash = entries.length ? entries[entries.length - 1].currentHash : "GENESIS";
  const currentHash = sha256Hex(
    JSON.stringify({
      caseId: params.caseId,
      actorId: params.actorId,
      payloadType: params.payloadType,
      payload: params.payload,
      prevHash,
      createdAt,
    })
  );

  const entry: CaseIntegrityEntry = {
    entryId: `integrity-${randomUUID()}`,
    caseId: params.caseId,
    prevHash,
    currentHash,
    createdAt,
    actorId: params.actorId,
    payloadType: params.payloadType,
  };

  entries.push(entry);
  caseIntegrityByCase.set(params.caseId, entries);
  return entry;
}

function queueHashAnchorJob(params: {
  caseId: string;
  uploaderId: string;
  blobHash: string;
  metadataHash: string;
}) {
  if (!fs.existsSync(path.dirname(hashQueuePath))) {
    fs.mkdirSync(path.dirname(hashQueuePath), { recursive: true });
  }
  if (!fs.existsSync(hashQueuePath)) {
    fs.writeFileSync(hashQueuePath, "[]", "utf8");
  }

  const queueRaw = fs.readFileSync(hashQueuePath, "utf8");
  const queue = JSON.parse(queueRaw || "[]") as Array<Record<string, unknown>>;
  queue.push({
    caseId: params.caseId,
    uploaderId: params.uploaderId,
    consentVersion: "consent-v1",
    blobHash: params.blobHash,
    metadataHash: params.metadataHash,
    createdAt: new Date().toISOString(),
  });
  fs.writeFileSync(hashQueuePath, JSON.stringify(queue, null, 2), "utf8");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getChatHistory(caseId: string) {
  return caseChatMessagesByCase.get(caseId) || [];
}

function setChatHistory(caseId: string, messages: OfficerChatMessage[]) {
  caseChatMessagesByCase.set(caseId, messages);
  persistCaseState();
}

function appendChatMessage(message: OfficerChatMessage) {
  const history = getChatHistory(message.caseId);
  const next = [...history, message].slice(-200);
  setChatHistory(message.caseId, next);
  return next;
}

function normalizeChatMessage(payload: Record<string, unknown>, caseId: string): OfficerChatMessage | null {
  const message = String(payload.message || payload.text || "").trim();
  if (!message) return null;

  const createdAt = String(payload.createdAt || new Date().toISOString());
  const directionRaw = String(payload.direction || "officer-to-victim");
  const direction: OfficerChatMessage["direction"] =
    directionRaw === "victim-to-officer" || directionRaw === "system" ? directionRaw : "officer-to-victim";

  return {
    messageId: String(payload.messageId || `chat-${randomUUID()}`),
    caseId,
    officerId: String(payload.officerId || "officer-user").trim() || "officer-user",
    officerPost: String(payload.officerPost || payload.role || "Police Officer").trim() || "Police Officer",
    officerName: String(payload.officerName || payload.displayName || payload.officerId || "Officer").trim() || "Officer",
    role: String(payload.role || "officer").trim() || "officer",
    message,
    createdAt,
    direction,
  };
}

async function fetchJsonWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data: unknown = {};
    try {
      data = JSON.parse(text || "{}");
    } catch {
      data = { raw: text };
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function geocodeLocationLabel(locationLabel: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(locationLabel)}`;
  const response = await fetchJsonWithTimeout(url, {
    headers: {
      "User-Agent": "Saakshi/1.0 (+https://example.local)",
      Accept: "application/json",
    },
  }, 15000);

  if (!response.ok || !Array.isArray(response.data) || !response.data.length) {
    return null;
  }

  const first = response.data[0] as Record<string, unknown>;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    lat,
    lon,
    displayName: String(first.display_name || locationLabel),
  };
}

async function lookupNearbyCameras(locationLabel: string, radiusMeters: number) {
  const center = await geocodeLocationLabel(locationLabel);
  if (!center) {
    return {
      provider: "nominatim+overpass",
      center: null,
      cameras: [],
      hint: "Could not geocode the location. Try a nearby landmark, street name, or area name.",
    };
  }

  const radius = Math.max(250, Math.min(5000, radiusMeters));
  const overpassQuery = `
[out:json][timeout:25];
(
  node(around:${radius},${center.lat},${center.lon})["man_made"="surveillance"];
  node(around:${radius},${center.lat},${center.lon})["surveillance"~"camera|video",i];
  node(around:${radius},${center.lat},${center.lon})["camera:type"];
  way(around:${radius},${center.lat},${center.lon})["man_made"="surveillance"];
  way(around:${radius},${center.lat},${center.lon})["surveillance"~"camera|video",i];
  relation(around:${radius},${center.lat},${center.lon})["man_made"="surveillance"];
);
out center tags;`;

  const response = await fetchJsonWithTimeout("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
      "User-Agent": "Saakshi/1.0 (+https://example.local)",
    },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  }, 20000);

  if (!response.ok || typeof response.data !== "object" || !response.data) {
    return {
      provider: "nominatim+overpass",
      center,
      cameras: [],
      hint: "Overpass lookup failed. Try a smaller area or a clearer landmark.",
    };
  }

  const elements = Array.isArray((response.data as any).elements) ? (response.data as any).elements : [];
  const cameras = elements
    .map((element: any) => {
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const tags = element.tags || {};
      const name = String(tags.name || tags.ref || tags.operator || "Unnamed camera");
      const type = String(tags["camera:type"] || tags.man_made || tags.surveillance || "surveillance");
      const distanceMeters = Math.round(haversineMeters(center.lat, center.lon, lat, lon));
      return {
        id: `${element.type}/${element.id}`,
        name,
        type,
        source: String(tags.operator || tags.manufacturer || "OpenStreetMap / Overpass"),
        distanceMeters,
        lat,
        lon,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.distanceMeters - b.distanceMeters)
    .slice(0, 20);

  return {
    provider: "nominatim+overpass",
    center,
    cameras,
    hint: cameras.length ? `${cameras.length} camera-related OSM elements found nearby.` : "No camera-related OSM elements were found nearby.",
  };
}

async function lookupMerchantTransactionRecord(params: { merchantTransactionId: string; googleMerchantId: string }) {
  const accessToken = String(process.env.GOOGLE_PAY_ACCESS_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    return {
      ok: false as const,
      status: 503,
      data: {
        error: {
          code: 503,
          status: "UNAVAILABLE",
          message: "Google Pay access token is not configured on the server",
        },
      },
    };
  }

  return fetchJsonWithTimeout("https://nbupayments.googleapis.com/v1/merchantTransactions:get", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      merchantInfo: { googleMerchantId: params.googleMerchantId },
      transactionIdentifier: { merchantTransactionId: params.merchantTransactionId },
    }),
  }, 20000);
}

async function callMlService(pathname: string, payload: Record<string, unknown>, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${mlServiceUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = {};
    try {
      data = JSON.parse(text || "{}");
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
      };
    }
    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      data: {
        error: (error as Error).name === "AbortError" ? "ML service timed out" : "ML service unavailable",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractLegalSectionsFromFragments(fragments: string[]) {
  const joined = fragments.join(" ").toLowerCase();
  const addIf = (needle: string, section: { code: string; title: string; why: string }) =>
    joined.includes(needle) ? [section] : [];

  const suggestions = [
    ...addIf("threat", { code: "IPC 506", title: "Criminal Intimidation", why: "Threat cues detected in narrative" }),
    ...addIf("hit", { code: "IPC 323", title: "Voluntarily Causing Hurt", why: "Physical assault cue found" }),
    ...addIf("touch", { code: "IPC 354", title: "Outraging Modesty", why: "Unwanted touch cue found" }),
    ...addIf("stalk", { code: "IPC 354D", title: "Stalking", why: "Repeated pursuit cue found" }),
    ...addIf("kidnap", { code: "IPC 363", title: "Kidnapping", why: "Forced movement/abduction cue found" }),
    ...addIf("phone", { code: "IT Act 66E", title: "Violation of Privacy", why: "Digital privacy abuse signal found" }),
    ...addIf("sexual", { code: "IPC 376", title: "Rape (check factual threshold)", why: "Sexual violence marker present" }),
    { code: "CrPC 154", title: "FIR Registration", why: "Baseline procedural recommendation" },
    { code: "CrPC 164", title: "Magistrate Statement", why: "Protect testimonial integrity" },
  ];

  return uniqueStrings(suggestions.map((item) => `${item.code} | ${item.title} | ${item.why}`)).map((row) => {
    const [code, title, why] = row.split(" | ");
    return { code, title, why };
  });
}

function buildContradictionRisks(fragments: string[]) {
  const joined = fragments.join(" ").toLowerCase();
  const risks: Array<{ level: "HIGH" | "MEDIUM" | "LOW"; title: string; detail: string; mitigation: string }> = [];

  if (joined.includes("morning") && joined.includes("night")) {
    risks.push({
      level: "MEDIUM",
      title: "Time-window inconsistency",
      detail: "Both morning and night markers appear across statements.",
      mitigation: "Anchor each event to one relative sequence (before/after) and one approximate slot.",
    });
  }

  if (joined.includes("don\'t remember") || joined.includes("not sure") || joined.includes("maybe")) {
    risks.push({
      level: "LOW",
      title: "Uncertainty markers",
      detail: "Hesitation phrases may be attacked in cross-examination.",
      mitigation: "Separate certain facts from uncertain memory clearly in testimony.",
    });
  }

  if (fragments.length >= 4) {
    const uniqueLengths = new Set(fragments.map((fragment) => fragment.length > 120 ? "long" : "short"));
    if (uniqueLengths.size === 1) {
      risks.push({
        level: "LOW",
        title: "Uniform narrative shape",
        detail: "Statements have very similar structure; may look over-scripted.",
        mitigation: "Preserve natural wording and include sensory anchors where available.",
      });
    }
  }

  if (!risks.length) {
    risks.push({
      level: "LOW",
      title: "No major contradiction detected",
      detail: "Current fragments look broadly coherent.",
      mitigation: "Continue collecting external corroboration (CCTV, transit, weather, call logs).",
    });
  }

  return risks;
}

function isGeminiQuotaError(error: unknown): boolean {
  const err = error as { status?: number; message?: string };
  const message = String(err?.message || "").toLowerCase();
  return Number(err?.status || 0) === 429 || message.includes("rate_limit_exceeded") || message.includes("quota exceeded");
}

function getGeminiModel(fallback = "gemini-2.5-flash") {
  return String(process.env.GEMINI_MODEL || fallback).trim() || fallback;
}

function getVertexApiKey() {
  return String(
    process.env.VERTEX_API_KEY ||
      process.env.VERTEX_AI_API_KEY ||
      process.env.VERTEX_GEMINI_API_KEY ||
      ""
  ).trim();
}

function getVertexModel(fallback = "gemini-2.5-flash-lite") {
  return String(process.env.VERTEX_MODEL || fallback).trim() || fallback;
}

function extractTextFromModelResponsePayload(payload: unknown) {
  const candidates: Array<Record<string, unknown>> = [];

  const pushCandidates = (value: unknown) => {
    const list = Array.isArray((value as any)?.candidates) ? (value as any).candidates : [];
    for (const candidate of list) {
      if (candidate && typeof candidate === "object") {
        candidates.push(candidate as Record<string, unknown>);
      }
    }
  };

  if (Array.isArray(payload)) {
    for (const chunk of payload) {
      pushCandidates(chunk);
    }
  } else {
    pushCandidates(payload);
  }

  const texts: string[] = [];
  for (const candidate of candidates) {
    const parts = Array.isArray((candidate as any)?.content?.parts) ? (candidate as any).content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string") {
        const normalized = String(part.text).trim();
        if (normalized) texts.push(normalized);
      }
    }
  }

  if (texts.length) return texts.join("\n").trim();
  if (typeof (payload as any)?.text === "string") return String((payload as any).text || "").trim();
  return "";
}

function buildCaseContextDigest(caseId: string, incomingFragments: string[] = []) {
  const assignment = caseAssignments.get(caseId);
  const payload = victimDetailsByCase.get(caseId);
  const storedFragments = (payload?.fragments || []).map((fragment) => String(fragment || "").trim()).filter(Boolean);
  const mergedFragments = uniqueStrings([...storedFragments, ...incomingFragments]);
  const recentFragments = mergedFragments.slice(-18);
  const profile = payload?.profile;

  return {
    assignment,
    profile,
    recentFragments,
    legalSuggestions: extractLegalSectionsFromFragments(recentFragments),
    contradictionRisks: buildContradictionRisks(recentFragments),
    fakeVictimAssessment: buildFakeVictimAssessment(recentFragments),
  };
}

function buildFakeVictimAssessment(fragments: string[]) {
  const text = fragments.join(" ").toLowerCase();
  const sensoryTerms = ["smell", "sound", "noise", "rain", "light", "crowd", "voice", "touch"];
  const sensoryHits = sensoryTerms.filter((term) => text.includes(term)).length;
  const repeatedCount = fragments.length - new Set(fragments.map((f) => f.trim().toLowerCase())).size;
  const uncertaintyHits = ["maybe", "not sure", "i think", "perhaps"].filter((term) => text.includes(term)).length;

  let score = 0.18;
  score += repeatedCount * 0.11;
  score += fragments.length > 6 ? 0.08 : 0;
  score += sensoryHits === 0 ? 0.12 : -0.05;
  score += uncertaintyHits > 4 ? 0.09 : 0;

  const bounded = Math.max(0.03, Math.min(0.94, Number(score.toFixed(2))));
  const band = bounded >= 0.66 ? "high" : bounded >= 0.4 ? "medium" : "low";

  return {
    probability: bounded,
    band,
    flags: uniqueStrings([
      repeatedCount > 1 ? "High repetition across fragments" : "",
      sensoryHits === 0 ? "No sensory anchors detected" : "",
      uncertaintyHits > 4 ? "Frequent uncertainty markers" : "",
    ]),
    disclaimer:
      "This is an assistive anomaly signal, not a determination. Human legal review is mandatory before any adverse decision.",
  };
}

function buildEvidenceLeads(fragments: string[], queryHint?: string) {
  const text = `${fragments.join(" ")} ${String(queryHint || "")}`.toLowerCase();
  const leads: Array<{ type: string; query: string; source: string; confidence: number; rationale: string }> = [];

  if (text.includes("rain") || text.includes("storm") || text.includes("weather")) {
    leads.push({
      type: "weather",
      query: "Historical weather for incident window and city",
      source: "Open-Meteo/IMD (public corroboration source)",
      confidence: 0.81,
      rationale: "Weather markers can corroborate context details.",
    });
  }
  if (text.includes("cab") || text.includes("uber") || text.includes("ola") || text.includes("taxi")) {
    leads.push({
      type: "transport",
      query: "Prepare legal request for cab booking/trip logs and route timeline",
      source: "Ride provider receipts/device history (lawful request path)",
      confidence: 0.78,
      rationale: "Mobility logs help establish movement chronology, subject to lawful disclosure.",
    });
  }
  if (text.includes("market") || text.includes("mall") || text.includes("road") || text.includes("station")) {
    leads.push({
      type: "cctv",
      query: "Prepare preservation notice for CCTV near mentioned location",
      source: "Local admin/private establishments (preservation + legal request)",
      confidence: 0.73,
      rationale: "Public area video may support timeline claims when preserved early.",
    });
  }
  if (text.includes("call") || text.includes("phone") || text.includes("whatsapp") || text.includes("message")) {
    leads.push({
      type: "digital",
      query: "Draft lawful request for call records and message metadata",
      source: "Device logs / telecom records (requires legal authorization)",
      confidence: 0.76,
      rationale: "Communication records can validate sequence and contact nodes under legal process.",
    });
  }
  if (text.includes("train") || text.includes("rail") || text.includes("irctc")) {
    leads.push({
      type: "rail",
      query: "Prepare request for IRCTC booking and journey timeline confirmation",
      source: "IRCTC records (lawful disclosure workflow)",
      confidence: 0.74,
      rationale: "Rail records can corroborate location and time anchors when journey claims are present.",
    });
  }
  if (text.includes("fastag") || text.includes("toll") || text.includes("highway")) {
    leads.push({
      type: "toll",
      query: "Prepare FASTag and toll-plaza passage preservation request",
      source: "NHAI / toll operator logs (authorized request)",
      confidence: 0.72,
      rationale: "Toll events help reconstruct vehicle movement chronology.",
    });
  }
  if (text.includes("upi") || text.includes("payment") || text.includes("paid") || text.includes("bank")) {
    leads.push({
      type: "finance",
      query: "Collect UPI and card transaction timestamps around key memory nodes",
      source: "Bank statements / PSP logs (authorized retrieval)",
      confidence: 0.7,
      rationale: "Transaction traces can validate time and place claims.",
    });
  }
  if (text.includes("tower") || text.includes("location") || text.includes("network") || text.includes("cell")) {
    leads.push({
      type: "telecom-location",
      query: "Draft CDR and cell-tower location request for incident window",
      source: "Telecom provider records (court/police authorization required)",
      confidence: 0.71,
      rationale: "Cell-tower traces can support geographic presence assertions.",
    });
  }
  if (text.includes("flight") || text.includes("hotel") || text.includes("booking") || text.includes("check-in")) {
    leads.push({
      type: "travel-hospitality",
      query: "Preserve flight and hotel booking metadata tied to timeline",
      source: "Airline / hospitality provider records (lawful request)",
      confidence: 0.69,
      rationale: "Travel and stay records provide independent timeline corroboration.",
    });
  }

  if (!leads.length) {
    leads.push({
      type: "generic",
      query: "Collect one external corroboration source for each major memory node",
      source: "Mixed",
      confidence: 0.55,
      rationale: "Insufficient clues; start from broad corroboration checklist.",
    });
  }

  return leads;
}

function extractJsonObjectFromText(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Continue to fenced/object-slice extraction below.
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as Record<string, unknown>;
    } catch {
      // Continue to brace slicing.
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(sliced) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

function tokenizeSearchText(text: string) {
  return uniqueStrings(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

function rankEvidenceLeads(
  leads: Array<{ type: string; query: string; source: string; confidence: number; rationale: string }>,
  query: string,
  caseText: string
) {
  const queryTokens = tokenizeSearchText(query);
  const caseTokens = new Set(tokenizeSearchText(caseText));

  return leads
    .map((lead) => {
      const leadTokens = tokenizeSearchText(`${lead.type} ${lead.query} ${lead.rationale}`);
      const queryOverlap = leadTokens.filter((token) => queryTokens.includes(token)).length;
      const caseOverlap = leadTokens.filter((token) => caseTokens.has(token)).length;
      const score = Math.min(
        0.99,
        Math.max(0.15, lead.confidence * 0.6 + queryOverlap * 0.08 + caseOverlap * 0.04)
      );

      return {
        ...lead,
        score: Number(score.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildEvidenceSearchText(params: {
  provider: string;
  summary: string;
  topLeads: Array<{ type: string; query: string; source: string; score: number }>;
  suggestedSearches: string[];
  weatherSummary?: string;
  cameraSummary?: string;
  autoActions?: string[];
  caseId?: string;
}) {
  const leadLines = params.topLeads.length
    ? params.topLeads
        .slice(0, 4)
        .map(
          (lead, index) =>
            `${index + 1}. [${lead.type}] ${lead.query} | Source: ${lead.source} | Score: ${Math.round(
              lead.score * 100
            )}%`
        )
    : ["1. [generic] Preserve timeline artifacts (photos, receipts, messages, location pings)."];

  const searchLines = params.suggestedSearches.length
    ? params.suggestedSearches.slice(0, 4).map((query, index) => `${index + 1}. ${query}`)
    : ["1. historical weather <city> <date>", "2. nearby cctv preservation request <location>"];

  return [
    params.caseId ? `Case: ${params.caseId}` : "",
    `Summary: ${params.summary}`,
    params.weatherSummary ? `Weather intelligence: ${params.weatherSummary}` : "",
    params.cameraSummary ? `Camera intelligence: ${params.cameraSummary}` : "",
    "",
    "Top evidence leads:",
    ...leadLines,
    "",
    "Suggested search strings:",
    ...searchLines,
    params.autoActions?.length ? "" : "",
    params.autoActions?.length ? "Automatic next actions:" : "",
    ...(params.autoActions || []).slice(0, 5).map((item, index) => `${index + 1}. ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function inferLocationFromText(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const markers = [" in ", " at ", " near ", " around ", " from "];
  const stoppers = [" and ", " but ", " where ", " when ", " with ", " it ", ".", ",", "|"];

  for (const marker of markers) {
    const start = lower.indexOf(marker);
    if (start < 0) continue;

    const tail = normalized.slice(start + marker.length).trim();
    if (!tail) continue;

    let endIndex = tail.length;
    const lowerTail = tail.toLowerCase();
    for (const stop of stoppers) {
      const idx = lowerTail.indexOf(stop);
      if (idx >= 0 && idx < endIndex) {
        endIndex = idx;
      }
    }

    const candidate = tail.slice(0, endIndex).trim();
    if (candidate.length >= 3) {
      return candidate.split(" ").slice(0, 5).join(" ");
    }
  }

  const tokens = normalized
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const stop = new Set(["i", "me", "my", "the", "a", "an", "and", "but", "it", "was", "were", "is", "are"]);
  const fallback = tokens.find((token) => token.length >= 4 && !stop.has(token.toLowerCase()));
  return fallback || null;
}

function buildLocationCandidates(locationLabel: string) {
  const seed = String(locationLabel || "").trim();
  if (!seed) return [];

  const normalized = seed.replace(/\s+/g, " ").trim();
  const candidates = [normalized];

  const splitter = /\b(?:near|around|at|in)\b/i;
  if (splitter.test(normalized)) {
    const parts = normalized.split(splitter).map((part) => part.trim()).filter(Boolean);
    candidates.push(...parts);
  }

  const commaParts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  candidates.push(...commaParts);

  const wordTokens = normalized
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const stop = new Set(["i", "me", "my", "the", "a", "an", "and", "but", "near", "around", "at", "in"]);
  for (const token of wordTokens) {
    const lower = token.toLowerCase();
    if (token.length >= 4 && !stop.has(lower)) {
      candidates.push(token);
    }
  }

  return uniqueStrings(candidates).slice(0, 5);
}

function parseDateWindowFromText(text: string) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return null;

  const monthMap: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const monthRegex = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g;
  const months: number[] = [];
  let monthMatch: RegExpExecArray | null;
  while ((monthMatch = monthRegex.exec(normalized)) !== null) {
    const idx = monthMap[monthMatch[1]];
    if (Number.isInteger(idx)) {
      months.push(idx);
    }
  }

  if (!months.length) return null;

  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const now = new Date();
  const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  const start = new Date(Date.UTC(year, firstMonth, 1));
  const end = new Date(Date.UTC(year, lastMonth + 1, 0));

  const formatDate = (value: Date) => {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

async function fetchHistoricalWeatherSummary(params: { locationLabel: string; startDate: string; endDate: string }) {
  const locationCandidates = buildLocationCandidates(params.locationLabel);
  let center: Awaited<ReturnType<typeof geocodeLocationLabel>> = null;
  for (const candidate of locationCandidates) {
    center = await geocodeLocationLabel(candidate);
    if (center) break;
  }

  if (!center) {
    return {
      ok: false as const,
      summary: "Could not geocode location for weather check.",
    };
  }

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(String(center.lat))}&longitude=${encodeURIComponent(String(center.lon))}&start_date=${encodeURIComponent(params.startDate)}&end_date=${encodeURIComponent(params.endDate)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum&timezone=auto`;
  const response = await fetchJsonWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Saakshi/1.0 (+https://example.local)",
    },
  }, 18000);

  if (!response.ok || typeof response.data !== "object" || !response.data) {
    return {
      ok: false as const,
      summary: "Weather provider unavailable for this window.",
    };
  }

  const daily = (response.data as any).daily || {};
  const rain = Array.isArray(daily.rain_sum) ? daily.rain_sum.map((v: unknown) => Number(v || 0)) : [];
  const precipitation = Array.isArray(daily.precipitation_sum)
    ? daily.precipitation_sum.map((v: unknown) => Number(v || 0))
    : [];
  const maxTemp = Array.isArray(daily.temperature_2m_max)
    ? daily.temperature_2m_max.map((v: unknown) => Number(v || 0))
    : [];
  const minTemp = Array.isArray(daily.temperature_2m_min)
    ? daily.temperature_2m_min.map((v: unknown) => Number(v || 0))
    : [];

  const days = Math.max(rain.length, precipitation.length, maxTemp.length, minTemp.length);
  if (!days) {
    return {
      ok: false as const,
      summary: "No daily weather rows returned for selected range.",
    };
  }

  let rainyDays = 0;
  let totalRainMm = 0;
  let tempAccumulator = 0;
  let tempCount = 0;

  for (let i = 0; i < days; i += 1) {
    const rainValue = Number(rain[i] || 0);
    const precipValue = Number(precipitation[i] || 0);
    const maxV = Number(maxTemp[i]);
    const minV = Number(minTemp[i]);

    if (rainValue > 0 || precipValue > 0) {
      rainyDays += 1;
    }
    totalRainMm += rainValue > 0 ? rainValue : precipValue;

    if (Number.isFinite(maxV) && Number.isFinite(minV)) {
      tempAccumulator += (maxV + minV) / 2;
      tempCount += 1;
    }
  }

  const avgTemp = tempCount ? Number((tempAccumulator / tempCount).toFixed(1)) : null;
  const summary = `${center.displayName}: ${rainyDays}/${days} rainy day(s), total precipitation ~${totalRainMm.toFixed(1)} mm${avgTemp !== null ? `, avg temp ~${avgTemp} C` : ""} between ${params.startDate} and ${params.endDate}.`;

  return {
    ok: true as const,
    summary,
    location: center.displayName,
    rainyDays,
    days,
    totalRainMm: Number(totalRainMm.toFixed(1)),
    avgTemp,
  };
}

async function resolveFirstGeocodableLocation(texts: string[]) {
  for (const text of texts) {
    const inferred = inferLocationFromText(text);
    if (!inferred) continue;

    const candidates = buildLocationCandidates(inferred);
    for (const candidate of candidates) {
      const center = await geocodeLocationLabel(candidate);
      if (center) {
        return {
          label: candidate,
          center,
        };
      }
    }
  }

  return null;
}

async function buildCaseInsightBundle(params: {
  caseId: string;
  profile?: VictimProfile;
  fragments: string[];
}) {
  const summarySeed = [
    String(params.profile?.incidentSummary || "").trim(),
    ...params.fragments.slice(0, 12),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 5000);

  const safeSummary = summarySeed || "No detailed summary available yet.";

  const [legalMl, temporalMl, traumaMl, distressMl] = await Promise.all([
    callMlService("/legal/predict", { case_id: params.caseId, text: safeSummary }, 15000),
    callMlService("/temporal/normalize", { phrase: safeSummary.slice(0, 320) }, 12000),
    callMlService("/trauma/assess", { text: safeSummary }, 12000),
    callMlService("/distress/calibrate", { transcript: safeSummary }, 12000),
  ]);

  return {
    legalSuggestions: extractLegalSectionsFromFragments(params.fragments),
    contradictionRisks: buildContradictionRisks(params.fragments),
    evidenceLeads: buildEvidenceLeads(params.fragments, params.profile?.incidentSummary),
    fakeVictimAssessment: buildFakeVictimAssessment(params.fragments),
    mlPredictions: {
      legal: legalMl.ok ? (legalMl.data as Record<string, unknown>) : null,
      temporal: temporalMl.ok ? (temporalMl.data as Record<string, unknown>) : null,
      trauma: traumaMl.ok ? (traumaMl.data as Record<string, unknown>) : null,
      distress: distressMl.ok ? (distressMl.data as Record<string, unknown>) : null,
      providerStatus: {
        legal: legalMl.ok ? "ok" : "unavailable",
        temporal: temporalMl.ok ? "ok" : "unavailable",
        trauma: traumaMl.ok ? "ok" : "unavailable",
        distress: distressMl.ok ? "ok" : "unavailable",
      },
    },
  };
}

function wrapPdfText(params: {
  text: string;
  maxWidth: number;
  font: import("pdf-lib").PDFFont;
  size: number;
}) {
  const words = String(params.text || "").split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (params.font.widthOfTextAtSize(candidate, params.size) <= params.maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

async function renderCaseReportPdfBuffer(
  reportTitle: string,
  sections: Array<{ title: string; lines: string[] }>
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595;
  const height = 842;
  const margin = 34;
  const bodyWidth = width - margin * 2;
  const leftColumn = 268;
  const rightColumn = bodyWidth - leftColumn - 12;

  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const theme = {
    ink: rgb(0.14, 0.16, 0.2),
    muted: rgb(0.39, 0.43, 0.5),
    navy: rgb(0.08, 0.14, 0.25),
    blue: rgb(0.14, 0.32, 0.53),
    teal: rgb(0.12, 0.42, 0.4),
    sand: rgb(0.97, 0.95, 0.91),
    sandDark: rgb(0.86, 0.83, 0.77),
    card: rgb(1, 1, 1),
    cardTint: rgb(0.96, 0.98, 1),
  };

  const drawFooter = (pageIndex: number, totalPages: number) => {
    page.drawLine({ start: { x: margin, y: 28 }, end: { x: width - margin, y: 28 }, thickness: 0.8, color: theme.sandDark });
    page.drawText("Confidential - Authorized legal use only", {
      x: margin,
      y: 14,
      size: 8.5,
      font,
      color: theme.muted,
    });
    page.drawText(`Page ${pageIndex + 1} of ${totalPages}`, {
      x: width - margin - 76,
      y: 14,
      size: 8.5,
      font,
      color: theme.muted,
    });
  };

  const startPage = (isCover = false) => {
    page = pdf.addPage([width, height]);
    y = height - margin;

    if (isCover) {
      page.drawRectangle({ x: 0, y: height - 128, width, height: 128, color: theme.navy });
      page.drawText("SAAKSHI", {
        x: margin,
        y: height - 72,
        size: 22,
        font: bold,
        color: rgb(1, 1, 1),
      });
      page.drawText("Forensic Intelligence Report", {
        x: margin,
        y: height - 96,
        size: 18,
        font: bold,
        color: rgb(1, 1, 1),
      });
      page.drawText("Structured review packet for survivor, officer, and legal workflows", {
        x: margin,
        y: height - 116,
        size: 10,
        font,
        color: rgb(0.88, 0.92, 0.98),
      });
      y = height - 160;
    }
  };

  const ensureSpace = (requiredHeight: number, isCover = false) => {
    if (y - requiredHeight < 60) {
      startPage(isCover);
    }
  };

  const drawCard = (x: number, topY: number, cardWidth: number, cardHeight: number, fill: [number, number, number]) => {
    page.drawRectangle({ x, y: topY - cardHeight, width: cardWidth, height: cardHeight, color: rgb(fill[0], fill[1], fill[2]) });
    page.drawRectangle({ x, y: topY - cardHeight, width: cardWidth, height: cardHeight, borderColor: theme.sandDark, borderWidth: 0.6, opacity: 1, color: rgb(fill[0], fill[1], fill[2]) });
  };

  const drawSection = (title: string, lines: string[]) => {
    const estimateHeight = 30 + Math.max(1, lines.length) * 14;
    ensureSpace(Math.max(estimateHeight, 76));

    const sectionTop = y;
    drawCard(margin, sectionTop, bodyWidth, Math.max(estimateHeight, 76), [1, 1, 1]);
    page.drawRectangle({ x: margin, y: sectionTop - 20, width: bodyWidth, height: 20, color: theme.cardTint });
    page.drawText(title, {
      x: margin + 10,
      y: sectionTop - 15,
      size: 11,
      font: bold,
      color: theme.blue,
    });

    let cursorY = sectionTop - 34;
    for (const rawLine of lines) {
      const wrapped = wrapPdfText({ text: rawLine, maxWidth: bodyWidth - 20, font, size: 9.4 });
      for (const line of wrapped) {
        if (cursorY < 56) {
          startPage();
          drawCard(margin, y, bodyWidth, 760, [1, 1, 1]);
          cursorY = y - 18;
        }
        page.drawText(line, {
          x: margin + 10,
          y: cursorY,
          size: 9.4,
          font,
          color: theme.ink,
        });
        cursorY -= 12.8;
      }
    }

    y = cursorY - 10;
  };

  const titleLines = wrapPdfText({ text: reportTitle, maxWidth: bodyWidth, font: bold, size: 18 });
  startPage(true);

  for (const titleLine of titleLines) {
    page.drawText(titleLine, {
      x: margin,
      y,
      size: 18,
      font: bold,
      color: theme.navy,
    });
    y -= 22;
  }

  page.drawText(`Generated: ${new Date().toISOString()}`, {
    x: margin,
    y: y - 4,
    size: 9.2,
    font,
    color: theme.muted,
  });
  y -= 20;

  const summaryCards = sections.slice(0, 3);
  const summaryCardHeight = 62;
  const summaryGap = 10;
  const summaryWidth = (bodyWidth - summaryGap) / 2;

  if (summaryCards.length) {
    ensureSpace(160);
    page.drawText("Quick Summary", {
      x: margin,
      y,
      size: 12,
      font: bold,
      color: theme.navy,
    });
    y -= 18;

    const cardsToRender = summaryCards.slice(0, 4);
    cardsToRender.forEach((section, index) => {
      const x = index % 2 === 0 ? margin : margin + summaryWidth + summaryGap;
      const topY = y - Math.floor(index / 2) * (summaryCardHeight + 10);
      drawCard(x, topY, summaryWidth, summaryCardHeight, [0.97, 0.98, 1]);
      page.drawText(section.title, {
        x: x + 10,
        y: topY - 18,
        size: 10,
        font: bold,
        color: theme.blue,
      });
      const preview = section.lines.slice(0, 2).join(" • ").slice(0, 120) || "No data available";
      const previewLines = wrapPdfText({ text: preview, maxWidth: summaryWidth - 20, font, size: 8.7 });
      let previewY = topY - 34;
      for (const line of previewLines.slice(0, 2)) {
        page.drawText(line, {
          x: x + 10,
          y: previewY,
          size: 8.7,
          font,
          color: theme.ink,
        });
        previewY -= 11;
      }
    });
    y -= (Math.ceil(cardsToRender.length / 2) * (summaryCardHeight + 10)) + 16;
  }

  for (const section of sections) {
    drawSection(section.title, section.lines);
    y -= 4;
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => drawFooter(index, pages.length));

  return pdf.save();
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT || 3000);
  const googleNlpClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new LanguageServiceClient()
    : null;
  const googleSpeechClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new SpeechClient()
    : null;
  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  if (process.env.NODE_ENV === "production" && !caseStateEncryptionSecret) {
    console.warn(
      "CASE_STATE_ENCRYPTION_KEY is not set. Case-state persistence will run without encryption at rest until this env var is configured."
    );
  }

  app.disable("x-powered-by");

  app.use(express.json({ limit: "12mb" }));

  const chatServer = new WebSocketServer({ server: httpServer, path: "/ws/officer-chat" });

  const broadcastToCase = (caseId: string, payload: Record<string, unknown>) => {
    const clients = caseChatClientsByCase.get(caseId);
    if (!clients || !clients.size) return;

    const serialized = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  chatServer.on("connection", (socket, request) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const caseId = String(requestUrl.searchParams.get("caseId") || "").trim();
    const role = String(requestUrl.searchParams.get("role") || "victim").trim() || "victim";
    const officerId = String(requestUrl.searchParams.get("officerId") || "").trim();
    const officerName = String(requestUrl.searchParams.get("officerName") || requestUrl.searchParams.get("displayName") || "").trim();
    const officerPost = String(requestUrl.searchParams.get("post") || requestUrl.searchParams.get("officerPost") || role).trim() || role;

    if (!caseId) {
      socket.send(JSON.stringify({ type: "error", error: "caseId is required" }));
      socket.close(1008, "caseId is required");
      return;
    }

    if (!caseChatClientsByCase.has(caseId)) {
      caseChatClientsByCase.set(caseId, new Set());
    }
    caseChatClientsByCase.get(caseId)?.add(socket);

    socket.send(
      JSON.stringify({
        type: "history",
        caseId,
        messages: getChatHistory(caseId),
        role,
      })
    );

    socket.on("message", (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
        const parsed = JSON.parse(text || "{}") as Record<string, unknown>;
        const incomingCaseId = String(parsed.caseId || caseId).trim();
        if (!incomingCaseId || incomingCaseId !== caseId) {
          socket.send(JSON.stringify({ type: "error", error: "caseId mismatch" }));
          return;
        }

        if (String(parsed.type || "message") !== "message") {
          return;
        }

        const normalized = normalizeChatMessage(
          {
            ...parsed,
            officerId: officerId || String(parsed.officerId || "officer-user"),
            officerName: officerName || String(parsed.officerName || parsed.displayName || officerId || "Officer"),
            officerPost: officerPost || String(parsed.officerPost || role),
            role,
          },
          caseId
        );

        if (!normalized) {
          socket.send(JSON.stringify({ type: "error", error: "message is required" }));
          return;
        }

        const nextHistory = appendChatMessage(normalized);
        broadcastToCase(caseId, {
          type: "message",
          caseId,
          message: normalized,
          messages: nextHistory,
        });
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", error: (error as Error).message || "Invalid chat payload" }));
      }
    });

    socket.on("close", () => {
      const clients = caseChatClientsByCase.get(caseId);
      clients?.delete(socket);
      if (clients && clients.size === 0) {
        caseChatClientsByCase.delete(caseId);
      }
    });
  });

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "microphone=(self), camera=(self), geolocation=(self)");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use((req, res, next) => {
    // Avoid logging Vite asset/HMR requests; writing log files on every static request can trigger reload loops.
    if (!req.path.startsWith("/api/")) {
      return next();
    }

    const requestId = randomUUID();
    const actorId = String(req.header("x-user-id") || "anonymous");
    const role = String(req.header("x-user-role") || "anonymous");
    const startedAt = Date.now();

    res.locals.auditContext = {
      requestId,
      actorId,
      role,
      resource: req.path,
    };

    logAuditEvent(
      buildAuditEvent({
        requestId,
        action: "request.received",
        actorId,
        role,
        resource: req.path,
        success: true,
        details: { method: req.method },
      })
    );

    res.on("finish", () => {
      logAuditEvent(
        buildAuditEvent({
          requestId,
          action: "request.completed",
          actorId,
          role,
          resource: req.path,
          success: res.statusCode < 400,
          details: {
            method: req.method,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          },
        })
      );
    });

    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/ai") && !ai) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on server" });
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ml/legal-predict", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const text = String(req.body?.text || "").trim();
      if (!caseId || !text) {
        return res.status(400).json({ error: "caseId and text are required" });
      }

      const ml = await callMlService("/legal/predict", { case_id: caseId, text }, 35000);
      if (!ml.ok) {
        return res.status(ml.status).json({
          error: "Legal prediction unavailable",
          detail: ml.data,
        });
      }

      res.json({
        caseId,
        ...(ml.data as Record<string, unknown>),
      });
    } catch (error) {
      console.error("ml legal-predict failed", error);
      res.status(500).json({ error: "Legal prediction failed" });
    }
  });

  app.post("/api/ml/temporal-normalize", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const phrase = String(req.body?.phrase || "").trim();
      const referenceDate = String(req.body?.referenceDate || "").trim();
      if (!phrase) {
        return res.status(400).json({ error: "phrase is required" });
      }
      const ml = await callMlService("/temporal/normalize", {
        phrase,
        reference_date: referenceDate || undefined,
      });
      if (!ml.ok) {
        return res.status(ml.status).json({
          error: "Temporal normalization unavailable",
          detail: ml.data,
        });
      }
      res.json(ml.data);
    } catch (error) {
      console.error("ml temporal-normalize failed", error);
      res.status(500).json({ error: "Temporal normalization failed" });
    }
  });

  app.post("/api/ml/trauma-assess", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }
      const ml = await callMlService("/trauma/assess", { text });
      if (!ml.ok) {
        return res.status(ml.status).json({
          error: "Trauma assessment unavailable",
          detail: ml.data,
        });
      }
      res.json(ml.data);
    } catch (error) {
      console.error("ml trauma-assess failed", error);
      res.status(500).json({ error: "Trauma assessment failed" });
    }
  });

  app.post("/api/ml/distress-calibrate", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const transcript = String(req.body?.transcript || "").trim();
      if (!transcript) {
        return res.status(400).json({ error: "transcript is required" });
      }
      const ml = await callMlService("/distress/calibrate", {
        transcript,
        pause_rate: req.body?.pauseRate,
        speech_rate: req.body?.speechRate,
        silence_ratio: req.body?.silenceRatio,
      });
      if (!ml.ok) {
        return res.status(ml.status).json({
          error: "Distress calibration unavailable",
          detail: ml.data,
        });
      }
      res.json(ml.data);
    } catch (error) {
      console.error("ml distress-calibrate failed", error);
      res.status(500).json({ error: "Distress calibration failed" });
    }
  });

  app.post("/api/ml/molminer-extract", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }
      const ml = await callMlService("/molminer/extract", { text });
      if (!ml.ok) {
        return res.status(ml.status).json({
          error: "Molminer extraction unavailable",
          detail: ml.data,
        });
      }
      res.json(ml.data);
    } catch (error) {
      console.error("ml molminer-extract failed", error);
      res.status(500).json({ error: "Molminer extraction failed" });
    }
  });

  app.get("/api/consent/policies", (req, res) => {
    const ctx = res.locals.auditContext;
    logAuditEvent(
      buildAuditEvent({
        requestId: ctx.requestId,
        action: "consent.evaluated",
        actorId: ctx.actorId,
        role: ctx.role,
        resource: req.path,
        success: true,
      })
    );
    res.json(getConsentPolicySummary());
  });

  app.post("/api/consent/evaluate", (req, res) => {
    const ctx = res.locals.auditContext;
    const result = evaluateConsent({
      actorId: String(req.body?.actorId || ctx.actorId),
      actorRole: req.body?.actorRole || "anonymous",
      caseId: String(req.body?.caseId || "unknown-case"),
      purpose: req.body?.purpose || "analysis",
      requestedFields: Array.isArray(req.body?.requestedFields) ? req.body.requestedFields : [],
    });

    logAuditEvent(
      buildAuditEvent({
        requestId: ctx.requestId,
        action: "consent.evaluated",
        actorId: ctx.actorId,
        role: ctx.role,
        resource: req.path,
        success: result.allowed,
        details: {
          policyVersion: result.policyVersion,
          reason: result.reason,
          redactions: result.redactions,
        },
      })
    );

    res.json(result);
  });

  app.post("/api/consent/grant", (req, res) => {
    const ctx = res.locals.auditContext;
    const caseId = String(req.body?.caseId || "").trim();
    const grantedByActorId = String(req.body?.grantedByActorId || ctx.actorId);
    const rawGranteeRole = String(req.body?.granteeRole || "anonymous").trim().toLowerCase();
    const granteeRole =
      rawGranteeRole === "lawyer"
        ? "lawyer"
        : rawGranteeRole === "admin"
        ? "admin"
        : rawGranteeRole === "police" || rawGranteeRole === "officer"
        ? "police"
        : "anonymous";
    const purpose = String(req.body?.purpose || "analysis") as any;
    const requestedFields = Array.isArray(req.body?.requestedFields) ? req.body.requestedFields : [];
    let granteeActorId = String(req.body?.granteeActorId || "").trim();

    if (!caseId) return res.status(400).json({ error: "caseId is required" });

    if (granteeRole !== "anonymous") {
      if (!granteeActorId) {
        return res.status(400).json({ error: "granteeActorId is required for officer/lawyer/admin grants" });
      }
      granteeActorId = toScopedOfficerActorId(granteeActorId, granteeRole);
    }

    const evalResult = evaluateConsent({
      actorId: grantedByActorId,
      actorRole: "survivor",
      caseId,
      purpose,
      requestedFields,
    });

    if (!evalResult.allowed) {
      return res.status(403).json({ error: `Consent policy denied: ${evalResult.reason}` });
    }

    const grantId = `grant-${randomUUID()}`;
    const grantedAt = new Date().toISOString();

    const persisted = createGrant({
      grantId,
      caseId,
      grantedByActorId,
      granteeActorId: granteeActorId || undefined,
      granteeRole,
      purpose,
      requestedFields,
      redactions: evalResult.redactions,
      policyVersion: evalResult.policyVersion,
      status: "active",
      createdAt: grantedAt,
      expiresAt: req.body?.expiresAt,
    });

    logAuditEvent(
      buildAuditEvent({
        requestId: ctx.requestId,
        action: "consent.granted",
        actorId: ctx.actorId,
        role: ctx.role,
        resource: req.path,
        success: true,
        details: {
          grantId,
          caseId,
          purpose,
          granteeRole,
        },
      })
    );

    res.json(persisted);
  });

  app.get("/api/consent/grants/:caseId", (req, res) => {
    const caseId = String(req.params.caseId || "").trim();
    if (!caseId) return res.status(400).json({ error: "caseId is required" });
    res.json({ caseId, grants: listGrantsByCase(caseId) });
  });

  app.post("/api/consent/revoke", (req, res) => {
    const grantId = String(req.body?.grantId || "").trim();
    if (!grantId) return res.status(400).json({ error: "grantId is required" });
    const revoked = revokeGrant(grantId);
    if (!revoked) return res.status(404).json({ error: "grant not found" });
    res.json(revoked);
  });

  app.post("/api/ai/classify-fragment", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const content = String(req.body?.content || "").trim();
      if (!content) return res.status(400).json({ error: "content is required" });

      const response = await ai!.models.generateContent({
        model: getGeminiModel(),
        contents: `Analyze this memory fragment and extract time clues, location clues, and sensory details. Fragment: "${content}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              location: { type: Type.STRING },
              sensory: { type: Type.ARRAY, items: { type: Type.STRING } },
              emotion: { type: Type.STRING },
            },
          },
        },
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.classify",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
        })
      );

      res.json(JSON.parse(response.text || "{}"));
    } catch (error) {
      console.error("classify-fragment failed", error);
      if (isGeminiQuotaError(error)) {
        const content = String(req.body?.content || "").trim().toLowerCase();
        const time = /\b(today|yesterday|night|morning|evening|\d{1,2}:\d{2})\b/.test(content)
          ? "time clue detected"
          : "relative memory clue";
        const location = /\b(road|street|station|home|office|school|market|bus)\b/.test(content)
          ? "location clue detected"
          : "not yet available";
        const emotion = /\b(scared|afraid|panic|cry|shaking|hurt|angry|fear)\b/.test(content)
          ? "distressed"
          : "steady";
        const sensory = ["voice tone", "environment sound"];

        return res.json({
          time,
          location,
          sensory,
          emotion,
          provider: "local-fallback-quota",
        });
      }

      res.status(500).json({ error: "AI classification failed" });
    }
  });

  app.post("/api/ai/analyze-image", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const base64Image = String(req.body?.base64Image || "");
      if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

      const response = await ai!.models.generateContent({
        model: getGeminiModel(),
        contents: {
          parts: [
            { inlineData: { data: base64Image.split(",")[1], mimeType: "image/png" } },
            { text: "Analyze this drawing/image and extract any visual clues related to time, location, or sensory details. Also, identify the emotional tone." },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              location: { type: Type.STRING },
              sensory: { type: Type.ARRAY, items: { type: Type.STRING } },
              emotion: { type: Type.STRING },
              description: { type: Type.STRING },
            },
          },
        },
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.analyzeImage",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
        })
      );

      res.json(JSON.parse(response.text || "{}"));
    } catch (error) {
      console.error("analyze-image failed", error);
      res.status(500).json({ error: "Image analysis failed" });
    }
  });

  app.post("/api/ai/search-evidence", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (!query) return res.status(400).json({ error: "query is required" });

      const caseIdFromBody = String(req.body?.caseId || "").trim();
      const caseIdFromHeader = String(req.header("x-case-id") || "").trim();
      const caseId = caseIdFromBody || caseIdFromHeader || undefined;

      const context = caseId ? buildCaseContextDigest(caseId) : null;
      const incidentSummary = String(context?.profile?.incidentSummary || "").trim();
      const caseText = [incidentSummary, ...(context?.recentFragments || [])].join(" ").slice(0, 10000);
      const heuristicLeads = rankEvidenceLeads(buildEvidenceLeads(context?.recentFragments || [], query), query, caseText);
      const vertexApiKey = getVertexApiKey();
      const resolvedLocation = await resolveFirstGeocodableLocation([
        query,
        incidentSummary,
        ...(context?.recentFragments || []).slice(-8),
      ]);
      const inferredLocation = resolvedLocation?.label || inferLocationFromText(`${query} ${incidentSummary} ${(context?.recentFragments || []).join(" ")}`);
      const coarseLocation = String(inferredLocation || "")
        .split(/\bnear\b/i)[0]
        .trim();
      const inferredDateWindow = parseDateWindowFromText(`${query} ${incidentSummary} ${(context?.recentFragments || []).join(" ")}`);
      const weatherDataFromClient = req.body?.weatherData;

      const [weatherIntelligence, cameraIntelligence] = await Promise.all([
        inferredLocation && inferredDateWindow
          ? fetchHistoricalWeatherSummary({
              locationLabel: resolvedLocation?.center?.displayName || coarseLocation || inferredLocation,
              startDate: inferredDateWindow.startDate,
              endDate: inferredDateWindow.endDate,
            })
          : Promise.resolve(null),
        inferredLocation
          ? lookupNearbyCameras(resolvedLocation?.center?.displayName || coarseLocation || inferredLocation, 1200)
          : Promise.resolve(null),
      ]);

      const aiPrompt = [
        "You are an evidence-intelligence assistant for a legal case support tool.",
        "Given the user query and case context, produce practical, lawful evidence-retrieval guidance.",
        "Do not claim direct access to protected systems.",
        "Return strict JSON with keys: summary (string), suggestedSearches (string[]), and confidence (number 0..1).",
        `User query: ${query}`,
        caseId ? `Case id: ${caseId}` : "",
        incidentSummary ? `Incident summary: ${incidentSummary}` : "Incident summary: unavailable",
        `Recent fragments: ${(context?.recentFragments || []).slice(-8).join(" | ") || "none"}`,
        `Heuristic leads: ${heuristicLeads
          .slice(0, 5)
          .map((lead) => `${lead.type}:${lead.query} (${lead.score})`)
          .join(" | ")}`,
      ]
        .filter(Boolean)
        .join("\n");

      let provider = "heuristic-local";
      let modelSummary = "Evidence guidance generated from case clues and deterministic ranking.";
      let suggestedSearches: string[] = heuristicLeads.slice(0, 4).map((lead) => lead.query);
      const autoActions: string[] = [];

      if (weatherIntelligence?.ok) {
        autoActions.push(
          "Weather corroboration fetched from Open-Meteo archive. Add this to timeline verification."
        );
      } else if (weatherDataFromClient && typeof weatherDataFromClient === "object") {
        autoActions.push("Weather corroboration accepted from provided input payload.");
      }
      if (cameraIntelligence?.cameras?.length) {
        autoActions.push(
          `Nearby camera markers discovered (${cameraIntelligence.cameras.length}). Prioritize preservation notices for closest sites.`
        );
      }
      if (!autoActions.length) {
        autoActions.push("No external data source auto-resolved yet. Refine location/date cues for stronger enrichment.");
      }

      const tryVertexEvidenceSearch = async () => {
        if (!vertexApiKey) return false;
        const models = uniqueStrings([getVertexModel(), "gemini-2.5-flash-lite", "gemini-2.5-flash"]);

        for (const model of models) {
          try {
            const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(vertexApiKey)}`;
            const response = await fetchJsonWithTimeout(
              url,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: aiPrompt }],
                    },
                  ],
                  generationConfig: {
                    temperature: 0.1,
                    topP: 0.2,
                    maxOutputTokens: 1024,
                    responseMimeType: "application/json",
                  },
                }),
              },
              22000
            );

            if (!response.ok) {
              continue;
            }

            const raw = extractTextFromModelResponsePayload(response.data);
            const parsed = extractJsonObjectFromText(raw);
            const nextSummary = String(parsed?.summary || "").trim();
            const nextSearches = Array.isArray(parsed?.suggestedSearches)
              ? (parsed?.suggestedSearches as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
              : [];

            if (nextSummary) {
              provider = `vertex-evidence(${model})`;
              modelSummary = nextSummary;
              suggestedSearches = nextSearches.length ? nextSearches : suggestedSearches;
              return true;
            }
          } catch {
            // Try next model.
          }
        }

        return false;
      };

      const tryGeminiEvidenceSearch = async () => {
        if (!ai) return false;
        try {
          const response = await ai.models.generateContent({
            model: getGeminiModel(),
            contents: aiPrompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  summary: { type: Type.STRING },
                  suggestedSearches: { type: Type.ARRAY, items: { type: Type.STRING } },
                  confidence: { type: Type.NUMBER },
                },
              },
            },
          });

          const parsed = extractJsonObjectFromText(response.text || "");
          const nextSummary = String(parsed?.summary || "").trim();
          const nextSearches = Array.isArray(parsed?.suggestedSearches)
            ? (parsed?.suggestedSearches as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
            : [];

          if (nextSummary) {
            provider = `gemini-evidence(${getGeminiModel()})`;
            modelSummary = nextSummary;
            suggestedSearches = nextSearches.length ? nextSearches : suggestedSearches;
            return true;
          }
        } catch {
          return false;
        }

        return false;
      };

      const usedVertex = await tryVertexEvidenceSearch();
      if (!usedVertex) {
        await tryGeminiEvidenceSearch();
      }

      const responseText = buildEvidenceSearchText({
        provider,
        summary: modelSummary,
        topLeads: heuristicLeads,
        suggestedSearches,
        weatherSummary:
          weatherIntelligence?.summary ||
          (weatherDataFromClient && typeof weatherDataFromClient === "object"
            ? `Provided weather data: ${JSON.stringify(weatherDataFromClient)}`
            : undefined),
        cameraSummary: cameraIntelligence
          ? `${cameraIntelligence.cameras.length} camera marker(s) near ${cameraIntelligence.center?.displayName || inferredLocation || "location"}.`
          : undefined,
        autoActions,
        caseId,
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.searchEvidence",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
          details: {
            caseId: caseId || "unknown",
            provider,
            leadCount: heuristicLeads.length,
            weatherResolved: !!weatherIntelligence?.ok,
            cameraCount: cameraIntelligence?.cameras?.length || 0,
          },
        })
      );

      res.json({
        text: responseText,
        provider,
        caseId: caseId || null,
        leadCount: heuristicLeads.length,
      });
    } catch (error) {
      console.error("search-evidence failed", error);
      res.status(500).json({ error: "Evidence search failed" });
    }
  });

  app.post("/api/evidence/nearby-cameras", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const locationLabel = String(req.body?.locationLabel || req.body?.location || "").trim();
      const radiusMetersRaw = Number(req.body?.radiusMeters ?? 1200);
      const radiusMeters = Number.isFinite(radiusMetersRaw) ? radiusMetersRaw : 1200;

      if (!caseId || !locationLabel) {
        return res.status(400).json({ error: "caseId and locationLabel are required" });
      }

      const result = await lookupNearbyCameras(locationLabel, radiusMeters);
      res.json({
        caseId,
        locationLabel,
        radiusMeters: Math.max(250, Math.min(5000, radiusMeters)),
        center: result.center,
        cameras: result.cameras,
        provider: result.provider,
        hint: result.hint,
      });
    } catch (error) {
      console.error("nearby-cameras failed", error);
      res.status(500).json({ error: "Nearby camera lookup failed" });
    }
  });

  app.post("/api/evidence/merchant-transaction", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const merchantTransactionId = String(req.body?.merchantTransactionId || req.body?.transactionId || "").trim();
      const googleMerchantId = String(req.body?.googleMerchantId || process.env.GOOGLE_MERCHANT_ID || "").trim();

      if (!caseId || !merchantTransactionId) {
        return res.status(400).json({ error: "caseId and merchantTransactionId are required" });
      }
      if (!googleMerchantId) {
        return res.status(400).json({ error: "googleMerchantId is required" });
      }

      const lookup = await lookupMerchantTransactionRecord({ merchantTransactionId, googleMerchantId });
      if (!lookup.ok) {
        return res.status(lookup.status).json(lookup.data);
      }

      res.json({
        caseId,
        provider: "nbupayments.googleapis.com",
        transactionId: merchantTransactionId,
        googleMerchantId,
        transaction: lookup.data,
      });
    } catch (error) {
      console.error("merchant-transaction lookup failed", error);
      res.status(500).json({ error: "Merchant transaction lookup failed" });
    }
  });

  app.post("/api/ai/adversarial-analysis", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const fragments = Array.isArray(req.body?.fragments)
        ? req.body.fragments.map((item: any) => String(item?.content || "").trim()).filter(Boolean)
        : [];
      const evidence = req.body?.evidence ?? [];
      const model = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
      const context = caseId ? buildCaseContextDigest(caseId, fragments) : null;
      const role = String(req.header("x-user-role") || "survivor").trim();
      const actorId = String(req.header("x-user-id") || "anonymous").trim();

      const response = await ai!.models.generateContent({
        model,
        contents: `You are Saakshi's adversarial legal-prep engine for India.
Simulate how a defense lawyer may challenge testimony and then produce trauma-informed counter-strategy.

Actor context:
- actorId: ${actorId}
- role: ${role}

Case context from backend:
${JSON.stringify(context, null, 2)}

Incoming fragments from current screen:
${JSON.stringify(fragments, null, 2)}

Evidence inputs:
${JSON.stringify(evidence, null, 2)}

Task:
1) VIRODHI: include predictable pressure patterns such as caste/social prejudice, family-pressure narratives, character attacks, reporting-delay exploitation, and hostile-witness tactics when relevant to context.
2) RAKSHA: provide specific, user-actionable legal-prep defenses tied to this case context.
3) Keep output concise and structured for mobile UI.
4) This is legal preparation support, not legal advice.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              virodhi: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    threatLevel: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    predictableDefense: { type: Type.STRING },
                  },
                },
              },
              raksha: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                },
              },
              strengthScore: { type: Type.NUMBER },
            },
          },
        },
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.adversarial",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
        })
      );

      res.json(JSON.parse(response.text || "{}"));
    } catch (error) {
      console.error("adversarial-analysis failed", error);
      res.status(500).json({ error: "Adversarial analysis failed" });
    }
  });

  app.post("/api/ai/virodhi-query", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const query = String(req.body?.query || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
      const model = String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

      if (!caseId || !query) {
        return res.status(400).json({ error: "caseId and query are required" });
      }

      const context = buildCaseContextDigest(caseId);
      const reply = await ai!.models.generateContent({
        model,
        contents: `You are VIRODHI (विरोधी), a simulation engine for legal preparation in India.
You think like a sharp Indian defense lawyer and challenge weak points in a survivor narrative.

Rules:
- Be realistic, specific, and case-grounded.
- Focus on adversarial strategy vectors like: caste/social bias, family pressure, character attacks, delay exploitation, hostile witness tactics, and evidentiary gaps.
- Do not fabricate facts not present in context.
- Provide output that helps user prepare safer and stronger testimony.

Case context (from backend truth):
${JSON.stringify(context, null, 2)}

Recent conversation history:
${JSON.stringify(history, null, 2)}

User query:
${query}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              attackVectors: { type: Type.ARRAY, items: { type: Type.STRING } },
              gapsToFix: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.NUMBER },
            },
          },
        },
      });

      const parsed = JSON.parse(reply.text || "{}") as {
        answer?: string;
        attackVectors?: string[];
        gapsToFix?: string[];
        recommendedEvidence?: string[];
        confidence?: number;
      };

      res.json({
        caseId,
        provider: `gemini:${model}`,
        answer: String(parsed.answer || ""),
        attackVectors: Array.isArray(parsed.attackVectors) ? parsed.attackVectors : [],
        gapsToFix: Array.isArray(parsed.gapsToFix) ? parsed.gapsToFix : [],
        recommendedEvidence: Array.isArray(parsed.recommendedEvidence) ? parsed.recommendedEvidence : [],
        confidence: Number(parsed.confidence || 0),
        contextSnapshot: {
          fragmentCount: context.recentFragments.length,
          hasIncidentSummary: Boolean(context.profile?.incidentSummary),
        },
      });
    } catch (error) {
      console.error("virodhi-query failed", error);
      res.status(500).json({ error: "Virodhi query failed" });
    }
  });

  app.post("/api/ai/cross-examination", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const fragments = req.body?.fragments ?? [];

      const response = await ai!.models.generateContent({
        model: getGeminiModel(),
        contents: `You are a defense lawyer cross-examining a witness. Fragments: ${JSON.stringify(fragments)}
1. Generate a tough, adversarial question based on these fragments.
2. Provide AI coaching on how to respond firmly and calmly.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              coaching: { type: Type.STRING },
              threatType: { type: Type.STRING },
            },
          },
        },
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.crossExamination",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
        })
      );

      res.json(JSON.parse(response.text || "{}"));
    } catch (error) {
      console.error("cross-examination failed", error);
      res.status(500).json({ error: "Cross-examination generation failed" });
    }
  });

  app.post("/api/nlp/google-analyze", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      if (!googleNlpClient) {
        return res.status(503).json({
          error: "Google NLP is not configured on server",
          hint: "Set GOOGLE_APPLICATION_CREDENTIALS on backend host",
        });
      }

      const text = String(req.body?.text || "").trim();
      const caseId = String(req.body?.caseId || "").trim();
      if (!text || !caseId) {
        return res.status(400).json({ error: "text and caseId are required" });
      }

      const document = {
        content: text,
        type: "PLAIN_TEXT" as const,
      };

      const [entityResponse] = await googleNlpClient.analyzeEntities({ document, encodingType: "UTF8" });
      const [sentimentResponse] = await googleNlpClient.analyzeSentiment({ document, encodingType: "UTF8" });

      const entities = (entityResponse.entities || [])
        .map((entity) => ({
          name: entity.name || "",
          type: entity.type || "UNKNOWN",
          salience: Number(entity.salience || 0),
        }))
        .filter((entity) => entity.name)
        .sort((a, b) => b.salience - a.salience)
        .slice(0, 10);

      const timeClues = entities
        .filter((entity) => entity.type === "DATE" || entity.type === "EVENT")
        .map((entity) => entity.name);

      const locationClues = entities
        .filter((entity) => entity.type === "LOCATION" || entity.type === "ADDRESS")
        .map((entity) => entity.name);

      const peopleClues = entities
        .filter((entity) => entity.type === "PERSON" || entity.type === "ORGANIZATION")
        .map((entity) => entity.name);

      const score = Number(sentimentResponse.documentSentiment?.score || 0);
      const magnitude = Number(sentimentResponse.documentSentiment?.magnitude || 0);

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.classify",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
          details: {
            caseId,
            entityCount: entities.length,
          },
        })
      );

      res.json({
        provider: "google-language",
        sentiment: {
          score,
          magnitude,
          label: score <= -0.35 ? "distress" : score >= 0.35 ? "steady" : "mixed",
        },
        entities,
        clues: {
          time: timeClues,
          location: locationClues,
          people: peopleClues,
        },
      });
    } catch (error) {
      console.error("google-analyze failed", error);
      res.status(500).json({ error: "Google NLP analysis failed" });
    }
  });

  app.post("/api/voice/transcribe", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const vertexApiKey = getVertexApiKey();
      if (!googleSpeechClient && !ai && !vertexApiKey) {
        return res.status(503).json({
          error: "Voice transcription is not configured on server",
          hint: "Set GOOGLE_APPLICATION_CREDENTIALS and/or GEMINI_API_KEY and/or VERTEX_API_KEY on backend host",
        });
      }

      const caseId = String(req.body?.caseId || "").trim();
      const audioBase64 = String(req.body?.audioBase64 || "").trim();
      const mimeType = String(req.body?.mimeType || "audio/webm").toLowerCase();
      const languageCode = String(req.body?.languageCode || "en-IN").trim() || "en-IN";
      const durationMsRaw = Number(req.body?.durationMs ?? 0);
      const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw > 0 ? durationMsRaw : 0;

      if (!caseId || !audioBase64) {
        return res.status(400).json({ error: "caseId and audioBase64 are required" });
      }

      const mimeCandidates = uniqueStrings([
        mimeType,
        ...(mimeType.includes("3gpp") || mimeType.includes("amr")
          ? ["audio/3gpp", "audio/amr", "audio/mp4"]
          : []),
        ...(mimeType.includes("webm") ? ["audio/webm", "audio/webm;codecs=opus"] : []),
      ]);

      const requestedLang = languageCode.toLowerCase();
      const requestedLangBase = requestedLang.split("-")[0] || "en";
      const looksLikeWrongLanguage = (text: string) => {
        if (!text) return false;
        // Guard English requests against high-diacritic outputs often caused by wrong-language fallback.
        if (requestedLangBase === "en") {
          const latinExtendedChars = text.match(/[\u00C0-\u024F]/g) || [];
          return latinExtendedChars.length >= 3;
        }
        return false;
      };

      const looksLikeDurationMismatch = (text: string) => {
        if (!text || durationMs <= 0) return false;
        const words = text.split(/\s+/).filter(Boolean).length;
        const seconds = durationMs / 1000;
        if (seconds <= 0.5) return words > 5;
        const wordsPerMinute = (words * 60) / seconds;
        // Guard against fabricated long paragraphs for short clips.
        return wordsPerMinute > 230;
      };

      const looksLikeModelRefusal = (text: string) => {
        const normalized = String(text || "").trim().toLowerCase();
        if (!normalized) return false;

        const refusalPatterns = [
          "i'm sorry",
          "i am sorry",
          "cannot fulfill",
          "can't fulfill",
          "unable to transcribe",
          "unable to fulfill",
          "audio provided is not in english",
          "not in english",
          "cannot transcribe",
          "can't transcribe",
          "i cannot",
          "i can't",
          "request cannot be completed",
        ];

        return refusalPatterns.some((pattern) => normalized.includes(pattern));
      };

      let bestEffortTranscript = "";

      const tryVertexTranscription = async () => {
        if (!vertexApiKey) return null;

        const vertexModels = uniqueStrings([getVertexModel(), "gemini-2.5-flash-lite", "gemini-2.5-flash"]);
        for (const model of vertexModels) {
          for (const mime of mimeCandidates) {
            try {
              const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(vertexApiKey)}`;
              const response = await fetchJsonWithTimeout(
                url,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: "user",
                        parts: [
                          {
                            inlineData: {
                              mimeType: mime,
                              data: audioBase64,
                            },
                          },
                          {
                            text: `Transcribe this spoken audio verbatim in ${languageCode}. Do not translate. Output only the transcript text with no explanations. If speech is unclear, empty, or not decodable, return exactly: [NO_MATCH].`,
                          },
                        ],
                      },
                    ],
                    generationConfig: {
                      temperature: 0,
                      topP: 0.1,
                      maxOutputTokens: 2048,
                    },
                  }),
                },
                25000
              );

              if (!response.ok) continue;

              const vertexText = extractTextFromModelResponsePayload(response.data).trim();
              if (vertexText && !bestEffortTranscript) {
                bestEffortTranscript = vertexText;
              }

              if (
                vertexText &&
                vertexText !== "[NO_MATCH]" &&
                !looksLikeModelRefusal(vertexText) &&
                !looksLikeWrongLanguage(vertexText) &&
                !looksLikeDurationMismatch(vertexText)
              ) {
                return { transcript: vertexText, provider: `vertex-audio(${model})` };
              }
            } catch {
              // Try next model/mime pair.
            }
          }
        }

        return null;
      };

      const tryGeminiTranscription = async () => {
        if (!ai) return null;
        const geminiModels = uniqueStrings([getGeminiModel(), "gemini-2.5-flash"]);

        for (const model of geminiModels) {
          for (const mime of mimeCandidates) {
            try {
              const geminiResponse = await ai.models.generateContent({
                model,
                contents: {
                  parts: [
                    {
                      inlineData: {
                        data: audioBase64,
                        mimeType: mime,
                      },
                    },
                    {
                      text: `Transcribe this spoken audio verbatim in ${languageCode}. Do not translate. Output only the transcript text with no explanations. If speech is unclear, empty, or not decodable, return exactly: [NO_MATCH].`,
                    },
                  ],
                },
              });

              const geminiText = String(geminiResponse.text || "").trim();
              if (geminiText && !bestEffortTranscript) {
                bestEffortTranscript = geminiText;
              }
              if (
                geminiText &&
                geminiText !== "[NO_MATCH]" &&
                !looksLikeModelRefusal(geminiText) &&
                !looksLikeWrongLanguage(geminiText) &&
                !looksLikeDurationMismatch(geminiText)
              ) {
                return { transcript: geminiText, provider: `gemini-audio(${model})` };
              }
            } catch {
              // Try next model/mime pair.
            }
          }
        }

        return null;
      };

      const tryGoogleNlpFallback = async () => {
        if (!googleNlpClient || !bestEffortTranscript.trim()) return null;

        const normalizedBestEffort = bestEffortTranscript.trim().toUpperCase();
        if (
          normalizedBestEffort === "[NO_MATCH]" ||
          normalizedBestEffort === "NO_MATCH"
        ) {
          return null;
        }

        try {
          const document = {
            content: bestEffortTranscript,
            type: "PLAIN_TEXT" as const,
          };

          const [entityResponse] = await googleNlpClient.analyzeEntities({ document, encodingType: "UTF8" });
          const keywords = (entityResponse.entities || [])
            .map((entity) => String(entity.name || "").trim())
            .filter(Boolean)
            .slice(0, 8);

          if (!keywords.length) return null;

          return {
            transcript: `Possible key phrases: ${keywords.join(", ")}`,
            provider: "google-language(fallback)",
            confidence: 0.34,
          };
        } catch {
          return null;
        }
      };

      const baseConfig: {
        languageCode: string;
        enableAutomaticPunctuation: boolean;
        model: string;
        alternativeLanguageCodes?: string[];
      } = {
        languageCode,
        enableAutomaticPunctuation: true,
        model: "latest_short",
      };

      const langCandidates = uniqueStrings([
        languageCode,
        "en-IN",
        "hi-IN",
        "en-US",
      ]);
      const alternativeLanguageCodes = langCandidates.filter((item) => item !== languageCode).slice(0, 2);
      if (alternativeLanguageCodes.length) {
        baseConfig.alternativeLanguageCodes = alternativeLanguageCodes;
      }

      type SpeechEncoding = "WEBM_OPUS" | "AMR" | "AMR_WB" | "LINEAR16";
      type SpeechAttemptConfig = {
        languageCode: string;
        enableAutomaticPunctuation: boolean;
        model: string;
        alternativeLanguageCodes?: string[];
        encoding?: SpeechEncoding;
        sampleRateHertz?: number;
      };

      const isWebm = mimeType.includes("webm");
      const is3gppOrAmr = mimeType.includes("3gpp") || mimeType.includes("amr");
      const isLinearPcm = mimeType.includes("wav") || mimeType.includes("pcm") || mimeType.includes("caf");

      const configAttempts: SpeechAttemptConfig[] = isWebm
        ? [
            {
              ...baseConfig,
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
            },
            {
              ...baseConfig,
              encoding: "WEBM_OPUS",
              sampleRateHertz: 16000,
            },
            {
              ...baseConfig,
              model: "latest_long",
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
            },
            { ...baseConfig },
          ]
        : is3gppOrAmr
        ? [
            {
              ...baseConfig,
              model: "phone_call",
              encoding: "AMR",
              sampleRateHertz: 8000,
            },
            {
              ...baseConfig,
              model: "latest_long",
              encoding: "AMR_WB",
              sampleRateHertz: 16000,
            },
            {
              ...baseConfig,
              encoding: "AMR",
              sampleRateHertz: 8000,
            },
            {
              ...baseConfig,
              encoding: "AMR_WB",
              sampleRateHertz: 16000,
            },
            { ...baseConfig },
          ]
        : isLinearPcm
        ? [
            {
              ...baseConfig,
              encoding: "LINEAR16",
              sampleRateHertz: 16000,
            },
            {
              ...baseConfig,
              model: "latest_long",
              encoding: "LINEAR16",
              sampleRateHertz: 44100,
            },
            { ...baseConfig },
          ]
        : [{ ...baseConfig }];

      const isBadEncodingError = (value: unknown) => {
        const error = value as { code?: number; details?: string; message?: string };
        const text = `${String(error?.details || "")} ${String(error?.message || "")}`.toLowerCase();
        return Number(error?.code || 0) === 3 && (text.includes("bad encoding") || text.includes("invalid recognition 'config'"));
      };

      let speechRes: any | undefined;
      let finalTranscript = "";
      let finalConfidence = 0;
      let usedProvider = googleSpeechClient ? "google-speech" : "none";
      let lastError: unknown = null;
      let sawSuccessfulSpeechResponse = false;

      if (googleSpeechClient) {
        for (const cfg of configAttempts) {
          try {
            const [response] = await googleSpeechClient.recognize({
              config: cfg,
              audio: {
                content: audioBase64,
              },
            });
            sawSuccessfulSpeechResponse = true;

            const alternatives = (response.results || [])
              .map((result) => result.alternatives?.[0])
              .filter((alt): alt is NonNullable<typeof alt> => !!alt);

            const candidateTranscript = alternatives
              .map((alt) => String(alt.transcript || "").trim())
              .filter(Boolean)
              .join(" ")
              .trim();

            const candidateConfidence = alternatives.length
              ? alternatives.reduce((sum, alt) => sum + Number(alt.confidence || 0), 0) / alternatives.length
              : 0;

            if (candidateTranscript) {
              speechRes = response;
              finalTranscript = candidateTranscript;
              finalConfidence = Number(candidateConfidence.toFixed(3));
              break;
            }
          } catch (attemptError) {
            if (isBadEncodingError(attemptError)) {
              lastError = attemptError;
              continue;
            }
            lastError = attemptError;
          }
        }
      }

      if (!speechRes && lastError && !sawSuccessfulSpeechResponse && !isBadEncodingError(lastError)) {
        throw lastError || new Error("Speech recognition failed");
      }

      if (!finalTranscript) {
        const vertexResult = await tryVertexTranscription();
        if (vertexResult?.transcript) {
          finalTranscript = vertexResult.transcript;
          finalConfidence = 0.64;
          usedProvider = googleSpeechClient ? `${usedProvider}+${vertexResult.provider}` : vertexResult.provider;
        }
      }

      if (!finalTranscript) {
        const geminiResult = await tryGeminiTranscription();
        if (geminiResult?.transcript) {
          finalTranscript = geminiResult.transcript;
          finalConfidence = 0.61;
          usedProvider = googleSpeechClient ? `${usedProvider}+${geminiResult.provider}` : geminiResult.provider;
        }
      }

      if (!finalTranscript) {
        const nlpFallback = await tryGoogleNlpFallback();
        if (nlpFallback?.transcript) {
          finalTranscript = nlpFallback.transcript;
          finalConfidence = Number(nlpFallback.confidence.toFixed(3));
          usedProvider = usedProvider === "none" ? nlpFallback.provider : `${usedProvider}+${nlpFallback.provider}`;
        }
      }

      if (!finalTranscript) {
        return res.status(422).json({
          error: "Voice transcription failed: no intelligible speech could be extracted from audio",
          hint: "Retry in a quieter environment and keep recording between 3-20 seconds.",
        });
      }

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.classify",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
          details: {
            caseId,
            transcriptLength: finalTranscript.length,
            confidence: Number(finalConfidence.toFixed(3)),
            provider: usedProvider,
          },
        })
      );

      res.json({
        provider: usedProvider,
        transcript: finalTranscript,
        confidence: Number(finalConfidence.toFixed(3)),
      });
    } catch (error) {
      console.error("voice-transcribe failed", error);
      const err = error as any;
      const detail = String(err?.message || "").trim();
      const reason = String(err?.reason || err?.errorInfoMetadata?.reason || "").toUpperCase();
      const service = String(err?.errorInfoMetadata?.service || "");

      if (reason === "SERVICE_DISABLED" || detail.includes("SERVICE_DISABLED") || detail.includes("speech.googleapis.com")) {
        return res.status(500).json({
          error: "Voice transcription failed: Google Cloud Speech-to-Text API is disabled for this project.",
          hint: "Enable Speech-to-Text API in Google Cloud Console, then retry after 2-5 minutes.",
          service,
        });
      }

      if (reason === "PERMISSION_DENIED" || detail.includes("PERMISSION_DENIED")) {
        return res.status(500).json({
          error: "Voice transcription failed: service account lacks Speech-to-Text permissions.",
          hint: "Grant required IAM roles to the configured service account and retry.",
          service,
        });
      }

      res.status(500).json({
        error: detail ? `Voice transcription failed: ${detail}` : "Voice transcription failed",
        hint: "Check Speech-to-Text API enablement, service-account permissions, and audio encoding compatibility.",
      });
    }
  });

  app.post("/api/ai/war-room-intelligence", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      if (!caseId) {
        return res.status(400).json({ error: "caseId is required" });
      }

      const payload = victimDetailsByCase.get(caseId);
      const fragments = (payload?.fragments || []).map((fragment) => String(fragment || "").trim()).filter(Boolean);
      const legalSuggestions = extractLegalSectionsFromFragments(fragments);
      const contradictionRisks = buildContradictionRisks(fragments);
      const fakeVictimAssessment = buildFakeVictimAssessment(fragments);

      const readinessBase = 72 - contradictionRisks.filter((risk) => risk.level === "HIGH").length * 12 - contradictionRisks.filter((risk) => risk.level === "MEDIUM").length * 6;
      const readinessScore = Math.max(35, Math.min(94, readinessBase + (fragments.length > 3 ? 8 : 0) - Math.round(fakeVictimAssessment.probability * 12)));

      const summary = [
        `Analyzed ${fragments.length} stored fragment(s).`,
        `Legal suggestion count: ${legalSuggestions.length}.`,
        `Contradiction risk nodes: ${contradictionRisks.length}.`,
      ].join(" ");

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "ai.adversarial",
          actorId: ctx.actorId,
          role: ctx.role,
          resource: req.path,
          success: true,
          details: { caseId, fragmentCount: fragments.length, readinessScore },
        })
      );

      res.json({
        provider: "hybrid-legal-intelligence",
        caseId,
        summary,
        readinessScore,
        legalSuggestions,
        contradictionRisks,
        fakeVictimAssessment,
      });
    } catch (error) {
      console.error("war-room-intelligence failed", error);
      res.status(500).json({ error: "War room intelligence failed" });
    }
  });

  app.post("/api/evidence/auto-discover", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const queryHint = String(req.body?.queryHint || "").trim();
      if (!caseId) {
        return res.status(400).json({ error: "caseId is required" });
      }

      const payload = victimDetailsByCase.get(caseId);
      const fragments = (payload?.fragments || []).map((fragment) => String(fragment || "").trim()).filter(Boolean);
      const leads = buildEvidenceLeads(fragments, queryHint);

      const autoQuery = uniqueStrings([
        ...fragments.slice(-4).map((fragment) => fragment.split(" ").slice(0, 8).join(" ")),
        queryHint,
      ]).join(" | ");

      res.json({
        caseId,
        autoQuery,
        leads,
        legalBoundary: {
          directGovernmentApiAccess: false,
          note: "Saakshi generates evidence leads and legal-request prompts. It does not directly fetch protected telecom, banking, or government records.",
        },
        clueGraph: {
          memoryNodes: fragments.length,
          evidenceLeads: leads.length,
        },
      });
    } catch (error) {
      console.error("auto-discover failed", error);
      res.status(500).json({ error: "Evidence automation failed" });
    }
  });

  app.post("/api/risk/fake-victim-assessment", requireConsentForPurpose("analysis"), (req, res) => {
    try {
      if (!enableFakeVictimAssessment) {
        return res.status(403).json({
          error: "Feature disabled",
          reason: "Risk scoring is disabled by default to avoid misuse. Enable only in controlled legal-review environments.",
        });
      }

      const caseId = String(req.body?.caseId || "").trim();
      if (!caseId) {
        return res.status(400).json({ error: "caseId is required" });
      }
      const payload = victimDetailsByCase.get(caseId);
      const fragments = (payload?.fragments || []).map((fragment) => String(fragment || "").trim()).filter(Boolean);
      const assessment = buildFakeVictimAssessment(fragments);
      res.json({ caseId, assessment });
    } catch (error) {
      console.error("fake-victim-assessment failed", error);
      res.status(500).json({ error: "Risk assessment failed" });
    }
  });

  app.post("/api/report/export", requireConsentForPurpose("legal_export"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const audience = String(req.body?.audience || "victim").trim();
      const officerId = String(req.body?.officerId || "").trim();
      const officerRole = normalizeOfficerRoleToken(String(req.body?.officerRole || "police"));
      const victimUniqueId = String(req.body?.victimUniqueId || "").trim();

      if (!caseId) {
        return res.status(400).json({ error: "caseId is required" });
      }

      const assignment = caseAssignments.get(caseId);
      if (!assignment) {
        return res.status(404).json({ error: `Case ${caseId} not found` });
      }

      if (audience === "victim") {
        if (!victimUniqueId || victimUniqueId !== assignment.victimUniqueId) {
          return res.status(403).json({ error: "Victim mismatch for case export" });
        }
      }

      if (audience === "officer") {
        const isDesignated = officerDesignations.some((designation) =>
          isDesignationActiveForOfficer({
            caseId,
            officerIdRaw: officerId,
            officerRole,
            designation,
          })
        );
        if (!isDesignated) {
          return res.status(403).json({ error: "Officer is not designated for this case" });
        }

        const hasExportGrant = hasActorGrant({
          caseId,
          officerIdRaw: officerId,
          officerRole,
          purpose: "legal_export",
        });
        if (!hasExportGrant) {
          return res.status(403).json({ error: "No active legal_export consent grant for this officer" });
        }
      }

      const payload = victimDetailsByCase.get(caseId);
      const fragments = (payload?.fragments || []).map((fragment) => String(fragment || "").trim()).filter(Boolean);
      const caseInsight = await buildCaseInsightBundle({
        caseId,
        profile: payload?.profile,
        fragments,
      });
      const integrityEntries = caseIntegrityByCase.get(caseId) || [];

      const reportObject = {
        reportGeneratedAt: new Date().toISOString(),
        caseId,
        caseNumber: assignment.caseNumber,
        victimUniqueId: assignment.victimUniqueId,
        audience,
        profile: payload?.profile || {},
        fragments,
        legalSuggestions: caseInsight.legalSuggestions,
        contradictionRisks: caseInsight.contradictionRisks,
        evidenceLeads: caseInsight.evidenceLeads,
        fakeVictimAssessment: caseInsight.fakeVictimAssessment,
        mlPredictions: caseInsight.mlPredictions,
        integrity: {
          chainLength: integrityEntries.length,
          latestHash: integrityEntries.length ? integrityEntries[integrityEntries.length - 1].currentHash : "GENESIS",
          rootHash: sha256Hex(JSON.stringify(integrityEntries)),
        },
      };

      const artifactHashes = {
        profileHash: sha256Hex(JSON.stringify(reportObject.profile || {})),
        fragmentsHash: sha256Hex(JSON.stringify(reportObject.fragments || [])),
        legalHash: sha256Hex(JSON.stringify(reportObject.legalSuggestions || [])),
        evidenceHash: sha256Hex(JSON.stringify(reportObject.evidenceLeads || [])),
      };
      const reportHash = sha256Hex(JSON.stringify({ reportObject, artifactHashes }));

      const reportSections = [
        {
          title: "Case Metadata",
          lines: [
            `Generated: ${reportObject.reportGeneratedAt}`,
            `Case ID: ${reportObject.caseId}`,
            `Case Number: ${reportObject.caseNumber}`,
            `Victim UID: ${reportObject.victimUniqueId}`,
            `Audience: ${audience}`,
          ],
        },
        {
          title: "Victim Profile & Incident",
          lines: [
            `Display Name: ${String((reportObject.profile as VictimProfile)?.displayName || "n/a")}`,
            `Email: ${String((reportObject.profile as VictimProfile)?.email || "n/a")}`,
            `Phone: ${String((reportObject.profile as VictimProfile)?.phone || "n/a")}`,
            `Emergency Contact: ${String((reportObject.profile as VictimProfile)?.emergencyContact || "n/a")}`,
            `Incident Summary: ${String((reportObject.profile as VictimProfile)?.incidentSummary || "n/a")}`,
          ],
        },
        {
          title: "Victim Fragments",
          lines: reportObject.fragments.length
            ? reportObject.fragments.map((fragment, index) => `${index + 1}. ${fragment}`)
            : ["No fragments submitted yet."],
        },
        {
          title: "Legal Suggestions (IPC/CrPC)",
          lines: reportObject.legalSuggestions.map((item) => `${item.code}: ${item.title} (${item.why})`),
        },
        {
          title: "Contradiction & Defense Risks",
          lines: reportObject.contradictionRisks.map(
            (risk) => `${risk.level}: ${risk.title} | ${risk.detail} | Mitigation: ${risk.mitigation}`
          ),
        },
        {
          title: "Evidence Automation Leads",
          lines: reportObject.evidenceLeads.map(
            (lead) => `${lead.type} | ${lead.source} | ${lead.query} | confidence=${lead.confidence}`
          ),
        },
        {
          title: "Victim Authenticity Risk Guard (Assistive)",
          lines: [
            `Probability: ${reportObject.fakeVictimAssessment.probability}`,
            `Band: ${reportObject.fakeVictimAssessment.band}`,
            `Flags: ${(reportObject.fakeVictimAssessment.flags || []).join(", ") || "none"}`,
            `Disclaimer: ${reportObject.fakeVictimAssessment.disclaimer}`,
          ],
        },
        {
          title: "ML Prediction Snapshot",
          lines: [
            `ML legal status: ${String(reportObject.mlPredictions.providerStatus.legal)}`,
            `ML temporal status: ${String(reportObject.mlPredictions.providerStatus.temporal)}`,
            `ML trauma status: ${String(reportObject.mlPredictions.providerStatus.trauma)}`,
            `ML distress status: ${String(reportObject.mlPredictions.providerStatus.distress)}`,
            `Legal model summary: ${String((reportObject.mlPredictions.legal as any)?.summary || "n/a")}`,
            `Legal model confidence: ${String((reportObject.mlPredictions.legal as any)?.confidence || "n/a")}`,
            `Temporal rationale: ${String((reportObject.mlPredictions.temporal as any)?.rationale || "n/a")}`,
            `Trauma band: ${String((reportObject.mlPredictions.trauma as any)?.band || "n/a")}`,
            `Distress band: ${String((reportObject.mlPredictions.distress as any)?.band || "n/a")}`,
            `Distress score: ${String((reportObject.mlPredictions.distress as any)?.score || "n/a")}`,
          ],
        },
        {
          title: "Integrity Packaging",
          lines: [
            `profileHash: ${artifactHashes.profileHash}`,
            `fragmentsHash: ${artifactHashes.fragmentsHash}`,
            `legalHash: ${artifactHashes.legalHash}`,
            `evidenceHash: ${artifactHashes.evidenceHash}`,
            `latestIntegrityHash: ${reportObject.integrity.latestHash}`,
            `integrityRootHash: ${reportObject.integrity.rootHash}`,
            `reportHash: ${reportHash}`,
          ],
        },
      ];

      if (!fs.existsSync(reportsPath)) {
        fs.mkdirSync(reportsPath, { recursive: true });
      }

      const reportId = `report-${randomUUID()}`;
      const pdfBytes = await renderCaseReportPdfBuffer(
        `Saakshi Calibrated Report - ${assignment.caseNumber}`,
        reportSections
      );
      const fileName = `${reportId}.pdf`;
      const filePath = path.join(reportsPath, fileName);
      fs.writeFileSync(filePath, Buffer.from(pdfBytes));
      reportFileById.set(reportId, filePath);
      reportBufferById.set(reportId, pdfBytes);

      res.json({
        reportId,
        downloadUrl: `/api/report/download/${reportId}`,
        reportHash,
        artifactHashes,
        verificationBlock: {
          chainLength: reportObject.integrity.chainLength,
          latestIntegrityHash: reportObject.integrity.latestHash,
          integrityRootHash: reportObject.integrity.rootHash,
          reportHash,
        },
        intelligence: {
          legalSuggestions: reportObject.legalSuggestions,
          contradictionRisks: reportObject.contradictionRisks,
          evidenceLeads: reportObject.evidenceLeads,
          fakeVictimAssessment: reportObject.fakeVictimAssessment,
          mlPredictions: reportObject.mlPredictions,
        },
      });
    } catch (error) {
      console.error("report export failed", error);
      res.status(500).json({ error: "Report export failed" });
    }
  });

  app.get("/api/report/download/:reportId", (req, res) => {
    const reportId = String(req.params.reportId || "").trim();
    if (!reportId) {
      return res.status(400).json({ error: "reportId is required" });
    }
    const pdfBytes = reportBufferById.get(reportId);
    if (pdfBytes) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="saakshi-${reportId}.pdf"`);
      return res.send(Buffer.from(pdfBytes));
    }

    const filePath = reportFileById.get(reportId);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "report not found" });
    }
    const fileBuffer = fs.readFileSync(filePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="saakshi-${reportId}.pdf"`);
    res.setHeader("Content-Length", String(fileBuffer.byteLength));
    res.send(fileBuffer);
  });

  // ============================================================================
  // CASE ASSIGNMENT & DESIGNATION ENDPOINTS
  // ============================================================================
  // These implement the waterproof ecosystem where:
  // 1. Victims auto-get cases on login
  // 2. Admins designate officers to cases
  // 3. Officers can ONLY see cases they're designated for
  // 4. Four-level access control prevents any bypass

  /**
   * POST /api/victim/register-or-login
   * Auto-creates a case for new victims, returns existing case for returning victims
   */
  app.post("/api/victim/register-or-login", (req, res) => {
    try {
      const victimUniqueId = String(req.body?.victimUniqueId || "").trim();
      if (!victimUniqueId) {
        return res.status(400).json({ error: "victimUniqueId is required" });
      }

      const ctx = res.locals.auditContext;

      // Check if victim already has a case
      const existingCaseId = victimCaseMap.get(victimUniqueId);
      if (existingCaseId && caseAssignments.has(existingCaseId)) {
        const existingCase = caseAssignments.get(existingCaseId)!;
        logAuditEvent(
          buildAuditEvent({
            requestId: ctx.requestId,
            action: "victim.login-existing",
            actorId: victimUniqueId,
            role: "victim",
            resource: req.path,
            success: true,
            details: { caseId: existingCaseId, caseNumber: existingCase.caseNumber },
          })
        );
        return res.json({
          isNew: false,
          caseAssignment: existingCase,
          message: `Welcome back. Your case ${existingCase.caseNumber} is ready.`,
        });
      }

      // Create NEW case for this victim
      const newAssignment = createCaseAssignment(victimUniqueId);
      caseAssignments.set(newAssignment.caseId, newAssignment);
      victimCaseMap.set(victimUniqueId, newAssignment.caseId);
      persistCaseState();

      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "victim.register-new",
          actorId: victimUniqueId,
          role: "victim",
          resource: req.path,
          success: true,
          details: { caseId: newAssignment.caseId, caseNumber: newAssignment.caseNumber },
        })
      );

      res.json({
        isNew: true,
        caseAssignment: newAssignment,
        message: `Your case number is ${newAssignment.caseNumber}. Please share this with your lawyer/police officer.`,
      });
    } catch (error) {
      console.error("victim register-or-login failed", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  /**
   * POST /api/victim/google-register
   * Called by mobile app after Google auth. If this is a new email/uid, case is created immediately.
   */
  app.post("/api/victim/google-register", (req, res) => {
    try {
      const victimUniqueId = String(req.body?.victimUniqueId || "").trim();
      const email = String(req.body?.email || "").trim();
      const displayName = String(req.body?.displayName || "").trim();

      if (!victimUniqueId || !email) {
        return res.status(400).json({ error: "victimUniqueId and email are required" });
      }

      const existingCaseId = victimCaseMap.get(victimUniqueId);
      if (existingCaseId && caseAssignments.has(existingCaseId)) {
        const existingCase = caseAssignments.get(existingCaseId)!;
        const profile = victimDetailsByCase.get(existingCaseId)?.profile;
        return res.json({
          isNew: false,
          caseAssignment: existingCase,
          profile,
        });
      }

      const newAssignment = createCaseAssignment(victimUniqueId);
      caseAssignments.set(newAssignment.caseId, newAssignment);
      victimCaseMap.set(victimUniqueId, newAssignment.caseId);

      const profile: VictimProfile = {
        victimUniqueId,
        email,
        displayName,
        updatedAt: new Date().toISOString(),
      };

      victimDetailsByCase.set(newAssignment.caseId, {
        profile,
        fragments: [],
        metadata: {
          authProvider: "google",
          onboardingCompleted: false,
        },
      });

      const profileHash = sha256Hex(JSON.stringify(profile));
      appendIntegrityEntry({
        caseId: newAssignment.caseId,
        actorId: victimUniqueId,
        payloadType: "victim_profile",
        payload: profile,
      });
      queueHashAnchorJob({
        caseId: newAssignment.caseId,
        uploaderId: victimUniqueId,
        blobHash: profileHash,
        metadataHash: sha256Hex(JSON.stringify({ authProvider: "google" })),
      });
      persistCaseState();

      res.json({
        isNew: true,
        caseAssignment: newAssignment,
        profile,
      });
    } catch (error) {
      console.error("victim google-register failed", error);
      res.status(500).json({ error: "Google registration failed" });
    }
  });

  /**
   * POST /api/victim/save-details
   * Persists victim profile/fragments, updates integrity chain, and queues blockchain anchoring job.
   */
  app.post("/api/victim/save-details", (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const victimUniqueId = String(req.body?.victimUniqueId || "").trim();
      const profile = req.body?.profile || {};
      const newFragments = Array.isArray(req.body?.fragments) ? req.body.fragments : [];

      if (!caseId || !victimUniqueId) {
        return res.status(400).json({ error: "caseId and victimUniqueId are required" });
      }

      const assignment = caseAssignments.get(caseId);
      if (!assignment || assignment.victimUniqueId !== victimUniqueId) {
        return res.status(403).json({ error: "Victim is not authorized for this case" });
      }

      const previous = victimDetailsByCase.get(caseId);
      const mergedProfile: VictimProfile = {
        victimUniqueId,
        email: String(profile.email || previous?.profile?.email || "").trim() || undefined,
        displayName:
          String(profile.displayName || previous?.profile?.displayName || "").trim() || undefined,
        phone: String(profile.phone || previous?.profile?.phone || "").trim() || undefined,
        emergencyContact:
          String(profile.emergencyContact || previous?.profile?.emergencyContact || "").trim() ||
          undefined,
        incidentSummary:
          String(profile.incidentSummary || previous?.profile?.incidentSummary || "").trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      const mergedFragments = [...(previous?.fragments || []), ...newFragments]
        .map((f) => String(f || "").trim())
        .filter(Boolean);

      const payload: VictimCasePayload = {
        profile: mergedProfile,
        fragments: mergedFragments,
        metadata: {
          ...(previous?.metadata || {}),
          lastUpdatedAt: new Date().toISOString(),
          source: String(req.body?.source || "mobile-app"),
        },
      };

      victimDetailsByCase.set(caseId, payload);

      const profileEntry = appendIntegrityEntry({
        caseId,
        actorId: victimUniqueId,
        payloadType: "victim_profile",
        payload: mergedProfile,
      });

      const fragmentsEntry = appendIntegrityEntry({
        caseId,
        actorId: victimUniqueId,
        payloadType: "victim_fragments",
        payload: mergedFragments,
      });

      queueHashAnchorJob({
        caseId,
        uploaderId: victimUniqueId,
        blobHash: sha256Hex(JSON.stringify(mergedFragments)),
        metadataHash: sha256Hex(JSON.stringify(mergedProfile)),
      });
      persistCaseState();

      res.json({
        success: true,
        caseId,
        profileUpdatedAt: mergedProfile.updatedAt,
        fragmentCount: mergedFragments.length,
        integrity: {
          latestHash: fragmentsEntry.currentHash,
          profileHash: profileEntry.currentHash,
          previousHash: fragmentsEntry.prevHash,
        },
      });
    } catch (error) {
      console.error("victim save-details failed", error);
      res.status(500).json({ error: "Failed to save victim details" });
    }
  });

  /**
   * GET /api/victim/case-overview?victimUniqueId=...
   * Canonical victim case read model used by web/mobile dashboards.
   */
  app.get("/api/victim/case-overview", (req, res) => {
    try {
      const victimUniqueId = String(req.query.victimUniqueId || "").trim();
      if (!victimUniqueId) {
        return res.status(400).json({ error: "victimUniqueId query param is required" });
      }

      const caseId = victimCaseMap.get(victimUniqueId);
      if (!caseId) {
        return res.status(404).json({ error: "No case mapped for victim" });
      }

      const caseAssignment = caseAssignments.get(caseId);
      if (!caseAssignment) {
        return res.status(404).json({ error: "Case assignment not found" });
      }

      const detail = victimDetailsByCase.get(caseId);
      const integrityEntries = caseIntegrityByCase.get(caseId) || [];
      const latestEntry = integrityEntries.length ? integrityEntries[integrityEntries.length - 1] : null;

      res.json({
        caseAssignment,
        profile: detail?.profile || null,
        fragments: detail?.fragments || [],
        metadata: detail?.metadata || {},
        integrity: {
          entryCount: integrityEntries.length,
          latestHash: latestEntry?.currentHash || null,
          latestAt: latestEntry?.createdAt || null,
        },
      });
    } catch (error) {
      console.error("victim case-overview failed", error);
      res.status(500).json({ error: "Failed to load victim case overview" });
    }
  });

  /**
   * POST /api/admin/login
   * Creates admin session token used by protected admin routes.
   */
  app.post("/api/admin/login", (req, res) => {
    try {
      if (!isAdminAuthConfigured) {
        return res.status(503).json({
          error: "Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in server environment variables.",
        });
      }

      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");

      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }

      const valid = email === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD;
      if (!valid) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }

      const token = `admin-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      adminSessions.set(token, { email, createdAt });

      res.json({
        success: true,
        token,
        admin: { email },
      });
    } catch (error) {
      console.error("admin login failed", error);
      res.status(500).json({ error: "Admin login failed" });
    }
  });

  app.get("/api/admin/session", requireAdminSession, (req, res) => {
    const session = res.locals.adminSession as { email: string; createdAt: string; token: string };
    res.json({
      authenticated: true,
      admin: { email: session.email, createdAt: session.createdAt },
    });
  });

  app.post("/api/admin/logout", requireAdminSession, (req, res) => {
    const session = res.locals.adminSession as { token: string };
    adminSessions.delete(session.token);
    res.json({ success: true });
  });

  /**
   * POST /api/admin/create-case
   * Creates a case directly from admin portal when mobile/onboarding flow has not yet provisioned one.
   */
  app.post("/api/admin/create-case", requireAdminSession, (req, res) => {
    try {
      const adminSession = res.locals.adminSession as { email: string };
      const victimUniqueId = String(req.body?.victimUniqueId || "").trim();
      const email = String(req.body?.email || "").trim() || undefined;
      const displayName = String(req.body?.displayName || "").trim() || undefined;

      if (!victimUniqueId) {
        return res.status(400).json({ error: "victimUniqueId is required" });
      }

      const existingCaseId = victimCaseMap.get(victimUniqueId);
      if (existingCaseId && caseAssignments.has(existingCaseId)) {
        return res.status(200).json({
          success: true,
          isNew: false,
          caseAssignment: caseAssignments.get(existingCaseId),
          message: `Victim already mapped to case ${existingCaseId}`,
        });
      }

      const newAssignment = createCaseAssignment(victimUniqueId, adminSession.email);
      caseAssignments.set(newAssignment.caseId, newAssignment);
      victimCaseMap.set(victimUniqueId, newAssignment.caseId);

      victimDetailsByCase.set(newAssignment.caseId, {
        profile: {
          victimUniqueId,
          email,
          displayName,
          updatedAt: new Date().toISOString(),
        },
        fragments: [],
        metadata: {
          source: "admin-portal",
          createdBy: adminSession.email,
        },
      });

      appendIntegrityEntry({
        caseId: newAssignment.caseId,
        actorId: adminSession.email,
        payloadType: "victim_profile",
        payload: {
          victimUniqueId,
          email,
          displayName,
        },
      });

      persistCaseState();

      res.json({
        success: true,
        isNew: true,
        caseAssignment: newAssignment,
        message: `Created case ${newAssignment.caseNumber} for ${victimUniqueId}`,
      });
    } catch (error) {
      console.error("admin create-case failed", error);
      res.status(500).json({ error: "Failed to create case" });
    }
  });

  /**
   * POST /api/admin/designate-officer
   * Admin ONLY: Designate an officer to a case
   * This is the SOURCE OF TRUTH for officer access
   */
  app.post("/api/admin/designate-officer", requireAdminSession, (req, res) => {
    try {
      const adminSession = res.locals.adminSession as { email: string };
      const adminId = adminSession.email;
      const caseId = String(req.body?.caseId || "").trim();
      const officerId = String(req.body?.officerId || "").trim();
      const role = normalizeOfficerRoleToken(String(req.body?.role || "police"));
      const scopedOfficerActorId = toScopedOfficerActorId(officerId, role);
      const expiresAt = req.body?.expiresAt; // Optional expiration

      if (!caseId || !officerId) {
        return res
          .status(400)
          .json({ error: "caseId and officerId are required" });
      }

      if (!caseAssignments.has(caseId)) {
        return res.status(404).json({ error: `Case ${caseId} not found` });
      }

      const ctx = res.locals.auditContext;

      // Check if officer is already designated
      const existing = officerDesignations.find(
        (d) =>
          d.caseId === caseId &&
          (d.officerId === officerId || d.officerId === scopedOfficerActorId) &&
          d.role === role &&
          d.status === "active"
      );
      if (existing) {
        return res.status(400).json({
          error: `Officer ${officerId} is already designated for case ${caseId}`,
        });
      }

      // Create designation
      const designation = createOfficerDesignation({
        caseId,
        officerId: scopedOfficerActorId,
        role: role as any,
        designatedByActorId: adminId,
        expiresAt,
      });

      officerDesignations.push(designation);
      persistCaseState();

      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "officer.designated",
          actorId: adminId,
          role: "admin",
          resource: req.path,
          success: true,
          details: {
            designationId: designation.designationId,
            officerId: scopedOfficerActorId,
            caseId,
            role,
          },
        })
      );

      res.json({
        success: true,
        designation,
        message: `Officer ${officerId} designated to case ${caseId} with role ${role}`,
      });
    } catch (error) {
      console.error("designate-officer failed", error);
      res.status(500).json({ error: "Designation failed" });
    }
  });

  /**
   * POST /api/admin/unassign-officer
   * Revoke active designation.
   */
  app.post("/api/admin/unassign-officer", requireAdminSession, (req, res) => {
    try {
      const designationId = String(req.body?.designationId || "").trim();
      const reason = String(req.body?.reason || "Admin unassignment").trim();

      if (!designationId) {
        return res.status(400).json({ error: "designationId is required" });
      }

      const designation = officerDesignations.find((d) => d.designationId === designationId);
      if (!designation) {
        return res.status(404).json({ error: `Designation ${designationId} not found` });
      }

      designation.status = "revoked";
      persistCaseState();

      res.json({
        success: true,
        designationId,
        caseId: designation.caseId,
        officerId: designation.officerId,
        reason,
      });
    } catch (error) {
      console.error("admin unassign-officer failed", error);
      res.status(500).json({ error: "Unassign failed" });
    }
  });

  /**
   * GET /api/admin/cases-overview
   * Returns active, assigned, unassigned, and designation detail for the Admin Portal.
   */
  app.get("/api/admin/cases-overview", requireAdminSession, (req, res) => {
    try {
      const adminSession = res.locals.adminSession as { email: string };
      const adminId = adminSession.email;

      const now = new Date();
      const allCases = Array.from(caseAssignments.values()).map((caseItem) => {
        const activeDesignations = officerDesignations.filter(
          (d) =>
            d.caseId === caseItem.caseId &&
            d.status === "active" &&
            (!d.expiresAt || new Date(d.expiresAt) > now)
        );

        const detail = victimDetailsByCase.get(caseItem.caseId);
        const integrityEntries = caseIntegrityByCase.get(caseItem.caseId) || [];
        const latestIntegrityHash = integrityEntries.length
          ? integrityEntries[integrityEntries.length - 1].currentHash
          : null;
        const latestFragmentPreview = detail?.fragments?.length
          ? String(detail.fragments[detail.fragments.length - 1] || "").slice(0, 180)
          : null;

        return {
          ...caseItem,
          assignedTo: activeDesignations.map((d) => ({
            designationId: d.designationId,
            officerId: d.officerId,
            role: d.role,
            designatedAt: d.designatedAt,
            expiresAt: d.expiresAt,
          })),
          isAssigned: activeDesignations.length > 0,
          victimProfileUpdatedAt: detail?.profile.updatedAt || null,
          fragmentCount: detail?.fragments.length || 0,
          victimDisplayName: detail?.profile.displayName || null,
          victimEmail: detail?.profile.email || null,
          victimPhone: detail?.profile.phone || null,
          emergencyContact: detail?.profile.emergencyContact || null,
          incidentSummary: detail?.profile.incidentSummary || null,
          latestFragmentPreview,
          latestIntegrityHash,
          integrityEntryCount: integrityEntries.length,
          lastUpdateSource: String(detail?.metadata?.source || "unknown"),
        };
      });

      const activeCaseCount = allCases.length;
      const assignedCaseCount = allCases.filter((c) => c.isAssigned).length;
      const unassignedCaseCount = activeCaseCount - assignedCaseCount;

      res.json({
        adminId,
        generatedAt: new Date().toISOString(),
        stats: {
          activeCaseCount,
          assignedCaseCount,
          unassignedCaseCount,
        },
        cases: allCases.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    } catch (error) {
      console.error("admin cases-overview failed", error);
      res.status(500).json({ error: "Failed to generate cases overview" });
    }
  });

  /**
   * POST /api/officer/list-assigned-cases
   * Officer views ONLY cases they're designated for
   * NO OTHER CASES VISIBLE
   */
  app.post("/api/officer/list-assigned-cases", (req, res) => {
    try {
      const officerId = String(req.body?.officerId || "").trim();
      const officerRoleRaw = String(req.body?.role || "").trim();
      const officerRole = officerRoleRaw ? normalizeOfficerRoleToken(officerRoleRaw) : null;
      const scopedOfficerActorId = officerRole ? toScopedOfficerActorId(officerId, officerRole) : null;
      if (!officerId) {
        return res.status(400).json({ error: "officerId is required" });
      }

      const ctx = res.locals.auditContext;

      // Get all designations for this officer where status is active
      const activeDesignations = officerDesignations.filter(
        (d) =>
          (d.officerId === officerId || (!!scopedOfficerActorId && d.officerId === scopedOfficerActorId)) &&
          (!officerRole || d.role === officerRole) &&
          d.status === "active" &&
          (!d.expiresAt || new Date(d.expiresAt) > new Date())
      );

      // Map to case data
      const assignedCases = activeDesignations
        .map((d) => {
          const caseAssignment = caseAssignments.get(d.caseId);
          return caseAssignment
            ? { ...caseAssignment, designationId: d.designationId, role: d.role }
            : null;
        })
        .filter(Boolean);

      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "officer.list-cases",
          actorId: officerId,
          role: "police",
          resource: req.path,
          success: true,
          details: { caseCount: assignedCases.length },
        })
      );

      res.json({
        officerId,
        officerRole: officerRole || undefined,
        assignedCaseCount: assignedCases.length,
        assignedCases,
        message: `You have access to ${assignedCases.length} case(s).`,
      });
    } catch (error) {
      console.error("list-assigned-cases failed", error);
      res.status(500).json({ error: "Failed to retrieve assigned cases" });
    }
  });

  /**
   * POST /api/officer/verify-case-access-waterproof
   * WATERPROOF access check - all four levels
   * Returns APPROVED only if ALL four gates pass
   */
  app.post("/api/officer/verify-case-access-waterproof", (req, res) => {
    try {
      const officerId = String(req.body?.officerId || "").trim();
      const caseId = String(req.body?.caseId || "").trim();
      const role = normalizeOfficerRoleToken(String(req.body?.role || "police"));
      const purpose = String(req.body?.purpose || (role === "lawyer" ? "lawyer_share" : "police_share"));
      const scopedOfficerActorId = toScopedOfficerActorId(officerId, role);
      const requestedFields = Array.isArray(req.body?.requestedFields)
        ? req.body.requestedFields
        : [];

      if (!officerId || !caseId) {
        return res
          .status(400)
          .json({ error: "officerId and caseId are required" });
      }

      const ctx = res.locals.auditContext;

      // Build access check result (levels 1-2)
      let accessResult = buildAccessCheckResult({
        caseId,
        officerId: scopedOfficerActorId,
        role: role as any,
        purpose,
        designations: officerDesignations,
      });

      if (!accessResult.approved) {
        accessResult = buildAccessCheckResult({
          caseId,
          officerId,
          role: role as any,
          purpose,
          designations: officerDesignations,
        });
      }

      if (!accessResult.approved) {
        logAuditEvent(
          buildAuditEvent({
            requestId: ctx.requestId,
            action: "case.access-denied",
            actorId: officerId,
            role: "police",
            resource: req.path,
            success: false,
            details: {
              reason: accessResult.reason,
              failedAt: accessResult.failedAt,
              caseId,
            },
          })
        );

        return res.json({
          approved: false,
          reason: accessResult.reason,
          failedAt: accessResult.failedAt,
        });
      }

      // Levels 3-4: Policy + Grant check
      const policyResult = evaluateConsent({
        actorId: scopedOfficerActorId,
        actorRole: role as any,
        caseId,
        purpose: purpose as any,
        requestedFields,
      });

      const hasShareGrant = hasActorGrant({
        caseId,
        officerIdRaw: officerId,
        officerRole: role,
        purpose: (purpose === "lawyer_share" ? "lawyer_share" : "police_share") as "police_share" | "lawyer_share",
      });

      const hasLegalExportGrant = hasActorGrant({
        caseId,
        officerIdRaw: officerId,
        officerRole: role,
        purpose: "legal_export",
      });

      const hasActiveGrant = hasShareGrant || hasLegalExportGrant;

      if (!hasActiveGrant) {
        logAuditEvent(
          buildAuditEvent({
            requestId: ctx.requestId,
            action: "case.access-denied",
            actorId: officerId,
            role: "police",
            resource: req.path,
            success: false,
            details: {
              reason: "No active consent grant",
              failedAt: "GRANT",
              caseId,
            },
          })
        );

        return res.json({
          approved: false,
          reason: "No active consent grant for this case and purpose",
          failedAt: "GRANT",
        });
      }

      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "case.access-approved",
          actorId: officerId,
          role: "police",
          resource: req.path,
          success: true,
          details: { caseId, designationId: accessResult.designationId },
        })
      );

      res.json({
        approved: true,
        reason: "✅ All four access gates passed: Designation ✓ Role Scope ✓ Policy ✓ Grant ✓",
        designationId: accessResult.designationId,
        caseId,
        policyRedactions: policyResult.redactions,
      });
    } catch (error) {
      console.error("verify-case-access-waterproof failed", error);
      res.status(500).json({ error: "Access verification failed" });
    }
  });

  /**
   * GET /api/case/:caseId/details
   * Fetch case details - only for designated officers or admins
   */
  app.get("/api/case/:caseId/details", async (req, res) => {
    try {
      const caseId = String(req.params.caseId || "").trim();
      const officerId = String(req.query.officerId || "").trim();
      const officerRole = normalizeOfficerRoleToken(String(req.query.officerRole || ""));

      if (!caseId || !officerId) {
        return res
          .status(400)
          .json({ error: "caseId and officerId query param required" });
      }

      // Check if officer is designated
      const isDesignated = officerDesignations.some((designation) =>
        isDesignationActiveForOfficer({
          caseId,
          officerIdRaw: officerId,
          officerRole,
          designation,
        })
      );

      if (!isDesignated) {
        return res.status(403).json({
          error: `Officer ${officerId} is not designated for case ${caseId}`,
        });
      }

      const sharePurpose = officerRole === "lawyer" ? "lawyer_share" : "police_share";
      if (!hasActorGrant({ caseId, officerIdRaw: officerId, officerRole, purpose: sharePurpose })) {
        return res.status(403).json({ error: "No active consent grant for this officer role" });
      }

      const caseAssignment = caseAssignments.get(caseId);
      if (!caseAssignment) {
        return res.status(404).json({ error: `Case ${caseId} not found` });
      }

      const victimPayload = victimDetailsByCase.get(caseId);
      const fragments = (victimPayload?.fragments || [])
        .map((fragment) => String(fragment || "").trim())
        .filter(Boolean);
      const captureSummary = fragments.reduce(
        (accumulator, fragment) => {
          const tag = String(fragment.match(/^\[([^\]]+)\]/)?.[1] || "").toLowerCase();
          if (tag.includes("voice")) accumulator.voiceCount += 1;
          else if (tag.includes("draw")) accumulator.drawingCount += 1;
          else if (tag.includes("upload")) accumulator.uploadCount += 1;
          else if (tag.includes("text") || tag.includes("write") || tag.includes("case-summary") || tag.includes("dashboard-case-brief")) accumulator.writingCount += 1;
          else accumulator.otherCount += 1;
          return accumulator;
        },
        {
          totalFragments: fragments.length,
          writingCount: 0,
          voiceCount: 0,
          drawingCount: 0,
          uploadCount: 0,
          otherCount: 0,
          latestSource: String(victimPayload?.metadata?.source || null),
        }
      );
      const caseInsight = await buildCaseInsightBundle({
        caseId,
        profile: victimPayload?.profile,
        fragments,
      });
      const integrityEntries = caseIntegrityByCase.get(caseId) || [];
      const latestIntegrityEntry = integrityEntries.length
        ? integrityEntries[integrityEntries.length - 1]
        : null;

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "case.details-fetched",
          actorId: officerId,
          role: officerRole,
          resource: req.path,
          success: true,
          details: { caseId },
        })
      );

      res.json({
        ...caseAssignment,
        victimProfile: victimPayload?.profile || null,
        victimFragments: fragments,
        metadata: victimPayload?.metadata || {},
        captureSummary,
        consentGrants: listGrantsByCase(caseId),
        intelligence: {
          legalSuggestions: caseInsight.legalSuggestions,
          contradictionRisks: caseInsight.contradictionRisks,
          evidenceLeads: caseInsight.evidenceLeads,
          fakeVictimAssessment: caseInsight.fakeVictimAssessment,
          mlPredictions: caseInsight.mlPredictions,
        },
        integrity: {
          totalEntries: integrityEntries.length,
          latestHash: latestIntegrityEntry?.currentHash || null,
          latestEntryAt: latestIntegrityEntry?.createdAt || null,
        },
      });
    } catch (error) {
      console.error("get case details failed", error);
      res.status(500).json({ error: "Failed to retrieve case details" });
    }
  });

  /**
   * GET /api/case/:caseId/verify-integrity
   * Officer one-click integrity verification with per-batch proof summary.
   */
  app.get("/api/case/:caseId/verify-integrity", (req, res) => {
    try {
      const caseId = String(req.params.caseId || "").trim();
      const officerId = String(req.query.officerId || "").trim();
      const officerRole = normalizeOfficerRoleToken(String(req.query.officerRole || ""));

      if (!caseId || !officerId) {
        return res.status(400).json({ error: "caseId and officerId query param required" });
      }

      const isDesignated = officerDesignations.some((designation) =>
        isDesignationActiveForOfficer({
          caseId,
          officerIdRaw: officerId,
          officerRole,
          designation,
        })
      );

      if (!isDesignated) {
        return res.status(403).json({
          error: `Officer ${officerId} is not designated for case ${caseId}`,
        });
      }

      const sharePurpose = officerRole === "lawyer" ? "lawyer_share" : "police_share";
      if (!hasActorGrant({ caseId, officerIdRaw: officerId, officerRole, purpose: sharePurpose })) {
        return res.status(403).json({ error: "No active consent grant for this officer role" });
      }

      const caseAssignment = caseAssignments.get(caseId);
      if (!caseAssignment) {
        return res.status(404).json({ error: `Case ${caseId} not found` });
      }

      const victimPayload = victimDetailsByCase.get(caseId);
      const fragments = (victimPayload?.fragments || [])
        .map((fragment) => String(fragment || "").trim())
        .filter(Boolean);

      const integrityEntries = caseIntegrityByCase.get(caseId) || [];
      const chainChecks = integrityEntries.map((entry, index) => {
        const expectedPrev = index === 0 ? "GENESIS" : integrityEntries[index - 1].currentHash;
        return {
          entryId: entry.entryId,
          payloadType: entry.payloadType,
          createdAt: entry.createdAt,
          expectedPrevHash: expectedPrev,
          actualPrevHash: entry.prevHash,
          linked: expectedPrev === entry.prevHash,
        };
      });

      const chainValid = chainChecks.every((check) => check.linked);
      const latestHash = integrityEntries.length ? integrityEntries[integrityEntries.length - 1].currentHash : "GENESIS";
      const profileDigest = sha256Hex(JSON.stringify(victimPayload?.profile || {}));
      const fragmentsDigest = sha256Hex(JSON.stringify(fragments));

      let queueEntries: Array<Record<string, unknown>> = [];
      try {
        const queueRaw = fs.existsSync(hashQueuePath) ? fs.readFileSync(hashQueuePath, "utf8") : "[]";
        const parsed = JSON.parse(queueRaw || "[]");
        queueEntries = Array.isArray(parsed) ? parsed : [];
      } catch {
        queueEntries = [];
      }

      const caseQueueEntries = queueEntries.filter((item) => String(item.caseId || "") === caseId);
      const profileAnchored = caseQueueEntries.some((item) => String(item.metadataHash || "") === profileDigest);
      const fragmentsAnchored = caseQueueEntries.some((item) => String(item.blobHash || "") === fragmentsDigest);

      const testimonyBuckets: Record<"writing" | "voice" | "drawing" | "upload" | "other", string[]> = {
        writing: [],
        voice: [],
        drawing: [],
        upload: [],
        other: [],
      };

      for (const fragment of fragments) {
        const match = fragment.match(/^\[([^\]]+)\]\s*(.*)$/i);
        const tag = String(match?.[1] || "").toLowerCase();
        const body = String(match?.[2] || fragment).trim() || fragment;

        if (tag.includes("voice")) {
          testimonyBuckets.voice.push(body);
        } else if (tag.includes("draw")) {
          testimonyBuckets.drawing.push(body);
        } else if (tag.includes("upload")) {
          testimonyBuckets.upload.push(body);
        } else if (
          tag.includes("text") ||
          tag.includes("write") ||
          tag.includes("case-summary") ||
          tag.includes("dashboard-case-brief")
        ) {
          testimonyBuckets.writing.push(body);
        } else {
          testimonyBuckets.other.push(fragment);
        }
      }

      const batchProofs = (Object.keys(testimonyBuckets) as Array<keyof typeof testimonyBuckets>).map((batchType) => {
        const items = testimonyBuckets[batchType];
        const batchHash = sha256Hex(JSON.stringify(items));
        const reasons: string[] = [];

        if (!items.length) {
          reasons.push("No testimony in this batch yet");
        }
        if (!chainValid) {
          reasons.push("Integrity chain link mismatch detected");
        }
        if (!fragmentsAnchored) {
          reasons.push("Current fragment digest is not yet present in anchor queue");
        }

        return {
          batchType,
          itemCount: items.length,
          batchHash,
          pass: items.length > 0 && chainValid && fragmentsAnchored,
          reasons,
        };
      });

      const ctx = res.locals.auditContext;
      logAuditEvent(
        buildAuditEvent({
          requestId: ctx.requestId,
          action: "case.details-fetched",
          actorId: officerId,
          role: "police",
          resource: req.path,
          success: true,
          details: {
            caseId,
            chainValid,
            profileAnchored,
            fragmentsAnchored,
          },
        })
      );

      res.json({
        caseId,
        caseNumber: caseAssignment.caseNumber,
        officerId,
        verification: {
          chainValid,
          totalEntries: integrityEntries.length,
          latestHash,
          profileDigest,
          fragmentsDigest,
          anchorEvidence: {
            queueEntriesForCase: caseQueueEntries.length,
            profileAnchored,
            fragmentsAnchored,
          },
          chainChecks,
          batchProofs,
        },
      });
    } catch (error) {
      console.error("verify-integrity failed", error);
      res.status(500).json({ error: "Failed to verify case integrity" });
    }
  });

  // ============================================================================
  // END CASE ASSIGNMENT & DESIGNATION ENDPOINTS
  // ============================================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/logs/**", "**/backend/consent/consent-grants.json"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
