# Mobile Voice + Timeline ML Roadmap

## Objective
Build three domain models that improve courtroom readiness, trauma-consistent interpretation, and adaptive in-app guidance while keeping latency and cost practical.

## Training Strategy
- Use pretrained models for heavy lifting.
- Fine-tune only high-impact domain tasks.
- Keep Whisper and sentence-transformers as pretrained foundations.

## Model 1 (Train First): Trauma-Aware Fragment Extractor
- Base model: ModernBERT or DeBERTa-v3-base.
- Task type: token classification.
- Labels:
  - time_clue
  - sensory_cue
  - uncertainty_marker
  - legal_relevance
  - actor_role
  - location_hint
- Why first:
  - Highest gain in timeline quality.
  - Highest gain in legal utility of statements.
- Data requirements:
  - Token-level annotation from real or synthetic survivor narratives.
  - Dual-review protocol (legal and trauma specialist).
- Metrics:
  - Macro F1.
  - Per-label F1.
  - Calibration ECE for confidence output.

## Model 2 (Train Second): Temporal Normalizer (India Context)
- Base model: T5-small or mT5-small seq2seq.
- Task type: phrase-to-normalized-date-range generation.
- Input examples:
  - after Diwali
  - before Holi
  - wedding season
  - after monsoon started
- Output schema:
  - start_date
  - end_date
  - confidence
  - rationale
- Why second:
  - Directly improves court-ready timeline reconstruction.
- Metrics:
  - Exact match.
  - Partial overlap match.
  - Confidence calibration ECE.

## Model 3 (Train Third): Distress Calibrator
- Input:
  - wav2vec2 embeddings.
  - pause rate.
  - speech rate.
  - silence duration statistics.
- Model:
  - Lightweight MLP or XGBoost calibrator.
- Output:
  - distress_band (low, moderate, high).
  - confidence.
  - pace_hint for app UX.
- Why third:
  - Improves adaptive UX decisions and trauma-consistent interpretation.
- Metrics:
  - AUROC / F1 per distress band.
  - ECE.

## Keep Pretrained Initially
- Whisper for STT.
- Sentence-transformers for semantic linking and clustering.
- Baseline emotion model until enough locally labeled data exists.

## Validation and Governance
- Mandatory human acceptance review by legal and trauma experts.
- Holdout split by geography and language style to avoid overfitting.
- Bias checks:
  - Hindi-English code-switching.
  - regional temporal expressions.

## Integration Plan in App
- Capture Voice:
  - Whisper transcript.
  - Fragment extractor tagging.
- Pareeksha mode:
  - Strict interaction style.
  - Distress calibrator controls intensity and pacing.
- War Room mode:
  - Supportive lawyer style.
  - Temporal normalizer improves event sequencing.

## MLOps
- Version all models with semantic tags.
- Log confidence, ECE trend, and human override rate.
- Retrain trigger when acceptance rate drops below threshold.
