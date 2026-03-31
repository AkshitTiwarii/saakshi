# Saakshi

Saakshi is a survivor-first testimony capture and legal-preparation platform with:

- Mobile-first survivor experience (React Native + Expo)
- Web legal and officer workspace (React + Vite)
- Backend orchestration with consent gating and audit trails (Express + TypeScript)
- AI-assisted analysis via server-side model routing
- Integrity proof pipelines using hash-chain + anchoring worker

This README is the single, consolidated documentation source for product, technical, theoretical, legal-readiness, security, operations, and roadmap.

## 1. Product Vision

Saakshi is designed to preserve memory fidelity and evidentiary traceability in sensitive cases.

Core intent:

- Help survivors capture details early, safely, and at their own pace
- Convert fragmented memories into structured, explainable legal artifacts
- Enforce role- and consent-scoped data sharing
- Preserve chain integrity without storing raw testimony on-chain

Saakshi is assistive software, not a legal decision-maker.

## 2. Current Feature Set (Up To Date)

### Survivor-facing (mobile)

- Safe intake and guided emotional check-in
- Multi-modal capture:
   - voice
   - text
   - drawing
   - upload artifacts
- Draft autosave for capture workflows
- Distress-aware and trauma-sensitive interaction framing
- Quick Exit access in flow
- Case summary and secure save states

### Officer/Admin/Web

- Officer case assignment and listing
- Waterproof access verification endpoint
- Case detail retrieval and integrity verification
- Consent grant creation/revocation and policy evaluation
- Exportable report generation and report download endpoint

### AI + ML

- AI route proxying from backend (no model key in client)
- Fragment classification, image analysis, evidence lead discovery, adversarial analysis
- Voice transcription with provider fallback strategy and robust error signaling
- ML service integration for:
   - legal prediction
   - temporal normalization
   - trauma assessment
   - distress calibration
   - molminer extraction adapter

### Security + Integrity

- Consent middleware on protected routes
- Structured JSONL audit logging for request lifecycle and AI actions
- Case payload hash-chain and verification endpoint
- Hash-anchor queue worker (proofs only)
- Production hardening controls:
   - startup refusal with default admin credentials
   - startup refusal without case-state encryption key
   - optional AES-256-GCM encrypted persisted case state
   - security headers middleware
- Risk scoring endpoint disabled by default unless explicitly enabled

## 3. High-Level Architecture

```
Mobile App (React Native + Expo)  -->  API Server (Express + TS)  -->  AI/ML Services
Web App (React + Vite)            -->  API Server (Express + TS)  -->  Google NLP/Speech
                                                       \n+                                      -->  Firestore + local stores + hash worker
```

Conceptual layered model:

1. Experience Layer
- Survivor mobile workflow
- Officer/admin/legal web workflow

2. Access and Governance Layer
- Consent policy evaluation
- Grant lifecycle
- Role and purpose enforcement

3. Intelligence Layer
- AI extraction and legal prep pipelines
- ML adapters with consistent backend contracts

4. Integrity Layer
- Append-style case integrity entries
- Merkle/root anchoring worker outputs
- Verification endpoints

## 4. Data and Domain Model (Practical)

Primary entities represented in runtime/state:

- CaseAssignment:
   - caseId
   - caseNumber
   - victimUniqueId
   - createdAt
   - createdByAdminId
- VictimProfile:
   - victimUniqueId
   - optional contact fields
   - incidentSummary
   - updatedAt
- VictimCasePayload:
   - profile
   - fragments[]
   - metadata
- CaseIntegrityEntry:
   - entryId
   - caseId
   - prevHash
   - currentHash
   - actorId
   - payloadType
   - createdAt

Persistence currently combines:

- local JSON state files (with optional encryption)
- Firestore integration for selected dashboard/case flows
- proof queue files for anchoring worker

## 5. Consent and Access Control

Protected routes require purpose-scoped consent checks.

Waterproof access philosophy:

1. designation must exist and be active
2. actor role must be compatible with purpose
3. policy evaluation must allow access
4. active grant path must exist for non-survivor roles

Design principles:

- authorization decisions happen server-side
- access attempts are auditable
- denial reasons are explicit where possible

## 6. API Catalog (Implemented)

### Health

- GET /api/health

### ML Integration

- POST /api/ml/legal-predict
- POST /api/ml/temporal-normalize
- POST /api/ml/trauma-assess
- POST /api/ml/distress-calibrate
- POST /api/ml/molminer-extract

### Consent

- GET /api/consent/policies
- POST /api/consent/evaluate
- POST /api/consent/grant
- GET /api/consent/grants/:caseId
- POST /api/consent/revoke

### AI and Analysis

- POST /api/ai/classify-fragment
- POST /api/ai/analyze-image
- POST /api/ai/search-evidence
- POST /api/ai/adversarial-analysis
- POST /api/ai/cross-examination
- POST /api/ai/war-room-intelligence

### NLP and Voice

- POST /api/nlp/google-analyze
- POST /api/voice/transcribe

### Evidence and Risk

- POST /api/evidence/auto-discover
- POST /api/risk/fake-victim-assessment
   - default behavior: disabled unless `ENABLE_FAKE_VICTIM_ASSESSMENT=true`

### Reports

- POST /api/report/export
- GET /api/report/download/:reportId

### Victim

- POST /api/victim/register-or-login
- POST /api/victim/google-register
- POST /api/victim/save-details
- GET /api/victim/case-overview

### Admin

- POST /api/admin/login
- GET /api/admin/session
- POST /api/admin/logout
- POST /api/admin/create-case
- POST /api/admin/designate-officer
- POST /api/admin/unassign-officer
- GET /api/admin/cases-overview

### Officer

- POST /api/officer/list-assigned-cases
- POST /api/officer/verify-case-access-waterproof

### Case

- GET /api/case/:caseId/details
- GET /api/case/:caseId/verify-integrity

## 7. AI and ML Theory + Implementation Strategy

### Why this architecture

- Keep app clients thin and safer by routing model calls through server
- Decouple product API shape from model vendor/provider volatility
- Allow hybrid AI stack:
   - hosted LLM APIs for fast iteration
   - local/adapter service for controlled domain evolution

### Theoretical model stack

1. Ingestion
- normalize text/audio/image-derived signals into fragment schema

2. Inference
- extract temporal, spatial, sensory, emotional, uncertainty cues

3. Reconstruction
- map cues to event/timeline nodes with confidence traces

4. Adversarial/legal simulation
- generate likely challenge patterns and defensive clarifications

5. Output
- survivor-safe guidance
- legal-professional oriented output
- report export pipeline

### Training roadmap logic

Do not train all models from scratch.

Priority fine-tune targets:

1. trauma-aware fragment extractor
2. temporal normalizer for Indian context expressions
3. distress calibrator for adaptive UX

Quality controls:

- macro F1 and per-label F1 for extraction tasks
- exact/partial match for temporal normalization
- calibration metrics (ECE/MCE)
- expert acceptance review (legal + trauma specialists)

## 8. Blockchain and Integrity Design

Principle:

- never store raw testimony on chain
- store proof artifacts only

Integrity flow:

1. hash evidence blob
2. hash metadata snapshot
3. build batch merkle structure
4. anchor root/proof record
5. preserve proof bundle for verification/export

Current implementation path:

- worker script: `npm run worker:anchor`
- queue file: `workers/hashAnchoring/queue.json`
- output file: `workers/hashAnchoring/anchors.jsonl`

Court relevance note:

- integrity proofs establish tamper-evidence, not truthfulness

## 9. Security Architecture and Hardening

### Implemented controls

- server-side key management boundary for AI provider keys
- consent-scoped access middleware
- audit event logging in JSONL
- production startup checks for insecure defaults
- optional encrypted case-state persistence with AES-256-GCM
- security response headers

### Environment security controls

Required for production:

- `ADMIN_EMAIL` (non-default)
- `ADMIN_PASSWORD` (non-default)
- `CASE_STATE_ENCRYPTION_KEY` (required for encrypted persisted state)

Recommended:

- strict secret manager integration
- key rotation policy
- central immutable audit sink
- rate limiting and abuse analytics

### Threat model snapshot

High concern classes:

- credential leakage
- insider misuse
- unauthorized officer access
- data tampering claims
- model output misuse in legal context

Mitigation strategy:

- layered authorization
- immutable-ish logging + integrity trails
- explicit legal boundary messaging
- human-in-the-loop legal process where required

## 10. Legal and Policy Positioning

Saakshi must be presented as:

- assistive documentation system
- legal process accelerator for evidence preservation and request preparation

Saakshi must not be presented as:

- direct integrator of restricted government/telecom/banking records
- autonomous legal authority

Current legal boundary in evidence pipeline:

- `/api/evidence/auto-discover` provides leads and legal-request direction
- it does not directly fetch protected records

Section 65B posture:

- generated artifacts are draft-support outputs
- final admissibility path requires qualified human and procedural compliance

## 11. Mobile Product Blueprint (Consolidated)

Design rules:

- low-pressure, calm interactions
- one key decision per step
- pause-friendly and autosave-friendly flows
- trauma-aware copy and pacing

Core mobile flows:

1. Safe Entry
2. Emotional Check-In
3. Capture Method
4. Voice/Text/Draw/Upload Capture
5. Dashboard and case brief save
6. Distress-aware guidance
7. Controlled sharing and export pathways

Current mobile stack:

- React Native 0.76 + Expo 52
- TypeScript
- React Navigation
- Firebase SDK integration
- expo-av for voice recording
- expo-secure-store, file/document/image handling packages

## 12. Web Product Blueprint (Consolidated)

Web app currently delivers:

- dashboard and navigation shell
- capture flows for text/voice/draw/upload
- officer/admin surfaces
- settings and workflow modules

UI direction now includes:

- warm earthy token system
- shared button and input primitives
- improved trauma-aware microcopy in core capture paths

## 13. Firebase and Data Sync

Project context used in this codebase:

- Firebase project: `mospi-469523`
- Firestore database id reference is present in config and services

Typical collections used in workflows:

- cases
- fragments
- evidence
- grants

Seed and validation tools:

- `npm run seed:officer-data`

## 14. Runtime Configuration

### Core server variables

- `GEMINI_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` (for Google NLP/Speech)
- `ML_SERVICE_URL` (default `http://127.0.0.1:8001`)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CASE_STATE_ENCRYPTION_KEY`
- `ENABLE_FAKE_VICTIM_ASSESSMENT` (default false)

### ML service variables

- `HF_API_TOKEN`
- `LAW_MODEL_PROVIDER`
- `HF_LAW_MODEL_ID`
- `LEGAL_ENSEMBLE_ENABLED`
- `LEGAL_ENSEMBLE_MODELS`
- `LEGAL_ENSEMBLE_WEIGHTS`
- `INLEGAL_BERT_ENABLED`

## 15. Local Development and Commands

### Root app

1. Install

```bash
npm install
```

2. Run server + web

```bash
npm run dev
```

3. Build web bundle

```bash
npm run build
```

4. Type check

```bash
npm run lint
```

### Mobile app

```bash
cd mobile-app
npm install
npm run android
# or
npm run ios
```

### ML service

```bash
npm run ml:install
npm run ml:serve
```

### Anchoring worker

```bash
npm run worker:anchor
```

## 16. End-to-End Operational Flow

1. survivor registers/logs in and gets case assignment
2. survivor captures fragments via one or many modes
3. payload updates create integrity entries
4. officer/admin actions require designation and consent pathways
5. AI/ML enriches legal and timeline interpretations
6. reports are exported with integrity references
7. anchoring worker processes queued hash proofs

## 17. Judge and Reviewer Readiness

Best-practice framing for demos:

1. state legal and technical boundaries first
2. show live consent check and audit trail
3. show integrity verification endpoint
4. show evidence lead legal-boundary response
5. explicitly call out what is roadmap vs implemented

Current honest status:

- implemented:
   - consent, audit, integrity, role checks, server-side AI routing
   - baseline production hardening controls
- in-progress/roadmap:
   - deeper E2EE/zero-knowledge architecture
   - full CA-integrated legal signing workflow
   - expanded formal compliance/audit certification

## 18. Troubleshooting

### Vite/Tailwind utility errors

- Ensure custom classes are not used as `@apply` utility candidates.
- Use direct utility expansion inside class definitions.

### Mobile recording/transcription reliability

- Android capture is configured for stable 3GPP flow.
- Ensure Speech-to-Text API is enabled for configured project.

### Firestore data missing

- Confirm seed script execution and project configuration.

### Admin login behavior

- In production, startup fails if default admin credentials are left unchanged.

## 19. Scope and MVP Focus

The sharp-blade MVP is:

- reliable testimony capture
- timeline/evidence lead preparation
- consent-governed sharing
- tamper-evident integrity reporting

Everything else should be layered only after this core is strong, secure, and field-validated.

## 20. Repository Map (Selected)

- `server.ts`: primary backend, routing, consent guards, security controls
- `backend/consent/*`: consent policy, middleware, grant store
- `backend/audit/auditLogger.ts`: structured audit writer
- `workers/hashAnchoring/hashAnchorWorker.ts`: proof anchoring worker
- `mobile-app/src/*`: survivor-facing mobile implementation
- `src/*`: web app implementation
- `scripts/seedOfficerDashboardData.ts`: Firestore test seed script
- `ml-service/*`: Python ML adapter service

## 21. Final Notes

Saakshi is intended for high-sensitivity legal contexts. Build and deployment decisions must prioritize:

1. survivor safety
2. lawful process compatibility
3. clear governance and auditability
4. transparent limitations

If you are preparing for pilot or production, run a formal security review and legal review checkpoint before live deployment.
