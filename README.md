<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5e4fc0fd-d360-4d78-a255-fcddfc908559

## Saakshi Product Direction

This repository now includes a secure transition path from prototype web app to production-grade mobile + backend architecture.

- Mobile-first target: React Native (Android + iOS)
- AI calls are proxied through backend APIs (no model key in client)
- Firestore schema/rules aligned with current capture flows
- Blockchain strategy uses proof anchoring (hashes), not raw evidence on-chain

Architecture and implementation docs:

- `docs/MOBILE_PRODUCT_BLUEPRINT.md`
- `docs/BACKEND_AI_ARCHITECTURE.md`
- `docs/MODEL_TRAINING_PLAN.md`
- `docs/BLOCKCHAIN_INTEGRITY_DESIGN.md`
- `docs/API_CONTRACT_OPENAPI.yaml`
- `docs/IMPLEMENTATION_ROADMAP.md`

## New Scaffolds Added

### React Native starter app
- Location: `mobile-app/`
- Includes first 4 premium screens:
   - Safe Entry
   - Emotional Check-In
   - Capture Method
   - Quick Exit

Run:
- `cd mobile-app`
- `npm install`
- `npm run android` or `npm run ios`

### Backend consent + audit stubs
- Consent endpoints:
   - `GET /api/consent/policies`
   - `POST /api/consent/evaluate`
   - `POST /api/consent/grant`
   - `GET /api/consent/grants/:caseId`
   - `POST /api/consent/revoke`
- Request and AI actions are logged to `logs/audit.log.jsonl`
- AI routes now enforce consent and require `caseId` via request body or `x-case-id` header

### Blockchain proof anchoring worker (skeleton)
- Script: `npm run worker:anchor`
- Queue file: `workers/hashAnchoring/queue.json`
- Output proofs: `workers/hashAnchoring/anchors.jsonl`
- Stores proof hashes only (no raw evidence)

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` for the server runtime (same shell session or environment file)
3. Run the app:
   `npm run dev`

The frontend now calls backend endpoints under `/api/ai/*`, and the backend handles Gemini access.

For Android emulator mobile API calls, use host `10.0.2.2` for local backend access.

## Officer Dashboard Testing

The website now opens directly to the officer dashboard at `/`.

### 1. Ensure Firestore database exists

If you see Firestore `NOT_FOUND` errors, create a Firestore database in project `mospi-469523` first, then re-run the app.

### 2. Seed local consent grants for dashboard checks

Local backend grant store is pre-seeded in:

- `backend/consent/consent-grants.json`

### 3. Seed Firestore case data (optional helper script)

Run:

- `npm run seed:officer-data`

### 4. Testing credentials

- Case Number: `SAAK-2026-1042`
- Victim UID: `VIC-AX74-1192`
- Officer IDs: `OFF-IND-221`, `OFF-IND-331`, `ADV-LEGAL-72`

Use matching role and purpose combinations in the officer dashboard.
