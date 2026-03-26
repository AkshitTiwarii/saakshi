# Saakshi Model Training Plan (Fine-Tune Only)

## Do Not Train From Scratch
Use pretrained models to reduce timeline and risk.

## Pretrained Models (Direct Use)
- Whisper: speech-to-text
- Sentence transformer: semantic linking and clustering
- Baseline emotion classifier: initial text/voice sentiment tags

## Fine-Tune Targets
1. Trauma-aware Fragment NER
- Labels:
  - TIME_CLUE
  - LOCATION_CLUE
  - SENSORY_CLUE
  - EMOTION_MARKER
  - UNCERTAINTY_MARKER
  - LEGAL_RELEVANCE

2. Temporal Clue Normalizer
- Resolve phrases such as:
  - after Diwali
  - before Holi
  - wedding season
- Output: bounded date ranges with confidence

3. Distress Scoring Calibrator
- Inputs: pause patterns, speech variance, lexical cues
- Output: calibrated distress probability for adaptive UI prompts

## Data Strategy
- Phase 1: synthetic prompts + public datasets
- Phase 2: expert-reviewed domain data
- Phase 3: continuous hard-negative mining and relabeling

## Annotation Schema
Each training sample should include:
- raw input (text/audio metadata)
- extracted entities
- timeline hints
- uncertainty markers
- expected confidence band

## Metrics
- NER F1 by label and macro-F1
- Temporal normalization exact/partial match
- Calibration: ECE/MCE for confidence estimates
- Human acceptance score from legal + trauma experts

## MLOps
- Version all datasets and models
- Register model cards with known limits
- Shadow deployment before promotion
- Drift alerts for language and region shift

## Safety Controls
- Red-team prompts for harmful legal hallucinations
- Restricted generation templates for court output
- Mandatory provenance notes in every generated report
