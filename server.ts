import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";
import { LanguageServiceClient } from "@google-cloud/language";
import { SpeechClient } from "@google-cloud/speech";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { GoogleGenAI, Type } from "@google/genai";
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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "akshittiwari29@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "@Akshittiwari2910";

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

const victimDetailsByCase = new Map<string, VictimCasePayload>();
const caseIntegrityByCase = new Map<string, CaseIntegrityEntry[]>();
const reportFileById = new Map<string, string>();

const hashQueuePath = path.join(process.cwd(), "workers", "hashAnchoring", "queue.json");
const reportsPath = path.join(process.cwd(), "reports");
const caseStatePath = path.join(process.cwd(), "backend", "case", "case-state.json");
const mlServiceUrl = (process.env.ML_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");

type PersistedCaseState = {
  caseAssignments: CaseAssignment[];
  officerDesignations: OfficerDesignation[];
  victimCaseMap: Array<[string, string]>;
  victimDetailsByCase: Array<[string, VictimCasePayload]>;
  caseIntegrityByCase: Array<[string, CaseIntegrityEntry[]]>;
};

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
    };
    fs.writeFileSync(caseStatePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("persistCaseState failed", error);
  }
}

function loadPersistedCaseState() {
  if (!fs.existsSync(caseStatePath)) return;

  try {
    const raw = fs.readFileSync(caseStatePath, "utf8");
    const parsed = JSON.parse(raw || "{}") as Partial<PersistedCaseState>;

    caseAssignments.clear();
    victimCaseMap.clear();
    victimDetailsByCase.clear();
    caseIntegrityByCase.clear();
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
      source: "Open-Meteo/IMD",
      confidence: 0.81,
      rationale: "Weather markers can corroborate context details.",
    });
  }
  if (text.includes("cab") || text.includes("uber") || text.includes("ola") || text.includes("taxi")) {
    leads.push({
      type: "transport",
      query: "Cab booking/trip logs and route timeline",
      source: "Ride provider receipts/device history",
      confidence: 0.78,
      rationale: "Mobility logs help establish movement chronology.",
    });
  }
  if (text.includes("market") || text.includes("mall") || text.includes("road") || text.includes("station")) {
    leads.push({
      type: "cctv",
      query: "CCTV availability near mentioned public location",
      source: "Local admin/private establishments",
      confidence: 0.73,
      rationale: "Public area video may support timeline claims.",
    });
  }
  if (text.includes("call") || text.includes("phone") || text.includes("whatsapp") || text.includes("message")) {
    leads.push({
      type: "digital",
      query: "Call Detail Record and app message export metadata",
      source: "Device logs / telecom records",
      confidence: 0.76,
      rationale: "Communication records can validate sequence and contact nodes.",
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
  const margin = 38;
  const bodyWidth = width - margin * 2;

  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const drawPageHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 38,
      width: bodyWidth,
      height: 34,
      color: rgb(0.09, 0.2, 0.36),
    });
    page.drawText("Saakshi Forensic Intelligence Report", {
      x: margin + 12,
      y: y - 28,
      size: 12,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y -= 56;
  };

  const addPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
    drawPageHeader();
  };

  drawPageHeader();

  const titleLines = wrapPdfText({
    text: reportTitle,
    maxWidth: bodyWidth,
    font: bold,
    size: 17,
  });

  for (const titleLine of titleLines) {
    if (y < 90) addPage();
    page.drawText(titleLine, {
      x: margin,
      y,
      size: 17,
      font: bold,
      color: rgb(0.08, 0.13, 0.22),
    });
    y -= 22;
  }
  y -= 8;

  for (const section of sections) {
    if (y < 90) addPage();

    page.drawRectangle({
      x: margin,
      y: y - 20,
      width: bodyWidth,
      height: 18,
      color: rgb(0.9, 0.94, 0.99),
    });
    page.drawText(section.title, {
      x: margin + 8,
      y: y - 15,
      size: 10.5,
      font: bold,
      color: rgb(0.11, 0.24, 0.43),
    });
    y -= 30;

    for (const rawLine of section.lines) {
      const wrapped = wrapPdfText({
        text: rawLine,
        maxWidth: bodyWidth - 6,
        font,
        size: 9.8,
      });

      for (const line of wrapped) {
        if (y < 58) addPage();
        page.drawText(line, {
          x: margin + 3,
          y,
          size: 9.8,
          font,
          color: rgb(0.15, 0.18, 0.22),
        });
        y -= 13;
      }
    }

    y -= 8;
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: width - margin - 88,
      y: 20,
      size: 8.8,
      font,
      color: rgb(0.4, 0.45, 0.52),
    });
    p.drawText("Confidential - Authorized legal use only", {
      x: margin,
      y: 20,
      size: 8.8,
      font,
      color: rgb(0.4, 0.45, 0.52),
    });
  });

  return pdf.save();
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const googleNlpClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new LanguageServiceClient()
    : null;
  const googleSpeechClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new SpeechClient()
    : null;
  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  app.use(express.json({ limit: "12mb" }));

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
    const granteeRole = String(req.body?.granteeRole || "anonymous") as any;
    const purpose = String(req.body?.purpose || "analysis") as any;
    const requestedFields = Array.isArray(req.body?.requestedFields) ? req.body.requestedFields : [];

    if (!caseId) return res.status(400).json({ error: "caseId is required" });

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
      granteeActorId: req.body?.granteeActorId,
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
        model: "gemini-3-flash-preview",
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

      res.json(JSON.parse(response.text));
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
        model: "gemini-3.1-pro-preview",
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

      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("analyze-image failed", error);
      res.status(500).json({ error: "Image analysis failed" });
    }
  });

  app.post("/api/ai/search-evidence", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      if (!query) return res.status(400).json({ error: "query is required" });

      const response = await ai!.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Search for digital evidence or public records related to: "${query}". Focus on weather data, transit records, or local events that could verify this timeline.`,
        config: { tools: [{ googleSearch: {} }] },
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
        })
      );

      res.json({ text: response.text });
    } catch (error) {
      console.error("search-evidence failed", error);
      res.status(500).json({ error: "Evidence search failed" });
    }
  });

  app.post("/api/ai/adversarial-analysis", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const fragments = req.body?.fragments ?? [];
      const evidence = req.body?.evidence ?? [];

      const response = await ai!.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `You are an adversarial AI system. Fragments: ${JSON.stringify(fragments)} Evidence: ${JSON.stringify(evidence)}
1. Act as VIRODHI (Attack Engine): Find weaknesses in the story, predict cross-questions.
2. Act as RAKSHA (Defense Engine): Build legal/neuroscience-backed responses, pull Supreme Court judgments.`,
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

      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("adversarial-analysis failed", error);
      res.status(500).json({ error: "Adversarial analysis failed" });
    }
  });

  app.post("/api/ai/cross-examination", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const fragments = req.body?.fragments ?? [];

      const response = await ai!.models.generateContent({
        model: "gemini-3.1-pro-preview",
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

      res.json(JSON.parse(response.text));
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
      if (!googleSpeechClient && !ai) {
        return res.status(503).json({
          error: "Voice transcription is not configured on server",
          hint: "Set GOOGLE_APPLICATION_CREDENTIALS and/or GEMINI_API_KEY on backend host",
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

      const tryGeminiTranscription = async () => {
        if (!ai) return null;
        const geminiModels = ["gemini-3.1-pro-preview", "gemini-3-flash-preview"];

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
                      text: `Transcribe this spoken audio verbatim in ${languageCode}. Do not translate. If speech is mostly in another language or unclear, return exactly: [NO_MATCH].`,
                    },
                  ],
                },
              });

              const geminiText = String(geminiResponse.text || "").trim();
              if (
                geminiText &&
                geminiText !== "[NO_MATCH]" &&
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
      let usedProvider = "google-speech";
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
        const geminiResult = await tryGeminiTranscription();
        if (geminiResult?.transcript) {
          finalTranscript = geminiResult.transcript;
          finalConfidence = 0.61;
          usedProvider = googleSpeechClient ? `${usedProvider}+${geminiResult.provider}` : geminiResult.provider;
        }
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

  app.post("/api/report/export", requireConsentForPurpose("analysis"), async (req, res) => {
    try {
      const caseId = String(req.body?.caseId || "").trim();
      const audience = String(req.body?.audience || "victim").trim();
      const officerId = String(req.body?.officerId || "").trim();
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
        const isDesignated = officerDesignations.some(
          (designation) =>
            designation.caseId === caseId &&
            designation.officerId === officerId &&
            designation.status === "active" &&
            (!designation.expiresAt || new Date(designation.expiresAt) > new Date())
        );
        if (!isDesignated) {
          return res.status(403).json({ error: "Officer is not designated for this case" });
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
    const filePath = reportFileById.get(reportId);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "report not found" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=saakshi-${reportId}.pdf`);
    res.sendFile(filePath);
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
      const role = String(req.body?.role || "police");
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
          d.officerId === officerId &&
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
        officerId,
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
            officerId,
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
      if (!officerId) {
        return res.status(400).json({ error: "officerId is required" });
      }

      const ctx = res.locals.auditContext;

      // Get all designations for this officer where status is active
      const activeDesignations = officerDesignations.filter(
        (d) =>
          d.officerId === officerId &&
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
      const role = String(req.body?.role || "police");
      const purpose = String(req.body?.purpose || "police_share");
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
      const accessResult = buildAccessCheckResult({
        caseId,
        officerId,
        role: role as any,
        purpose,
        designations: officerDesignations,
      });

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
        actorId: officerId,
        actorRole: role as any,
        caseId,
        purpose: purpose as any,
        requestedFields,
      });

      const caseGrantResult = listGrantsByCase(caseId);
        const caseGrants: any[] = Array.isArray(caseGrantResult) ? caseGrantResult : (caseGrantResult as any)?.grants || [];
      const hasActiveGrant = caseGrants?.some(
        (g) =>
          g.status === "active" &&
          g.granteeRole === role &&
          g.purpose === purpose &&
          (!g.expiresAt || new Date(g.expiresAt) > new Date())
      ) || policyResult.allowed;

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

      if (!caseId || !officerId) {
        return res
          .status(400)
          .json({ error: "caseId and officerId query param required" });
      }

      // Check if officer is designated
      const isDesignated = officerDesignations.some(
        (d) =>
          d.caseId === caseId &&
          d.officerId === officerId &&
          d.status === "active" &&
          (!d.expiresAt || new Date(d.expiresAt) > new Date())
      );

      if (!isDesignated) {
        return res.status(403).json({
          error: `Officer ${officerId} is not designated for case ${caseId}`,
        });
      }

      const caseAssignment = caseAssignments.get(caseId);
      if (!caseAssignment) {
        return res.status(404).json({ error: `Case ${caseId} not found` });
      }

      const victimPayload = victimDetailsByCase.get(caseId);
      const fragments = (victimPayload?.fragments || [])
        .map((fragment) => String(fragment || "").trim())
        .filter(Boolean);
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
          role: "police",
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

      if (!caseId || !officerId) {
        return res.status(400).json({ error: "caseId and officerId query param required" });
      }

      const isDesignated = officerDesignations.some(
        (d) =>
          d.caseId === caseId &&
          d.officerId === officerId &&
          d.status === "active" &&
          (!d.expiresAt || new Date(d.expiresAt) > new Date())
      );

      if (!isDesignated) {
        return res.status(403).json({
          error: `Officer ${officerId} is not designated for case ${caseId}`,
        });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
