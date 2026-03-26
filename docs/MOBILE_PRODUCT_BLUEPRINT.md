# Saakshi Mobile Product Blueprint (React Native First)

## Product Direction
- Primary app: React Native (Android + iOS)
- Secondary interface: Web dashboard for legal professionals
- Existing web app remains as prototype and transition base

## UX Principles
- Calm, non-threatening interface
- One decision per screen
- No forced linear forms
- Pause anytime and instant autosave
- Quick exit / stealth mode
- No urgency pressure, no countdowns

## Core App Flows

### 1. Safe Entry
- App opens into neutral, discreet shell
- Optional decoy mode (calculator/notes skin)
- Primary CTA only: Continue quietly

### 2. Emotional Check-In
- Icons first, text second
- UI density adapts by selected emotional state
- Distress state reduces visual complexity and options

### 3. Multi-Input Capture
- Voice capture
- Draw capture
- Text fragments
- Upload evidence
- All capture types store as memory cards with metadata

### 4. Non-Linear Memory Canvas
- Cards are draggable and clusterable
- User can connect cards manually
- AI suggests links with confidence (never forced)

### 5. Timeline Reconstruction
- Timeline built from cards + extracted cues
- Each segment has:
  - time range
  - confidence band
  - explainability notes

### 6. Distress-Aware Interaction
- Local distress score from interaction pace + audio features
- Optional grounding prompts
- Always available pause action

### 7. Controlled Sharing
- Views by role: Survivor, Lawyer, Police, Court
- Field-level redaction toggles
- One-click export with chain-of-custody package

## Mobile Tech Stack
- React Native + TypeScript
- State: Zustand or Redux Toolkit
- Navigation: React Navigation
- Local encrypted DB: SQLCipher/WatermelonDB or Realm
- Secure key storage: Android Keystore / iOS Keychain
- Biometrics: native bridge
- Background sync: queue with retry policy

## Offline-First Rules
- Capture never blocked by network
- Local write first, sync later
- Conflict resolution:
  - append-only event model
  - server reconciliation with immutable audit trail

## UI Notes (Premium + Intentional)
- Asymmetric editorial layout
- Strong typography hierarchy
- Minimal text blocks
- High-clarity controls and generous spacing
- Soft palettes only (no aggressive red states in survivor flow)

## Accessibility
- Large touch targets (>=44px)
- Dynamic font support
- Voiceover labels and semantic navigation
- Low-motion mode
- Multilingual support (English + Indian language packs)
