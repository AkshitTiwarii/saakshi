export type VictimCaseAssignment = {
  caseId: string;
  caseNumber: string;
  victimUniqueId: string;
  createdAt: string;
};

export type VictimCaseOverview = {
  caseAssignment: VictimCaseAssignment;
  profile: {
    victimUniqueId: string;
    email?: string;
    displayName?: string;
    incidentSummary?: string;
    updatedAt: string;
  } | null;
  fragments: string[];
  metadata: Record<string, unknown>;
  integrity: {
    entryCount: number;
    latestHash: string | null;
    latestAt: string | null;
  };
};

export type CanonicalVictimIdentity = {
  victimUniqueId: string;
  email?: string;
  displayName?: string;
};

const HEADERS = {
  "Content-Type": "application/json",
};

const ANON_VICTIM_KEY = "saakshi.web.victimUniqueId";

function parseResponseText(text: string) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { raw: text };
  }
}

async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...HEADERS,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const payload = parseResponseText(text) as any;

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export async function ensureVictimCaseSession(params: {
  victimUniqueId: string;
  email?: string;
  displayName?: string;
}) {
  const victimUniqueId = params.victimUniqueId.trim();
  if (!victimUniqueId) {
    throw new Error("victimUniqueId is required");
  }

  const result = await apiJson<{ caseAssignment: VictimCaseAssignment }>("/api/victim/google-register", {
    method: "POST",
    body: JSON.stringify({
      victimUniqueId,
      email: params.email || `${victimUniqueId}@local.saakshi`,
      displayName: params.displayName,
    }),
  }).catch(async () => {
    return apiJson<{ caseAssignment: VictimCaseAssignment }>("/api/victim/register-or-login", {
      method: "POST",
      body: JSON.stringify({ victimUniqueId }),
    });
  });

  return result.caseAssignment;
}

export async function saveVictimWebCapture(params: {
  victimUniqueId: string;
  email?: string;
  displayName?: string;
  incidentSummary?: string;
  fragments: string[];
  source: string;
}) {
  const caseAssignment = await ensureVictimCaseSession({
    victimUniqueId: params.victimUniqueId,
    email: params.email,
    displayName: params.displayName,
  });

  return apiJson<{
    success: boolean;
    caseId: string;
    fragmentCount: number;
    integrity: {
      latestHash: string;
      profileHash: string;
      previousHash: string;
    };
  }>("/api/victim/save-details", {
    method: "POST",
    body: JSON.stringify({
      caseId: caseAssignment.caseId,
      victimUniqueId: params.victimUniqueId,
      profile: {
        email: params.email,
        displayName: params.displayName,
        incidentSummary: params.incidentSummary,
      },
      fragments: params.fragments,
      source: params.source,
    }),
  });
}

export async function getVictimCaseOverview(victimUniqueId: string): Promise<VictimCaseOverview> {
  await ensureVictimCaseSession({ victimUniqueId });
  const encoded = encodeURIComponent(victimUniqueId.trim());
  return apiJson<VictimCaseOverview>(`/api/victim/case-overview?victimUniqueId=${encoded}`);
}

export function resolveCanonicalVictimIdentity(input: {
  clerkId?: string | null;
  email?: string | null;
  displayName?: string | null;
}): CanonicalVictimIdentity {
  if (input.clerkId) {
    return {
      victimUniqueId: `web-${input.clerkId}`,
      email: input.email || undefined,
      displayName: input.displayName || undefined,
    };
  }

  let anonymousId = "";
  if (typeof window !== "undefined") {
    anonymousId = window.localStorage.getItem(ANON_VICTIM_KEY) || "";
    if (!anonymousId) {
      anonymousId = `web-guest-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(ANON_VICTIM_KEY, anonymousId);
    }
  }

  return {
    victimUniqueId: anonymousId || `web-guest-${Date.now()}`,
    email: input.email || undefined,
    displayName: input.displayName || "Web Guest",
  };
}
