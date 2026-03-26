# Saakshi Implementation Roadmap

## Sprint 1 (Stabilize Existing App)
- Align Firestore schema + rules
- Remove client-side model keys
- Route AI calls through backend API
- Add error handling and audit metadata stubs

## Sprint 2 (React Native Foundation)
- Bootstrap RN app shell
- Build Safe Entry, Check-In, Capture Method screens
- Add encrypted local storage and autosave queue
- Add Quick Exit and biometric lock scaffolding

## Sprint 3 (Capture + Timeline)
- Voice, draw, text, upload capture on device
- Memory cards and non-linear canvas
- Initial timeline reconstruction view with confidence bands

## Sprint 4 (Backend Core)
- Spring Boot modules for auth, consent, ingestion, reporting
- Python inference service deployment
- Async job queue and retries

## Sprint 5 (Legal Layer)
- Role-based sharing views
- Redaction controls
- Court-ready report exporter
- Chain-of-custody packet generation

## Sprint 6 (Blockchain Integrity)
- Hash anchoring worker
- Permissioned chain contract deployment
- Verification CLI/API endpoint

## Sprint 7 (Hardening)
- Security audit and threat modeling
- Performance tuning and offline conflict tests
- Accessibility and localization passes

## Definition of Done (MVP)
- Survivor can capture once and securely share role-scoped outputs
- Timeline includes confidence + explainability traces
- Export package has tamper-evidence verification artifacts
- All access is auditable and consent-governed
