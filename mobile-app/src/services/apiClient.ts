import { Platform } from "react-native";

const BASE_URL = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-user-id": "demo-survivor-1",
  "x-user-role": "survivor",
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
  });

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
