import { Platform } from "react-native";
import {
  appendLocalCaseFragments,
  getCaseLocalSnapshot,
  getDraftValue,
  getStoredSession,
  setDraftValue,
  setStoredSession,
} from "./localVault";

const BASE_URL = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 12000;

export type ReportExportAudience = "victim" | "officer";

export type WarRoomIntelligenceResult = {
  provider: string;
  caseId: string;
  summary: string;
  readinessScore: number;
  legalSuggestions: Array<{ code: string; title: string; why: string }>;
  contradictionRisks: Array<{ level: "LOW" | "MEDIUM" | "HIGH"; title: string; detail: string }>;
  fakeVictimAssessment: {
    probability: number;
    band: "LOW" | "MEDIUM" | "HIGH";
    flags: string[];
  };
};

export type EvidenceAutoDiscoverResult = {
  caseId: string;
  autoQuery: string;
  leads: Array<{ type: string; source: string; query: string; confidence: number }>;
  clueGraph: { memoryNodes: number; evidenceLeads: number };
};

export type FakeVictimAssessmentResult = {
  caseId: string;
  assessment: {
    probability: number;
    band: "LOW" | "MEDIUM" | "HIGH";
    flags: string[];
  };
};

export type ReportExportResult = {
  reportId: string;
  downloadUrl: string;
  reportHash: string;
  artifactHashes: {
    profileHash: string;
    fragmentsHash: string;
    legalHash: string;
    evidenceHash: string;
  };
  verificationBlock: {
    chainLength: number;
    latestIntegrityHash: string;
    integrityRootHash: string;
    reportHash: string;
  };
};

export type LegalPredictionResult = {
  caseId: string;
  provider: string;
  summary: string;
  confidence: number;
  suggestions: Array<{ code: string; title: string }>;
  rawText?: string;
};

export type TemporalNormalizationResult = {
  startDate: string;
  endDate: string;
  confidence: number;
  rationale: string;
};

export type TraumaAssessmentResult = {
  framework: string;
  band: "LOW" | "MEDIUM" | "HIGH";
  flags: string[];
  guidance: string[];
};

export type DistressCalibrationResult = {
  provider: string;
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  recommendedPace: string;
};

type VictimSession = {
  victimUniqueId: string;
  caseId: string;
  caseNumber: string;
  email?: string;
  displayName?: string;
  lastProvisionedAt?: string;
};

let victimSession: VictimSession | null = null;
let victimSessionHydrated = false;

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-user-id": "mobile-user",
  "x-user-role": "survivor",
};

async function request<T>(path: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      throw new Error("Server timed out. Please try again.");
    }
    throw error;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    const message = typeof errJson?.error === "string" ? errJson.error : `Request failed with ${response.status}`;
    if (response.status === 404 && path.startsWith("/api/consent")) {
      return {
        allowed: true,
        reason: "Consent endpoint unavailable; continuing in local mode",
        policyVersion: "local-fallback",
      } as T;
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getHealth() {
  return request<{ status: string }>("/api/health");
}

export function setVictimSession(session: VictimSession) {
  victimSession = session;
  void setStoredSession(session);
}

export function getVictimSession() {
  return victimSession;
}

export async function hydrateVictimSessionFromLocal() {
  if (victimSessionHydrated) {
    return victimSession;
  }

  victimSessionHydrated = true;
  const stored = await getStoredSession();
  if (stored) {
    victimSession = stored;
  }
  return victimSession;
}

export function isCloudSyncEnabled() {
  return String((globalThis as any)?.process?.env?.EXPO_PUBLIC_ENABLE_CLOUD_SYNC || "false") === "true";
}

export async function saveScreenDraft(key: string, value: string) {
  await setDraftValue(key, value);
}

export async function loadScreenDraft(key: string) {
  return getDraftValue(key);
}

export async function getLocalCaseCacheForCurrentSession() {
  const caseId = victimSession?.caseId || "demo-case-001";
  return getCaseLocalSnapshot(caseId);
}

export type VoiceAssistantMode = "neutral" | "strict" | "supportive_lawyer";

export async function registerVictimFromGoogle(params: {
  victimUniqueId: string;
  email: string;
  displayName?: string;
}) {
  return registerVictimFromIdentity(params);
}

export async function registerVictimFromIdentity(params: {
  victimUniqueId: string;
  email?: string;
  displayName?: string;
}) {
  if (!params.victimUniqueId.trim()) {
    throw new Error("victimUniqueId is required for case provisioning");
  }

  const buildLocalFallback = () => {
    const seed = params.victimUniqueId.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "LOCAL";
    const compact = seed.toUpperCase();
    const caseId = `local-case-${compact}`;
    const caseNumber = `SAAK-${new Date().getFullYear()}-LOCAL-${compact.slice(0, 5)}`;

    const result = {
      isNew: false,
      caseAssignment: {
        caseId,
        caseNumber,
        victimUniqueId: params.victimUniqueId,
      },
    };

    setVictimSession({
      victimUniqueId: params.victimUniqueId,
      caseId,
      caseNumber,
      displayName: params.displayName,
      email: params.email,
      lastProvisionedAt: new Date().toISOString(),
    });

    return result;
  };

  if (!params.email) {
    try {
      const result = await request<{
        isNew: boolean;
        caseAssignment: { caseId: string; caseNumber: string; victimUniqueId: string };
      }>("/api/victim/register-or-login", {
        method: "POST",
        body: JSON.stringify({ victimUniqueId: params.victimUniqueId }),
      });

      setVictimSession({
        victimUniqueId: result.caseAssignment.victimUniqueId,
        caseId: result.caseAssignment.caseId,
        caseNumber: result.caseAssignment.caseNumber,
        displayName: params.displayName,
        email: params.email,
        lastProvisionedAt: new Date().toISOString(),
      });

      return result;
    } catch {
      return buildLocalFallback();
    }
  }

  try {
    const result = await request<{
      isNew: boolean;
      caseAssignment: { caseId: string; caseNumber: string; victimUniqueId: string };
    }>("/api/victim/google-register", {
      method: "POST",
      body: JSON.stringify({
        victimUniqueId: params.victimUniqueId,
        email: params.email,
        displayName: params.displayName,
      }),
    });

    setVictimSession({
      victimUniqueId: result.caseAssignment.victimUniqueId,
      caseId: result.caseAssignment.caseId,
      caseNumber: result.caseAssignment.caseNumber,
      displayName: params.displayName,
      email: params.email,
      lastProvisionedAt: new Date().toISOString(),
    });
    return result;
  } catch {
    return buildLocalFallback();
  }
}

export async function saveVictimDetails(payload: {
  profile: {
    email?: string;
    displayName?: string;
    phone?: string;
    emergencyContact?: string;
    incidentSummary?: string;
  };
  fragments?: string[];
  source?: string;
  forceCloudSync?: boolean;
}) {
  if (!victimSession) {
    throw new Error("Victim session not initialized. Complete Google onboarding first.");
  }

  const source = payload.source || "mobile-app";
  const localIntegrity = await appendLocalCaseFragments({
    caseId: victimSession.caseId,
    source,
    fragments: payload.fragments || [],
    markUploaded: false,
  });

  const shouldCloudSync = isCloudSyncEnabled() || !!payload.forceCloudSync;

  if (!shouldCloudSync) {
    return {
      success: true,
      localOnly: true,
      integrity: {
        latestHash: localIntegrity.latestHash,
        profileHash: localIntegrity.profileHash,
        previousHash: localIntegrity.previousHash,
      },
    };
  }

  try {
    const remote = await request<{
      success: boolean;
      integrity: { latestHash: string; profileHash: string; previousHash: string };
    }>("/api/victim/save-details", {
      method: "POST",
      body: JSON.stringify({
        caseId: victimSession.caseId,
        victimUniqueId: victimSession.victimUniqueId,
        profile: payload.profile,
        fragments: payload.fragments || [],
        source,
      }),
    });

    await appendLocalCaseFragments({
      caseId: victimSession.caseId,
      source: `${source}-cloud-ack`,
      fragments: [],
      markUploaded: true,
    });

    return {
      ...remote,
      localOnly: false,
    };
  } catch {
    return {
      success: true,
      localOnly: true,
      integrity: {
        latestHash: localIntegrity.latestHash,
        profileHash: localIntegrity.profileHash,
        previousHash: localIntegrity.previousHash,
      },
    };
  }
}

export function getConsentPolicies() {
  return request<{ version: string; purposes: string[] }>("/api/consent/policies").catch(() => ({
    version: "local-fallback",
    purposes: ["analysis"],
  }));
}

export function evaluateConsentForAnalysis(caseId: string) {
  return request<{ allowed: boolean; reason: string; policyVersion: string }>("/api/consent/evaluate", {
    method: "POST",
    body: JSON.stringify({
      actorId: "demo-survivor-1",
      actorRole: "survivor",
      caseId,
      purpose: "analysis",
      requestedFields: ["timeline", "fragments"],
    }),
  });
}

export function classifyFragment(caseId: string, content: string) {
  return request<{ emotion?: string; time?: string; location?: string }>("/api/ai/classify-fragment", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, content }),
  }).catch(() => ({
    emotion: "steady",
    time: "relative memory clue",
    location: "not yet available",
  }));
}

export function classifyFragmentForCurrentCase(content: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return classifyFragment(caseId, content);
}

export function analyzeVoiceWithGoogleNlp(content: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<{
    provider: string;
    sentiment: { score: number; magnitude: number; label: string };
    entities: Array<{ name: string; type: string; salience: number }>;
    clues: { time: string[]; location: string[]; people: string[] };
  }>("/api/nlp/google-analyze", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, text: content }),
  }, 15000).catch(() => ({
    provider: "local-fallback",
    sentiment: { score: 0, magnitude: 0, label: "mixed" },
    entities: [],
    clues: { time: [], location: [], people: [] },
  }));
}

export function transcribeAudioForCurrentCase(params: {
  audioBase64: string;
  mimeType: string;
  languageCode?: string;
}) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<{
    provider: string;
    transcript: string;
    confidence: number;
  }>("/api/voice/transcribe", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({
      caseId,
      audioBase64: params.audioBase64,
      mimeType: params.mimeType,
      languageCode: params.languageCode || "en-IN",
    }),
  }, 25000);
}

export function searchEvidence(caseId: string, query: string) {
  return request<{ text: string }>("/api/ai/search-evidence", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, query }),
  }).catch(() => ({
    text: "Evidence search is temporarily in local mode. You can continue capturing fragments.",
  }));
}

export function searchEvidenceForCurrentCase(query: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return searchEvidence(caseId, query);
}

export function generateWarRoomIntelligenceForCurrentCase() {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<WarRoomIntelligenceResult>("/api/ai/war-room-intelligence", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId }),
  }).catch(() => ({
    provider: "local-fallback",
    caseId,
    summary: "Server intelligence is unavailable. Continue collecting precise fragments.",
    readinessScore: 58,
    legalSuggestions: [],
    contradictionRisks: [],
    fakeVictimAssessment: {
      probability: 0.22,
      band: "LOW",
      flags: ["Fallback estimate only"],
    },
  }));
}

export function autoDiscoverEvidenceForCurrentCase(queryHint: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<EvidenceAutoDiscoverResult>("/api/evidence/auto-discover", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, queryHint }),
  }).catch(() => ({
    caseId,
    autoQuery: queryHint,
    leads: [],
    clueGraph: { memoryNodes: 0, evidenceLeads: 0 },
  }));
}

export function getFakeVictimAssessmentForCurrentCase() {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<FakeVictimAssessmentResult>("/api/risk/fake-victim-assessment", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId }),
  }).catch(() => ({
    caseId,
    assessment: {
      probability: 0.2,
      band: "LOW",
      flags: ["Fallback estimate only"],
    },
  }));
}

export function exportCaseReportForCurrentCase(params?: { audience?: ReportExportAudience; officerId?: string }) {
  if (!victimSession) {
    throw new Error("Victim session not initialized. Complete onboarding first.");
  }

  const caseId = victimSession?.caseId || "demo-case-001";
  const audience = params?.audience || "victim";
  const officerId = params?.officerId;
  const victimUniqueId = victimSession?.victimUniqueId || "";

  const runExport = (currentCaseId: string, currentVictimUniqueId: string) =>
    request<ReportExportResult>("/api/report/export", {
      method: "POST",
      headers: {
        "x-case-id": currentCaseId,
        "x-user-role": audience === "officer" ? "officer" : DEFAULT_HEADERS["x-user-role"],
        "x-user-id": audience === "officer" ? officerId || "officer-user" : DEFAULT_HEADERS["x-user-id"],
      },
      body: JSON.stringify({
        caseId: currentCaseId,
        audience,
        officerId,
        victimUniqueId: currentVictimUniqueId,
      }),
    }).then((result) => ({
      ...result,
      downloadUrl: `${BASE_URL}${result.downloadUrl}`,
    }));

  const recoverLocalCaseAndExport = async () => {
    const snapshotBeforeRecovery = victimSession;
    if (!snapshotBeforeRecovery) {
      throw new Error("Case session unavailable for export.");
    }

    const localCaseId = snapshotBeforeRecovery.caseId;
    const localCache = await getCaseLocalSnapshot(localCaseId);

    await registerVictimFromIdentity({
      victimUniqueId: snapshotBeforeRecovery.victimUniqueId,
      email: snapshotBeforeRecovery.email,
      displayName: snapshotBeforeRecovery.displayName,
    });

    const refreshedSession = victimSession;
    if (!refreshedSession) {
      throw new Error("Could not recover remote case session for export.");
    }

    if (localCache.fragments.length > 0) {
      await request<{ success: boolean }>("/api/victim/save-details", {
        method: "POST",
        body: JSON.stringify({
          caseId: refreshedSession.caseId,
          victimUniqueId: refreshedSession.victimUniqueId,
          profile: {
            email: refreshedSession.email,
            displayName: refreshedSession.displayName,
          },
          fragments: localCache.fragments,
          source: "mobile-export-recovery",
        }),
      });
    }

    return runExport(refreshedSession.caseId, refreshedSession.victimUniqueId);
  };

  return runExport(caseId, victimUniqueId).catch(async (error) => {
    const message = (error as Error)?.message || "";
    const shouldRecover =
      audience === "victim" &&
      (caseId.startsWith("local-case-") || /not found/i.test(message));

    if (!shouldRecover) {
      throw error;
    }

    try {
      return await recoverLocalCaseAndExport();
    } catch {
      throw new Error("Export failed because your case is only local. Reconnect internet, open the app once, then retry export.");
    }
  });
}

export function predictLegalForCurrentCase(text: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<LegalPredictionResult>("/api/ml/legal-predict", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, text }),
  }).catch(() => ({
    caseId,
    provider: "local-fallback",
    summary: "Model unavailable. Continue with current legal suggestions.",
    confidence: 0.35,
    suggestions: [],
  }));
}

export function normalizeTemporalPhraseForCurrentCase(phrase: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<TemporalNormalizationResult>("/api/ml/temporal-normalize", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ phrase }),
  }).catch(() => ({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    confidence: 0.25,
    rationale: "Fallback date because temporal model is unavailable.",
  }));
}

export function assessTraumaForCurrentCase(text: string) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<TraumaAssessmentResult>("/api/ml/trauma-assess", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ text }),
  }).catch(() => ({
    framework: "local-fallback",
    band: "MEDIUM",
    flags: ["Model unavailable"],
    guidance: ["Use short prompts and avoid forcing exact chronology."],
  }));
}

export function calibrateDistressForCurrentCase(params: {
  transcript: string;
  pauseRate?: number;
  speechRate?: number;
  silenceRatio?: number;
}) {
  const caseId = victimSession?.caseId || "demo-case-001";
  return request<DistressCalibrationResult>("/api/ml/distress-calibrate", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify(params),
  }).catch(() => ({
    provider: "local-fallback",
    score: 0.3,
    band: "LOW",
    recommendedPace: "normal",
  }));
}

export function generateAdversarialAnalysis(caseId: string, fragments: Array<{ content: string }>) {
  return request<{
    virodhi: Array<{ threatLevel: string; title: string; description: string; predictableDefense: string }>;
    raksha: Array<{ type: string; title: string; description: string }>;
    strengthScore: number;
  }>("/api/ai/adversarial-analysis", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, fragments, evidence: [] }),
  }).catch(() => ({
    virodhi: [
      {
        threatLevel: "MEDIUM",
        title: "Timeline ambiguity",
        description: "Exact time anchor is not yet strong.",
        predictableDefense: "Collect 1-2 corroborating metadata points.",
      },
    ],
    raksha: [
      {
        type: "CLINICAL CONTEXT",
        title: "Trauma-consistent inconsistency",
        description: "Memory fragmentation under distress is expected.",
      },
    ],
    strengthScore: 62,
  }));
}

export function generateCrossExamination(caseId: string, fragments: Array<{ content: string }>) {
  return request<{ question: string; coaching: string; threatType: string }>("/api/ai/cross-examination", {
    method: "POST",
    headers: {
      "x-case-id": caseId,
    },
    body: JSON.stringify({ caseId, fragments }),
  }).catch(() => ({
    question: "Can you clearly state what you remember first, without guessing?",
    coaching: "Answer in short factual lines. It is okay to say you do not remember exact sequence.",
    threatType: "timeline pressure",
  }));
}

export async function persistVoiceChatMessage(params: {
  role: "user" | "assistant";
  mode: VoiceAssistantMode;
  text: string;
}) {
  if (!params.text.trim()) return;
  try {
    await saveVictimDetails({
      profile: {},
      fragments: [`[voice-chat][${params.mode}][${params.role}] ${params.text.trim()}`],
      source: "mobile-voice-assistant",
    });
  } catch {
    // Keep chat usable even if persistence endpoint is unavailable.
  }
}

export async function generateModeAwareCoachReply(params: {
  mode: VoiceAssistantMode;
  text: string;
  caseId?: string;
}) {
  const caseId = params.caseId || victimSession?.caseId || "demo-case-001";
  const transcript = params.text.trim();
  if (!transcript) {
    return "Please share one concrete detail, and I will help you strengthen it.";
  }

  if (params.mode === "strict") {
    const result = await generateCrossExamination(caseId, [{ content: transcript }]);
    return `${result.question}\n\nCoaching: ${result.coaching}`;
  }

  if (params.mode === "supportive_lawyer") {
    const analysis = await generateAdversarialAnalysis(caseId, [{ content: transcript }]);
    const topRisk = analysis.virodhi?.[0];
    const topDefense = analysis.raksha?.[0];
    return [
      `I am with you. Current strength score is ${analysis.strengthScore}.`,
      topRisk ? `Main pressure point: ${topRisk.title} - ${topRisk.description}` : "No high-pressure challenge detected yet.",
      topDefense ? `Best next move: ${topDefense.title} - ${topDefense.description}` : "Next move: add one precise time clue and one location clue.",
    ].join("\n\n");
  }

  const signal = await classifyFragment(caseId, transcript);
  return [
    "Thanks, I captured your note.",
    [signal.emotion, signal.time, signal.location].filter(Boolean).join(" • ") ||
      "I recommend adding a sensory detail and approximate timeline anchor.",
  ].join("\n\n");
}
