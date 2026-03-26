export type ConsentPurpose = "capture" | "analysis" | "legal_export" | "police_share" | "lawyer_share";
export type ActorRole = "survivor" | "lawyer" | "police" | "court" | "admin" | "anonymous";

export interface ConsentEvaluationInput {
  actorId: string;
  actorRole: ActorRole;
  caseId: string;
  purpose: ConsentPurpose;
  requestedFields: string[];
}

export interface ConsentEvaluationResult {
  allowed: boolean;
  reason: string;
  redactions: string[];
  policyVersion: string;
}

const POLICY_VERSION = "0.1.0-stub";

const rolePurposeMatrix: Record<ActorRole, ConsentPurpose[]> = {
  survivor: ["capture", "analysis", "legal_export", "police_share", "lawyer_share"],
  lawyer: ["analysis", "legal_export", "lawyer_share"],
  police: ["analysis", "police_share"],
  court: ["analysis", "legal_export"],
  admin: ["analysis", "legal_export", "police_share", "lawyer_share"],
  anonymous: [],
};

export function evaluateConsent(input: ConsentEvaluationInput): ConsentEvaluationResult {
  const allowedPurposes = rolePurposeMatrix[input.actorRole] ?? [];
  const allowed = allowedPurposes.includes(input.purpose);

  if (!allowed) {
    return {
      allowed: false,
      reason: `Role ${input.actorRole} is not permitted for purpose ${input.purpose}`,
      redactions: input.requestedFields,
      policyVersion: POLICY_VERSION,
    };
  }

  const redactions = input.actorRole === "police" ? ["therapy_notes", "private_journal"] : [];

  return {
    allowed: true,
    reason: "Allowed by stub role-purpose policy",
    redactions,
    policyVersion: POLICY_VERSION,
  };
}

export function getConsentPolicySummary() {
  return {
    version: POLICY_VERSION,
    roles: Object.keys(rolePurposeMatrix),
    purposes: ["capture", "analysis", "legal_export", "police_share", "lawyer_share"],
    note: "Stub policy. Replace with consent-led ABAC engine before production.",
  };
}
