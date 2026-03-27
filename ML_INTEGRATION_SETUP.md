# ML Integration Setup (Directly in This Codebase)

This project now includes a local Python ML service at `ml-service/` and backend proxy routes in `server.ts`.

## What is integrated

1. Indian legal model routing:
- Weighted ensemble models:
  - `nisaar/LLAMA2_Constitution_Of_India`
  - `nisaar/falcon7b-Articles_Constitution_instruction_set_4epochs_8000maxsteps`
  - `nisaar/falcon7b-Articles_Constitution_instruction_set_4epochs_15000maxsteps`
  - `nisaar/falcon7b-Article19_instruction_set_4epochs_2400maxsteps`
  - `nisaar/falcon7b-Indian_Law_150Prompts_800steps_5epoch_1`
  - `nisaar/falcon7b-Constitution_of_India_933Prompts_2000steps_2epoch`
- Additional constitutional signal model:
  - `law-ai/InLegalBERT` (fill-mask probe signal)
- Endpoint: `POST /api/ml/legal-predict`

2. Temporal normalizer (Indian context cues):
- Endpoint: `POST /api/ml/temporal-normalize`

3. Trauma-informed assessment adapter:
- Endpoint: `POST /api/ml/trauma-assess`

4. Distress calibrator adapter:
- Endpoint: `POST /api/ml/distress-calibrate`

5. Molminer adapter endpoint:
- Endpoint: `POST /api/ml/molminer-extract`

## Install and run

From project root:

```bash
npm run ml:install
npm run ml:serve
```

In a second terminal:

```bash
npm run dev
```

## Environment variables

### Backend (`server.ts`)
- `ML_SERVICE_URL` default: `http://127.0.0.1:8001`

### Python ML service (`ml-service/main.py`)
- `HF_LAW_MODEL_ID` default: `nisaar/falcon7b-Indian_Law_150Prompts_800steps_5epoch`
- `HF_API_TOKEN` for Hugging Face Inference API
- `LAW_MODEL_PROVIDER` values:
  - `hf-api` (default, practical)
  - `local` (attempt local transformer load; very resource heavy)
- `LAW_LOCAL_MAX_NEW_TOKENS` default: `180`
- `LEGAL_ENSEMBLE_ENABLED` default: `true`
- `LEGAL_ENSEMBLE_MODELS` comma-separated model list
- `LEGAL_ENSEMBLE_WEIGHTS` comma-separated float weights
- `INLEGAL_BERT_ENABLED` default: `true`
- `INLEGAL_BERT_MODEL_ID` default: `law-ai/InLegalBERT`

## Important note on “install directly in project”

The model is integrated directly via:
- local Python service code in this repo
- dependency list in `ml-service/requirements.txt`
- backend routes in `server.ts`
- mobile calls in `mobile-app/src/services/apiClient.ts`

For large 7B model local inference, use a high-VRAM machine or keep `hf-api` mode.

## Test the integrated routes

With backend and ML service running:

```bash
npm run ml:test
```

With ensemble enabled and `HF_API_TOKEN` configured, `POST /api/ml/legal-predict` returns:
- aggregated weighted votes by legal code
- per-model outputs
- constitutional signal from InLegalBERT

## Mobile usage methods already added

In `mobile-app/src/services/apiClient.ts`:
- `predictLegalForCurrentCase(text)`
- `normalizeTemporalPhraseForCurrentCase(phrase)`
- `assessTraumaForCurrentCase(text)`
- `calibrateDistressForCurrentCase({ transcript, pauseRate, speechRate, silenceRatio })`

You can call these from any screen (War Room, Pareeksha, Voice Capture, Settings).

## Repo links mapping

The repos you shared are mapped as adapters in this integration:
- Indian-LawyerGPT / Hugging Face model: legal prediction route
- trauma-informed-ai-framework: trauma guidance output route
- M4 timeseries notebook: temporal normalization route (Indian cue-aware heuristic adapter)
- smart-distress-monitor + visual distress docs: distress calibration route
- molminer: extraction route

## Next production step (recommended)

When you are ready to retrain/fine-tune, keep this serving shape stable and swap internals:
- keep same API contracts
- replace adapter internals with your trained checkpoints
- avoid breaking mobile/web clients
