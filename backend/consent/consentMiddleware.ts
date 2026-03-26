import type { Request, Response, NextFunction } from "express";
import { evaluateConsent, ConsentPurpose, ActorRole } from "./consentPolicy";
import { hasActiveGrant } from "./consentStore";
import { buildAuditEvent, logAuditEvent } from "../audit/auditLogger";

function getCaseId(req: Request): string {
  return String(req.body?.caseId || req.header("x-case-id") || "").trim();
}

function getActorRole(req: Request): ActorRole {
  return (String(req.header("x-user-role") || "anonymous") as ActorRole);
}

function getActorId(req: Request): string {
  return String(req.header("x-user-id") || "anonymous");
}

export function requireConsentForPurpose(purpose: ConsentPurpose) {
  return (req: Request, res: Response, next: NextFunction) => {
    const caseId = getCaseId(req);
    const actorId = getActorId(req);
    const actorRole = getActorRole(req);

    if (!caseId) {
      return res.status(400).json({ error: "caseId is required in body or x-case-id header" });
    }

    const evalResult = evaluateConsent({
      actorId,
      actorRole,
      caseId,
      purpose,
      requestedFields: [],
    });

    const requestId = String(res.locals.auditContext?.requestId || "no-request-id");
    const resource = String(res.locals.auditContext?.resource || req.path);

    logAuditEvent(
      buildAuditEvent({
        requestId,
        action: "consent.evaluated",
        actorId,
        role: actorRole,
        resource,
        success: evalResult.allowed,
        details: {
          reason: evalResult.reason,
          policyVersion: evalResult.policyVersion,
          purpose,
          caseId,
        },
      })
    );

    if (!evalResult.allowed) {
      return res.status(403).json({ error: `Consent policy denied: ${evalResult.reason}` });
    }

    if (actorRole !== "survivor" && actorRole !== "admin") {
      const granted = hasActiveGrant({
        caseId,
        actorId,
        actorRole,
        purpose,
      });
      if (!granted) {
        return res.status(403).json({ error: "No active survivor consent grant for this case and purpose" });
      }
    }

    next();
  };
}
