"""AI Meal Photo Analyzer: vision-based meal identification and carb estimation.

Uses Groq vision when GROQ_API_KEY is set, falls back to Gemini vision when
GEMINI_API_KEY is set. All user-facing text is localized to the caller's language.
Authors: Muhammed Jalahej, Yazen Emino
"""

import os
import asyncio
import logging
from typing import Dict, Any

from app.services import gemini_service

logger = logging.getLogger(__name__)

# Groq vision: use Llama 4 Scout (or Maverick). LLaVA was deprecated.
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

_STRINGS = {
    "no_image": {
        "arabic": {"meal_name": "لا توجد صورة", "healthier_swaps": "يرجى رفع أو التقاط صورة لوجبتك."},
        "turkish": {"meal_name": "Görsel yok", "healthier_swaps": "Lütfen bir öğün fotoğrafı yükleyin veya çekin."},
        "english": {"meal_name": "No image", "healthier_swaps": "Please upload or take a photo of your meal."},
    },
    "unavailable": {
        "arabic": {
            "meal_name": "التحليل غير متوفر حالياً",
            "healthier_swaps": "أضف المزيد من الخضروات واختر الحبوب الكاملة. قلل من السكريات المضافة.",
        },
        "turkish": {
            "meal_name": "Analiz şu anda kullanılamıyor",
            "healthier_swaps": "Daha fazla sebze ekleyin ve tam tahılları tercih edin. Eklenmiş şekeri sınırlayın.",
        },
        "english": {
            "meal_name": "Analysis unavailable",
            "healthier_swaps": "Add vegetables and choose whole grains. Limit added sugars.",
        },
    },
    "api_error": {
        "arabic": {"meal_name": "تعذر التحليل", "healthier_swaps": "حدث خطأ في خدمة التحليل. يرجى المحاولة مرة أخرى."},
        "turkish": {"meal_name": "Analiz kullanılamıyor", "healthier_swaps": "Görsel analiz hatası. Lütfen tekrar deneyin."},
        "english": {"meal_name": "Analysis unavailable", "healthier_swaps": "Vision API error. Please try again."},
    },
    "failed": {
        "arabic": {"meal_name": "فشل التحليل", "healthier_swaps": "حدث خطأ ما. يرجى تجربة صورة أخرى."},
        "turkish": {"meal_name": "Analiz başarısız", "healthier_swaps": "Bir şeyler ters gitti. Lütfen başka bir fotoğraf deneyin."},
        "english": {"meal_name": "Analysis failed", "healthier_swaps": "Something went wrong. Please try another photo."},
    },
    "default_swaps": {
        "arabic": "فكر في إضافة المزيد من الخضروات واختيار الحبوب الكاملة عند الإمكان.",
        "turkish": "Mümkün olduğunda daha fazla sebze eklemeyi ve tam tahıl seçmeyi düşünün.",
        "english": "Consider adding more vegetables and choosing whole grains when possible.",
    },
}


def _lang(language: str) -> str:
    return language if language in ("arabic", "turkish") else "english"


def _fixed(kind: str, language: str) -> Dict[str, Any]:
    strings = _STRINGS[kind][_lang(language)]
    return {
        "meal_name": strings["meal_name"],
        "carb_level": "medium",
        "healthier_swaps": strings["healthier_swaps"],
    }


def _normalize_carb_level(text: str) -> str:
    """Map model output to low | medium | high."""
    t = (text or "").strip().lower()
    if "low" in t or "düşük" in t or "منخفض" in t:
        return "low"
    if "high" in t or "yüksek" in t or "مرتفع" in t or "عالي" in t:
        return "high"
    return "medium"


def _parse_analysis_response(raw: str, language: str) -> Dict[str, Any]:
    """Extract meal_name, carb_level, healthier_swaps from LLM response."""
    meal_name = ""
    carb_level = "medium"
    healthier_swaps = ""

    # Try structured lines: Meal: ... Carb: ... Swaps: ...
    for line in raw.split("\n"):
        line = line.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith("meal:") or lower.startswith("meal name:") or "الوجبة" in line or "yemek" in lower:
            candidate = line.split(":", 1)[-1].strip()
            if candidate:
                meal_name = candidate
        elif ("carb" in lower or "كربوهيدرات" in line or "karbonhidrat" in lower) and ":" in line:
            part = line.split(":", 1)[-1].strip().lower()
            carb_level = _normalize_carb_level(part)
        elif "swap" in lower or "alternative" in lower or "suggestion" in lower or "بدائل" in line or "بديل" in line or "alternatif" in lower:
            candidate = line.split(":", 1)[-1].strip()
            if candidate:
                healthier_swaps = candidate

    if not healthier_swaps:
        for para in raw.split("\n\n"):
            if "swap" in para.lower() or "healthier" in para.lower() or "بدائل" in para or "بديل" in para:
                healthier_swaps = para.strip()[:500]
                break
    if not healthier_swaps:
        healthier_swaps = _STRINGS["default_swaps"][_lang(language)]
    if not meal_name:
        meal_name = raw.strip().split("\n")[0][:255] or _STRINGS["unavailable"][_lang(language)]["meal_name"]

    return {
        "meal_name": meal_name[:255],
        "carb_level": _normalize_carb_level(carb_level) if carb_level != "medium" else carb_level,
        "healthier_swaps": healthier_swaps[:2000],
    }


def _build_prompt(language: str) -> str:
    if language == "arabic":
        return (
            "انظر إلى صورة الوجبة هذه وأجب باللغة العربية فقط، بالتنسيق التالي بالضبط:\n"
            "الوجبة: [اسم قصير للوجبة]\n"
            "الكربوهيدرات: [منخفض / متوسط / مرتفع]\n"
            "بدائل صحية: [2-3 اقتراحات قصيرة لبدائل مناسبة لمرضى السكري]"
        )
    if language == "turkish":
        return (
            "Bu öğün fotoğrafına bak ve sadece Türkçe olarak, tam olarak şu formatta yanıt ver:\n"
            "Yemek: [kısa yemek adı]\n"
            "Karbonhidrat düzeyi: [düşük / orta / yüksek]\n"
            "Daha sağlıklı alternatifler: [diyabet dostu 2-3 kısa öneri]"
        )
    return (
        "Look at this meal photo. Reply in exactly this format:\n"
        "Meal: [short meal name]\n"
        "Carb level: [low / medium / high]\n"
        "Healthier swaps: [2-3 short suggestions for diabetes-friendly alternatives]"
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
        "max_tokens": 400,
        "temperature": 0.3,
        "max_completion_tokens": 1024,
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
        return _fixed("no_image", language)

    prompt = _build_prompt(language)
    groq_key = os.getenv("GROQ_API_KEY")
    has_groq = bool(groq_key and groq_key.startswith("gsk_"))
    has_gemini = gemini_service.is_available()

    if not has_groq and not has_gemini:
        logger.warning("No vision API configured (GROQ_API_KEY/GEMINI_API_KEY); returning localized placeholder")
        return _fixed("unavailable", language)

    if has_groq:
        try:
            text = await _analyze_with_groq(image_base64, prompt, groq_key)
            return _parse_analysis_response(text, language)
        except Exception as e:
            logger.error("Groq vision analysis failed: %s", e)
            if not has_gemini:
                return _fixed("api_error", language)

    try:
        text = await asyncio.to_thread(gemini_service.generate_vision, image_base64, prompt)
        return _parse_analysis_response(text, language)
    except Exception as e:
        logger.exception("Meal photo analysis failed (Gemini): %s", e)
        return _fixed("failed", language)
