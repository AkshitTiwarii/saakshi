import fs from "fs";
import path from "path";
import { ConsentPurpose, ActorRole } from "./consentPolicy";

export interface ConsentGrantRecord {
  grantId: string;
  caseId: string;
  grantedByActorId: string;
  granteeActorId?: string;
  granteeRole: ActorRole;
  purpose: ConsentPurpose;
  requestedFields: string[];
  redactions: string[];
  policyVersion: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string;
  expiresAt?: string;
}

const grantsPath = path.join(process.cwd(), "backend", "consent", "consent-grants.json");

function ensureStore() {
  if (!fs.existsSync(grantsPath)) {
    fs.writeFileSync(grantsPath, "[]", "utf8");
  }
}

function readAll(): ConsentGrantRecord[] {
  ensureStore();
  return JSON.parse(fs.readFileSync(grantsPath, "utf8")) as ConsentGrantRecord[];
}

function writeAll(grants: ConsentGrantRecord[]) {
  fs.writeFileSync(grantsPath, JSON.stringify(grants, null, 2), "utf8");
}

export function createGrant(record: ConsentGrantRecord): ConsentGrantRecord {
  const grants = readAll();
  grants.push(record);
  writeAll(grants);
  return record;
}

export function listGrantsByCase(caseId: string): ConsentGrantRecord[] {
  return readAll().filter((g) => g.caseId === caseId);
}

export function revokeGrant(grantId: string): ConsentGrantRecord | null {
  const grants = readAll();
  const idx = grants.findIndex((g) => g.grantId === grantId);
  if (idx < 0) return null;
  grants[idx] = {
    ...grants[idx],
    status: "revoked",
    revokedAt: new Date().toISOString(),
  };
  writeAll(grants);
  return grants[idx];
}

export function hasActiveGrant(params: {
  caseId: string;
  actorId: string;
  actorRole: ActorRole;
  purpose: ConsentPurpose;
}) {
  const now = Date.now();
  const normalizedActorId = String(params.actorId || "").trim();
  const scopedActorId = `${params.actorRole}:${normalizedActorId}`;

  return readAll().some((grant) => {
    if (grant.caseId !== params.caseId) return false;
    if (grant.status !== "active") return false;
    if (grant.purpose !== params.purpose) return false;

    const roleAllowed = grant.granteeRole === params.actorRole;
    const actorAllowed =
      !grant.granteeActorId ||
      grant.granteeActorId === normalizedActorId ||
      grant.granteeActorId === scopedActorId;
    if (!(roleAllowed && actorAllowed)) return false;

    if (!grant.expiresAt) return true;
    return new Date(grant.expiresAt).getTime() > now;
  });
}
