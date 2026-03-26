import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { buildAuditEvent, logAuditEvent } from "./backend/audit/auditLogger";
import { evaluateConsent, getConsentPolicySummary } from "./backend/consent/consentPolicy";
import { createGrant, listGrantsByCase, revokeGrant } from "./backend/consent/consentStore";
import { requireConsentForPurpose } from "./backend/consent/consentMiddleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  app.use(express.json());

  app.use((req, res, next) => {
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
