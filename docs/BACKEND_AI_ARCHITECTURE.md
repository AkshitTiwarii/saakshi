# Saakshi Backend + AI Architecture

## Service Topology
1. API Gateway (Spring Boot)
2. Auth and Consent Service
3. Memory Ingestion Service
4. AI Orchestration Service
5. Timeline and Confidence Engine
6. Evidence Vault Service
7. Report Generation Service
8. Audit and Policy Service

## Data Stores
- PostgreSQL: structured case graph and metadata
- Object Storage: encrypted media and exports
- Redis: queue and cache
- Message Queue (RabbitMQ/Kafka): async AI jobs

## Security Baseline
- JWT with device/session binding
- RBAC + consent-scoped ABAC checks
- Per-record envelope encryption
- Immutable audit logs for every read/write/share/export
- Model keys only on server-side runtime

## AI Pipeline

### Stage 1: Ingestion
- Inputs: voice, text, drawing, upload metadata
- Normalize to memory fragment schema

### Stage 2: Inference
- STT: Whisper
- Emotion: wav2vec-based model + text emotion baseline
- Fragment extraction: fine-tuned transformer NER
- Temporal normalizer: festival-relative phrase resolver (after Diwali, before Holi)

### Stage 3: Reconstruction
- Build probabilistic event graph
- Compute confidence for each event edge and time range
- Store explainability trace (signals and weights)

### Stage 4: Adversarial Simulation
- VIRODHI: legal attack generation
- RAKSHA: defense strategy generation
- Cross-exam practice prompts and coaching

### Stage 5: Output
- Survivor view
- Legal professional view
- Court-ready export bundle

## Internal API Boundaries
- Gateway only public entry
- AI service in private network
- Vault service isolated with strict IAM
- Blockchain anchoring worker is write-only from signed queue

## MVP Deploy Pattern
- Spring Boot monolith with modular packages first
- Python inference sidecar/service for model execution
- Background workers for heavy tasks (transcription, report generation)
- Move to microservices after stable workflow and audit maturity
