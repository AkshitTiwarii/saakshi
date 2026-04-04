import os
import re
from datetime import datetime
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from fastapi import FastAPI
from pydantic import BaseModel

HF_MODEL_ID = os.getenv("HF_LAW_MODEL_ID", "nisaar/falcon7b-Indian_Law_150Prompts_800steps_5epoch")
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
MODEL_PROVIDER = os.getenv("LAW_MODEL_PROVIDER", "hf-api").strip().lower()
LOCAL_MAX_NEW_TOKENS = int(os.getenv("LAW_LOCAL_MAX_NEW_TOKENS", "180"))
ENSEMBLE_ENABLED = os.getenv("LEGAL_ENSEMBLE_ENABLED", "true").strip().lower() == "true"

DEFAULT_ENSEMBLE_MODELS = [
    "nisaar/LLAMA2_Constitution_Of_India",
    "nisaar/falcon7b-Articles_Constitution_instruction_set_4epochs_8000maxsteps",
    "nisaar/falcon7b-Articles_Constitution_instruction_set_4epochs_15000maxsteps",
    "nisaar/falcon7b-Article19_instruction_set_4epochs_2400maxsteps",
    "nisaar/falcon7b-Indian_Law_150Prompts_800steps_5epoch_1",
    "nisaar/falcon7b-Constitution_of_India_933Prompts_2000steps_2epoch",
]

_weights_raw = os.getenv("LEGAL_ENSEMBLE_WEIGHTS", "")
_models_raw = os.getenv("LEGAL_ENSEMBLE_MODELS", "")

LEGAL_ENSEMBLE_MODELS = [m.strip() for m in _models_raw.split(",") if m.strip()] if _models_raw else DEFAULT_ENSEMBLE_MODELS

if _weights_raw:
    try:
        LEGAL_ENSEMBLE_WEIGHTS = [float(w.strip()) for w in _weights_raw.split(",") if w.strip()]
    except Exception:
        LEGAL_ENSEMBLE_WEIGHTS = []
else:
    LEGAL_ENSEMBLE_WEIGHTS = [1.0 for _ in LEGAL_ENSEMBLE_MODELS]

if not LEGAL_ENSEMBLE_WEIGHTS or len(LEGAL_ENSEMBLE_WEIGHTS) != len(LEGAL_ENSEMBLE_MODELS):
    LEGAL_ENSEMBLE_WEIGHTS = [1.0 for _ in LEGAL_ENSEMBLE_MODELS]

INLEGAL_BERT_ID = os.getenv("INLEGAL_BERT_MODEL_ID", "law-ai/InLegalBERT")
INLEGAL_BERT_ENABLED = os.getenv("INLEGAL_BERT_ENABLED", "true").strip().lower() == "true"

app = FastAPI(title="Saakshi Local ML Service", version="1.0.0")

_text_generation_pipeline = None
_inlegalbert_fill_mask = None


class LegalPredictIn(BaseModel):
    text: str
    case_id: str | None = None


class TemporalNormalizeIn(BaseModel):
    phrase: str
    reference_date: str | None = None


class TraumaAssessIn(BaseModel):
    text: str


class DistressCalibrateIn(BaseModel):
    transcript: str
    pause_rate: float | None = None
    speech_rate: float | None = None
    silence_ratio: float | None = None


class MolminerExtractIn(BaseModel):
    text: str


def _lazy_local_pipeline():
    global _text_generation_pipeline
    if _text_generation_pipeline is not None:
        return _text_generation_pipeline

    try:
        from transformers import pipeline

        _text_generation_pipeline = pipeline(
            "text-generation",
            model=HF_MODEL_ID,
            tokenizer=HF_MODEL_ID,
            trust_remote_code=True,
            device_map="auto",
        )
    except Exception:
        _text_generation_pipeline = None
    return _text_generation_pipeline


def _lazy_inlegalbert_fill_mask():
    global _inlegalbert_fill_mask
    if _inlegalbert_fill_mask is not None:
        return _inlegalbert_fill_mask
    try:
        from transformers import pipeline, AutoTokenizer, AutoModelForPreTraining

        tokenizer = AutoTokenizer.from_pretrained(INLEGAL_BERT_ID)
        model = AutoModelForPreTraining.from_pretrained(INLEGAL_BERT_ID)
        _inlegalbert_fill_mask = pipeline("fill-mask", model=model, tokenizer=tokenizer)
    except Exception:
        _inlegalbert_fill_mask = None
    return _inlegalbert_fill_mask


def _hf_api_generate(prompt: str) -> str:
    if not HF_API_TOKEN:
        return ""
    url = f"https://api-inference.huggingface.co/models/{HF_MODEL_ID}"
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 220,
            "temperature": 0.2,
            "return_full_text": False,
        },
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return str(data[0].get("generated_text", "")).strip()
        if isinstance(data, dict) and data.get("generated_text"):
            return str(data["generated_text"]).strip()
        return ""
    except Exception:
        return ""


def _hf_api_generate_for_model(model_id: str, prompt: str) -> str:
    if not HF_API_TOKEN:
        return ""
    url = f"https://api-inference.huggingface.co/models/{model_id}"
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 220,
            "temperature": 0.2,
            "return_full_text": False,
        },
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=75)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return str(data[0].get("generated_text", "")).strip()
        if isinstance(data, dict) and data.get("generated_text"):
            return str(data["generated_text"]).strip()
        return ""
    except Exception:
        return ""


def _local_generate(prompt: str) -> str:
    pipe = _lazy_local_pipeline()
    if pipe is None:
        return ""
    try:
        out = pipe(prompt, max_new_tokens=LOCAL_MAX_NEW_TOKENS, temperature=0.2)
        if isinstance(out, list) and out:
            return str(out[0].get("generated_text", "")).strip()
    except Exception:
        return ""
    return ""


def _fallback_legal_analysis(text: str) -> dict[str, Any]:
    t = text.lower()
    suggestions: list[dict[str, str]] = []
    if "threat" in t:
        suggestions.append({"code": "IPC 506", "title": "Criminal Intimidation"})
    if "touch" in t or "molest" in t:
        suggestions.append({"code": "IPC 354", "title": "Outraging Modesty"})
    if "stalk" in t:
        suggestions.append({"code": "IPC 354D", "title": "Stalking"})
    if "rape" in t or "sexual" in t:
        suggestions.append({"code": "IPC 376", "title": "Sexual Assault (threshold review needed)"})
    if not suggestions:
        suggestions = [{"code": "CrPC 154", "title": "FIR Registration Guidance"}]

    return {
        "provider": "fallback-rules",
        "summary": "Rule-based legal prediction used because model output was unavailable.",
        "suggestions": suggestions,
        "confidence": 0.46,
    }


def _extract_legal_codes(raw_text: str) -> list[str]:
    patterns = [
        r"\bIPC\s*\d+[A-Z]?\b",
        r"\bCrPC\s*\d+[A-Z]?\b",
        r"\bArticle\s*\d+[A-Z]?\b",
        r"\bIT\s*Act\s*\d+[A-Z]?\b",
    ]
    hits: list[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, raw_text, flags=re.IGNORECASE):
            hits.append(re.sub(r"\s+", " ", match.strip()))
    normalized = []
    for item in hits:
        token = item.upper().replace("ARTICLE", "Article").replace("CRPC", "CrPC").replace("IT ACT", "IT Act")
        normalized.append(token)
    return sorted(set(normalized))


def _ensemble_prompt(statement: str) -> str:
    return (
        "You are a legal assistant for Indian law and constitution analysis.\n"
        "Task:\n"
        "1) Identify relevant legal references from IPC, CrPC, Constitution Articles, IT Act if applicable.\n"
        "2) Give short rationale for each.\n"
        "3) Avoid fabrication; if uncertain, state uncertainty.\n\n"
        f"Statement: {statement}\n"
        "Return concise legal analysis."
    )


def _run_hf_ensemble(statement: str) -> dict[str, Any]:
    prompt = _ensemble_prompt(statement)

    weighted_votes: dict[str, float] = {}
    model_outputs: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=min(6, len(LEGAL_ENSEMBLE_MODELS))) as executor:
        futures = {
            executor.submit(_hf_api_generate_for_model, model_id, prompt): (model_id, LEGAL_ENSEMBLE_WEIGHTS[idx])
            for idx, model_id in enumerate(LEGAL_ENSEMBLE_MODELS)
        }

        for future in as_completed(futures):
            model_id, weight = futures[future]
            try:
                raw = future.result()
            except Exception:
                raw = ""

            codes = _extract_legal_codes(raw)
            for code in codes:
                weighted_votes[code] = weighted_votes.get(code, 0.0) + weight

            model_outputs.append(
                {
                    "model": model_id,
                    "weight": weight,
                    "codes": codes,
                    "rawText": raw[:800],
                    "ok": bool(raw),
                }
            )

    total_weight = sum(LEGAL_ENSEMBLE_WEIGHTS) or 1.0
    ranked = sorted(weighted_votes.items(), key=lambda x: x[1], reverse=True)

    suggestions = [
        {
            "code": code,
            "title": "Ensemble consensus legal reference",
        }
        for code, _score in ranked[:8]
    ]

    confidence = 0.0
    if ranked:
        top_score = ranked[0][1]
        confidence = max(0.0, min(0.97, round(top_score / total_weight, 3)))

    return {
        "provider": "hf-ensemble",
        "summary": "Weighted ensemble across multiple Indian law/constitution models.",
        "suggestions": suggestions,
        "confidence": confidence,
        "ensemble": {
            "models": LEGAL_ENSEMBLE_MODELS,
            "weights": LEGAL_ENSEMBLE_WEIGHTS,
            "votes": [{"code": c, "score": round(s, 3)} for c, s in ranked],
            "modelOutputs": model_outputs,
        },
    }


def _inlegalbert_constitutional_signal(statement: str) -> dict[str, Any]:
    if not INLEGAL_BERT_ENABLED:
        return {
            "enabled": False,
            "labels": [],
            "score": 0.0,
            "note": "InLegalBERT signal disabled",
        }

    fill_mask = _lazy_inlegalbert_fill_mask()
    if fill_mask is None:
        return {
            "enabled": True,
            "labels": [],
            "score": 0.0,
            "note": "InLegalBERT unavailable in runtime",
        }

    probe = f"In constitutional context, Article {fill_mask.tokenizer.mask_token} may apply to: {statement[:220]}"
    try:
        preds = fill_mask(probe, top_k=5)
    except Exception:
        return {
            "enabled": True,
            "labels": [],
            "score": 0.0,
            "note": "InLegalBERT inference failed",
        }

    labels = []
    best = 0.0
    for pred in preds:
        token = str(pred.get("token_str", "")).strip()
        score = float(pred.get("score", 0.0))
        if token:
            labels.append({"token": token, "score": round(score, 4)})
            best = max(best, score)

    return {
        "enabled": True,
        "labels": labels,
        "score": round(best, 4),
        "note": "InLegalBERT fill-mask constitutional signal",
    }


def _temporal_normalize_india(phrase: str, reference_date: str | None) -> dict[str, Any]:
    p = phrase.strip().lower()
    ref = datetime.utcnow()
    if reference_date:
        try:
            ref = datetime.fromisoformat(reference_date.replace("Z", "+00:00"))
        except Exception:
            pass

    year = ref.year
    if "diwali" in p:
        start = f"{year}-10-15"
        end = f"{year}-11-20"
        return {"startDate": start, "endDate": end, "confidence": 0.72, "rationale": "Festival window heuristic for Diwali context."}
    if "holi" in p:
        start = f"{year}-03-01"
        end = f"{year}-03-31"
        return {"startDate": start, "endDate": end, "confidence": 0.76, "rationale": "Festival window heuristic for Holi context."}
    if "monsoon" in p:
        start = f"{year}-06-01"
        end = f"{year}-09-30"
        return {"startDate": start, "endDate": end, "confidence": 0.7, "rationale": "India monsoon seasonal window heuristic."}

    return {
        "startDate": ref.strftime("%Y-%m-%d"),
        "endDate": ref.strftime("%Y-%m-%d"),
        "confidence": 0.4,
        "rationale": "No recognized Indian temporal cue; defaulting to reference date.",
    }


def _trauma_assess(text: str) -> dict[str, Any]:
    t = text.lower()
    flags = []
    if any(token in t for token in ["panic", "frozen", "couldn't breathe", "shaking", "flashback"]):
        flags.append("acute_distress_marker")
    if any(token in t for token in ["not sure", "maybe", "i think", "can't remember"]):
        flags.append("memory_fragmentation")
    if any(token in t for token in ["alone", "unsafe", "threat", "weapon"]):
        flags.append("safety_risk")

    band = "LOW"
    if len(flags) >= 3:
        band = "HIGH"
    elif len(flags) >= 1:
        band = "MEDIUM"

    return {
        "framework": "trauma-informed-ai-framework-adapter",
        "band": band,
        "flags": flags,
        "guidance": [
            "Use non-leading prompts.",
            "Allow pauses and avoid forcing chronology.",
            "Separate uncertain memory from confirmed facts.",
        ],
    }


def _distress_calibrate(payload: DistressCalibrateIn) -> dict[str, Any]:
    t = payload.transcript.lower()
    score = 0.25
    if any(token in t for token in ["panic", "fear", "terrified", "crying", "help"]):
        score += 0.24
    if any(token in t for token in ["can't breathe", "shaking", "freeze", "numb"]):
        score += 0.18
    if payload.pause_rate is not None:
        score += min(0.2, max(0.0, payload.pause_rate * 0.12))
    if payload.silence_ratio is not None:
        score += min(0.2, max(0.0, payload.silence_ratio * 0.2))
    if payload.speech_rate is not None and payload.speech_rate < 80:
        score += 0.1

    score = max(0.0, min(1.0, round(score, 3)))
    band = "LOW"
    if score >= 0.7:
        band = "HIGH"
    elif score >= 0.42:
        band = "MEDIUM"

    pace = "normal"
    if band == "HIGH":
        pace = "slow_supportive"
    elif band == "MEDIUM":
        pace = "calm_structured"

    return {
        "provider": "smart-distress-monitor-adapter",
        "score": score,
        "band": band,
        "recommendedPace": pace,
    }


def _molminer_extract(text: str) -> dict[str, Any]:
    formulas = sorted(set(re.findall(r"\b(?:[A-Z][a-z]?\d*){2,}\b", text)))
    return {
        "provider": "molminer-adapter",
        "entities": formulas,
        "count": len(formulas),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": MODEL_PROVIDER,
        "model": HF_MODEL_ID,
        "ensembleEnabled": ENSEMBLE_ENABLED,
        "ensembleCount": len(LEGAL_ENSEMBLE_MODELS),
        "inlegalBert": INLEGAL_BERT_ID,
    }


@app.post("/legal/predict")
def legal_predict(payload: LegalPredictIn):
    if ENSEMBLE_ENABLED and MODEL_PROVIDER == "hf-api" and HF_API_TOKEN:
        ensemble = _run_hf_ensemble(payload.text)
        constitutional = _inlegalbert_constitutional_signal(payload.text)
        return {
            "caseId": payload.case_id,
            **ensemble,
            "constitutionalSignal": constitutional,
        }

    prompt = _ensemble_prompt(payload.text)

    text_out = ""
    if MODEL_PROVIDER == "local":
        text_out = _local_generate(prompt)
    if not text_out:
        text_out = _hf_api_generate(prompt)

    if not text_out:
        fallback = _fallback_legal_analysis(payload.text)
        fallback["rawText"] = ""
        fallback["caseId"] = payload.case_id
        fallback["constitutionalSignal"] = _inlegalbert_constitutional_signal(payload.text)
        return fallback

    codes = _extract_legal_codes(text_out)
    suggestions = [{"code": code, "title": "Model extracted legal reference"} for code in codes[:8]]

    return {
        "caseId": payload.case_id,
        "provider": f"single-model:{HF_MODEL_ID}",
        "summary": "Generated by configured legal language model.",
        "suggestions": suggestions,
        "confidence": 0.61 if suggestions else 0.45,
        "rawText": text_out,
        "constitutionalSignal": _inlegalbert_constitutional_signal(payload.text),
    }


@app.post("/temporal/normalize")
def temporal_normalize(payload: TemporalNormalizeIn):
    return _temporal_normalize_india(payload.phrase, payload.reference_date)


@app.post("/trauma/assess")
def trauma_assess(payload: TraumaAssessIn):
    return _trauma_assess(payload.text)


@app.post("/distress/calibrate")
def distress_calibrate(payload: DistressCalibrateIn):
    return _distress_calibrate(payload)


@app.post("/molminer/extract")
def molminer_extract(payload: MolminerExtractIn):
    return _molminer_extract(payload.text)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
