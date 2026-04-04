import fs from "fs";
import path from "path";

export type AuditAction =
  | "request.received"
  | "request.completed"
  | "consent.evaluated"
  | "consent.granted"
  | "consent.revoked"
  | "ai.classify"
  | "ai.analyzeImage"
  | "ai.searchEvidence"
  | "ai.adversarial"
  | "ai.crossExamination"
  | "victim.login-existing"
  | "victim.register-new"
  | "officer.designated"
  | "officer.list-cases"
  | "case.access-denied"
  | "case.access-approved"
  | "case.details-fetched";

export interface AuditEvent {
  requestId: string;
  action: AuditAction;
  actorId: string;
  role: string;
  resource: string;
  success: boolean;
  details?: Record<string, unknown>;
  timestamp: string;
}

const auditDir = path.join(process.cwd(), "logs");
const auditLogPath = path.join(auditDir, "audit.log.jsonl");

function ensureAuditTarget() {
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
  if (!fs.existsSync(auditLogPath)) fs.writeFileSync(auditLogPath, "", "utf8");
}

export function logAuditEvent(event: AuditEvent) {
  ensureAuditTarget();
  fs.appendFileSync(auditLogPath, `${JSON.stringify(event)}\n`, "utf8");
}

export function buildAuditEvent(params: Omit<AuditEvent, "timestamp">): AuditEvent {
  return {
    ...params,
    timestamp: new Date().toISOString(),
  };
}
