"""AI Meal Photo Analyzer: vision-based meal identification and carb estimation.

Uses Groq vision when GROQ_API_KEY is set, falls back to Gemini vision when
GEMINI_API_KEY is set. All user-facing text is localized to the caller's language.
Authors: Muhammed Jalahej, Yazen Emino
"""

import os
import re
import json
import asyncio
import logging
from typing import Dict, Any, Optional

from app.services import gemini_service

logger = logging.getLogger(__name__)

# Groq vision: use Llama 4 Scout (or Maverick). LLaVA was deprecated.
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")


class MealAnalysisError(Exception):
    """Raised when meal photo analysis cannot produce a real result.

    Carries an HTTP status code so the route can respond honestly (400/503/502)
    instead of returning a fabricated 200 with placeholder data.
    """

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# User-facing error strings (no fake meal_name/carb_level here — these are errors, not results).
_ERROR_STRINGS = {
    "no_image": {
        "arabic": "يرجى رفع أو التقاط صورة لوجبتك.",
        "turkish": "Lütfen bir öğün fotoğrafı yükleyin veya çekin.",
        "english": "Please upload or take a photo of your meal.",
    },
    "unavailable": {
        "arabic": "خدمة تحليل الصور غير مُهيأة حالياً. يرجى المحاولة لاحقاً.",
        "turkish": "Görsel analiz hizmeti şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.",
        "english": "The vision analysis service is not configured. Please try again later.",
    },
    "api_error": {
        "arabic": "تعذر تحليل الصورة. يرجى المحاولة مرة أخرى بصورة أوضح.",
        "turkish": "Fotoğraf analiz edilemedi. Lütfen daha net bir fotoğrafla tekrar deneyin.",
        "english": "Could not analyze the photo. Please try again with a clearer image.",
    },
    "default_swaps": {
        "arabic": "فكر في إضافة المزيد من الخضروات واختيار الحبوب الكاملة عند الإمكان.",
        "turkish": "Mümkün olduğunda daha fazla sebze eklemeyi ve tam tahıl seçmeyi düşünün.",
        "english": "Consider adding more vegetables and choosing whole grains when possible.",
    },
    # Used only when the model DID respond but left meal_name blank — a real (partial)
    # result, not a pipeline failure, so it's kept separate from the error strings above.
    "unidentified_meal": {
        "arabic": "وجبة غير محددة",
        "turkish": "Belirlenemeyen öğün",
        "english": "Unidentified meal",
    },
}

# Keyword variants seen in real model output, used by the text-fallback parser.
# Lines are stripped of markdown emphasis (**bold**, __bold__) before matching.
# Named "val" group avoids miscounting when the label alternation gains nested optional groups.
_MEAL_LABEL_RE = re.compile(
    r"^(meal(\s*name)?|الوجبة|اسم\s*الوجبة|yemek(\s*adı)?)\s*[:：]\s*(?P<val>.+)$", re.IGNORECASE
)
_CARB_LABEL_RE = re.compile(
    r"^(carb(s|\s*level)?|(ال)?كربوهيدرات|مستوى\s*الكربوهيدرات|karbonhidrat(\s*düzeyi)?)\s*[:：]\s*(?P<val>.+)$",
    re.IGNORECASE,
)
_SWAPS_LABEL_RE = re.compile(
    r"^(healthier\s*swaps?|alternatives?|suggestions?|(ال)?بدائل(\s*الصحية|\s*صحية)?|بديل|"
    r"(daha\s*sağlıklı\s*)?alternatifler)\s*[:：]\s*(?P<val>.+)$",
    re.IGNORECASE,
)


def _lang(language: str) -> str:
    return language if language in ("arabic", "turkish") else "english"


def _normalize_carb_level(text: str) -> str:
    """Map real model output to low | medium | high. Only called on an actual
    model response, so defaulting ambiguous/unrecognized text to 'medium' here
    reflects a real (if imprecise) analysis — not a pipeline failure."""
    t = (text or "").strip().lower()
    if "low" in t or "düşük" in t or "منخفض" in t:
        return "low"
    if "high" in t or "yüksek" in t or "مرتفع" in t or "عالي" in t:
        return "high"
    if t and "medium" not in t and "orta" not in t and "متوسط" not in t:
        logger.warning("Meal photo: unrecognized carb_level text %r, defaulting to medium", text)
    return "medium"


def _extract_json_object(raw: str) -> Optional[dict]:
    """Pull a JSON object out of a model response that may include markdown fences or stray text."""
    text = (raw or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        pass
    # Tolerate a common LLM slip: trailing comma before a closing brace/bracket.
    try:
        return json.loads(re.sub(r",\s*([}\]])", r"\1", candidate))
    except (json.JSONDecodeError, ValueError):
        return None


def _stringify_field(value: Any) -> str:
    """Coerce a JSON field to display text; models sometimes return a list of
    strings for healthier_swaps instead of one string — join those naturally."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(_stringify_field(v) for v in value if v).strip()
    return str(value).strip()


def _parse_text_fallback(raw: str, language: str) -> Dict[str, Any]:
    """Line-based heuristic parser used when the model doesn't return valid JSON."""
    meal_name = ""
    carb_level = "medium"
    healthier_swaps = ""

    for line in raw.split("\n"):
        line = line.replace("**", "").replace("__", "").strip()
        if not line:
            continue
        m = _MEAL_LABEL_RE.match(line)
        if m:
            meal_name = m.group("val").strip()
            continue
        m = _CARB_LABEL_RE.match(line)
        if m:
            carb_level = _normalize_carb_level(m.group("val"))
            continue
        m = _SWAPS_LABEL_RE.match(line)
        if m:
            healthier_swaps = m.group("val").strip()
            continue

    if not healthier_swaps:
        for para in raw.split("\n\n"):
            if _SWAPS_LABEL_RE.search(para) or "swap" in para.lower() or "بدائل" in para or "بديل" in para:
                healthier_swaps = para.strip()[:500]
                break
    if not healthier_swaps:
        healthier_swaps = _ERROR_STRINGS["default_swaps"][_lang(language)]
    if not meal_name:
        meal_name = raw.strip().split("\n")[0][:255] or _ERROR_STRINGS["unidentified_meal"][_lang(language)]

    return {
        "meal_name": meal_name[:255],
        "carb_level": carb_level,
        "healthier_swaps": healthier_swaps[:2000],
    }


def _parse_analysis_response(raw: str, language: str) -> Dict[str, Any]:
    """Extract meal_name, carb_level, healthier_swaps from the model's response.

    Tries strict JSON first (what the prompt asks for); falls back to flexible
    line-based matching for models/responses that don't comply.
    """
    logger.info("Meal photo raw model response (%s): %s", language, raw)

    if not (raw or "").strip():
        # The model call succeeded but returned nothing usable — this is a real
        # failure, not a partial result, so surface it as an error rather than
        # synthesizing a "successful" response.
        raise MealAnalysisError(502, _ERROR_STRINGS["api_error"][_lang(language)])

    data = _extract_json_object(raw)
    if data:
        meal_name = _stringify_field(data.get("meal_name"))
        carb_level_raw = _stringify_field(data.get("carb_level"))
        healthier_swaps = _stringify_field(data.get("healthier_swaps"))
        if meal_name or healthier_swaps:
            return {
                "meal_name": (meal_name or _ERROR_STRINGS["unidentified_meal"][_lang(language)])[:255],
                "carb_level": _normalize_carb_level(carb_level_raw),
                "healthier_swaps": (healthier_swaps or _ERROR_STRINGS["default_swaps"][_lang(language)])[:2000],
            }
        logger.warning("Meal photo JSON parsed but meal_name/healthier_swaps both empty; using text fallback")

    return _parse_text_fallback(raw, language)


def _build_prompt(language: str) -> str:
    if language == "arabic":
        return (
            "انظر إلى صورة الوجبة هذه. أجب بكائن JSON صالح فقط، بدون أي نص إضافي أو علامات Markdown أو ```، "
            "بالتنسيق التالي بالضبط:\n"
            '{"meal_name": "اسم قصير للوجبة بالعربية", "carb_level": "low أو medium أو high (بالإنجليزية فقط)", '
            '"healthier_swaps": "2-3 اقتراحات قصيرة بالعربية لبدائل صحية مناسبة لمرضى السكري"}\n'
            "اكتب قيمتي meal_name و healthier_swaps باللغة العربية الفصحى، واجعل قيمة carb_level كلمة إنجليزية واحدة فقط "
            "من: low, medium, high."
        )
    if language == "turkish":
        return (
            "Bu öğün fotoğrafına bak. Sadece geçerli bir JSON nesnesiyle yanıt ver, ekstra metin veya Markdown/``` "
            "kullanma, tam olarak şu formatta:\n"
            '{"meal_name": "kısa yemek adı (Türkçe)", "carb_level": "low, medium veya high (İngilizce)", '
            '"healthier_swaps": "diyabet dostu 2-3 kısa öneri (Türkçe)"}\n'
            "meal_name ve healthier_swaps değerlerini Türkçe yaz; carb_level değeri sadece şu İngilizce "
            "kelimelerden biri olsun: low, medium, high."
        )
    return (
        "Look at this meal photo. Respond with ONLY a valid JSON object, no extra text and no markdown/```, "
        "in exactly this format:\n"
        '{"meal_name": "short meal name", "carb_level": "low, medium, or high", '
        '"healthier_swaps": "2-3 short diabetes-friendly suggestions"}'
    )


async def _analyze_with_groq(image_base64: str, prompt: str, api_key: str) -> str:
    import httpx
    data_uri = f"data:image/jpeg;base64,{image_base64}"
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
        # Only one token-limit param: sending both max_tokens and max_completion_tokens is
        # redundant and the smaller one can silently truncate the JSON object mid-string,
        # which is what was producing invalid JSON / "Analysis failed" results.
        "max_completion_tokens": 500,
        "temperature": 0.3,
        # Force strict JSON so the response is always machine-parseable.
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Groq vision API error: {r.status_code} {r.text}")
        data = r.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""


async def analyze_meal_image(image_base64: str, language: str = "english") -> Dict[str, Any]:
    """
    Analyze a meal photo: identify meal, estimate carb level, suggest healthier swaps.
    image_base64: base64-encoded image (no data URL prefix, or with data:image/...;base64,)
    language: response language ("arabic", "turkish", or "english")
    """
    # Normalize: allow optional data URL prefix
    if "," in image_base64 and "base64," in image_base64:
        image_base64 = image_base64.split("base64,", 1)[-1].strip()
    if not image_base64:
        raise MealAnalysisError(400, _ERROR_STRINGS["no_image"][_lang(language)])

    prompt = _build_prompt(language)
    groq_key = os.getenv("GROQ_API_KEY")
    has_groq = bool(groq_key and groq_key.startswith("gsk_"))
    has_gemini = gemini_service.is_available()

    if not has_groq and not has_gemini:
        logger.error("No vision API configured (GROQ_API_KEY/GEMINI_API_KEY)")
        raise MealAnalysisError(503, _ERROR_STRINGS["unavailable"][_lang(language)])

    if has_groq:
        try:
            text = await _analyze_with_groq(image_base64, prompt, groq_key)
            return _parse_analysis_response(text, language)
        except MealAnalysisError:
            raise
        except Exception as e:
            logger.error("Groq vision analysis failed: %s", e)
            if not has_gemini:
                raise MealAnalysisError(502, _ERROR_STRINGS["api_error"][_lang(language)]) from e

    try:
        text = await asyncio.to_thread(gemini_service.generate_vision, image_base64, prompt, True)
        return _parse_analysis_response(text, language)
    except MealAnalysisError:
        raise
    except Exception as e:
        logger.exception("Meal photo analysis failed (Gemini): %s", e)
        raise MealAnalysisError(502, _ERROR_STRINGS["api_error"][_lang(language)]) from e
