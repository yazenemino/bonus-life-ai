"""
Local AI module: one module for two features (health tip, scenario).
Uses Groq / Gemini cloud APIs (production). Ollama is optional and only
attempted when explicitly enabled for local development via USE_OLLAMA=true.
"""
import os
import logging
from datetime import datetime
from typing import Optional

import httpx

from app.services import gemini_service
from app.services.ai_specialist import _emergency_protocol_for

logger = logging.getLogger(__name__)

USE_OLLAMA = os.getenv("USE_OLLAMA", "false").strip().lower() in ("1", "true", "yes")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "30"))
GROQ_API_KEY = os.getenv("LOCAL_AI_GROQ_KEY", "") or os.getenv("GROQ_API_KEY", "")
# llama-3.1-8b-instant is no longer served on this Groq account (every call 404s) —
# same root cause already fixed in app.services.diet and app.services.ai_specialist.
# GROQ_MODEL isn't set anywhere in .env, so this default was silently making every
# call to this module fail on Groq and fall through to the Gemini provider below —
# a wasted round trip on every request, not a visible bug, since Gemini covered it.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

UNAVAILABLE_MESSAGE = {
    "arabic": "الخدمة غير متوفرة حالياً. يرجى المحاولة مرة أخرى بعد قليل.",
    "turkish": "Hizmet şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.",
    "english": "Service unavailable. Please try again shortly.",
}


def _call_groq(prompt: str, system: Optional[str] = None) -> str:
    """Call Groq cloud API (free tier). Raises on failure."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        # gpt-oss models spend part of this budget on hidden "thinking" tokens before
        # the visible reply — 300 was tuned for the old plain llama model and would
        # likely exhaust itself on reasoning alone for gpt-oss, truncating the actual
        # answer (the same failure mode already found and fixed for diet-plan/meal-
        # photo generation elsewhere in this codebase).
        "max_tokens": 1200,
    }
    if "gpt-oss" in GROQ_MODEL:
        # Keeps the hidden reasoning chain short so more of the budget above goes to
        # the actual reply. Gated to gpt-oss specifically — other Groq model families
        # define reasoning_effort differently and can 400 on an unrecognized value.
        payload["reasoning_effort"] = "low"
    with httpx.Client(timeout=30) as client:
        r = client.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()


def _call_ollama(prompt: str, system: Optional[str] = None) -> str:
    """Send prompt to local Ollama; return generated text. Raises on failure."""
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system
    with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        return (data.get("response") or "").strip()


def _call_gemini(prompt: str, system: Optional[str] = None) -> str:
    """Call Gemini cloud API. Raises on failure."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return gemini_service.generate_chat(messages)


def _generate(prompt: str, system: Optional[str] = None, language: str = "english") -> str:
    """Production-first: try Groq, then Gemini. Ollama only if explicitly enabled (local dev)."""
    last_err: Optional[Exception] = None

    if GROQ_API_KEY:
        try:
            return _call_groq(prompt, system=system)
        except Exception as groq_err:
            logger.warning("Groq call failed (%s), trying next provider.", groq_err)
            last_err = groq_err

    if gemini_service.is_available():
        try:
            return _call_gemini(prompt, system=system)
        except Exception as gemini_err:
            logger.warning("Gemini call failed (%s), trying next provider.", gemini_err)
            last_err = gemini_err

    if USE_OLLAMA:
        try:
            return _call_ollama(prompt, system=system)
        except Exception as ollama_err:
            logger.warning("Ollama unavailable (%s).", ollama_err)
            last_err = ollama_err

    logger.error("All AI providers failed for local_ai_module: %s", last_err)
    message = UNAVAILABLE_MESSAGE.get(language, UNAVAILABLE_MESSAGE["english"])
    raise RuntimeError(message) from last_err


# Day-of-week themes for "daily" feel (rotates so tips vary by day)
TIP_THEMES = [
    "diet and nutrition",
    "physical activity",
    "sleep and rest",
    "stress and mindfulness",
    "hydration and habits",
    "blood sugar awareness",
    "small daily wins",
]


def get_health_tip(language: str = "english") -> str:
    """Health tip of the day: date, day-of-week theme, one concrete action, disclaimer."""
    now = datetime.utcnow()
    today = now.strftime("%Y-%m-%d")
    day_name = now.strftime("%A")
    theme_index = now.weekday() % len(TIP_THEMES)
    theme = TIP_THEMES[theme_index]
    lang_instruction = (
        "Respond in Turkish only, using Turkish script throughout." if language == "turkish"
        else "Respond in Arabic only, using Arabic script (فصحى) throughout. Do not mix in any other language or script." if language == "arabic"
        else "Respond in English."
    )
    disclaimer = "Bu tıbbi bir tavsiye değildir." if language == "turkish" else "هذه ليست نصيحة طبية." if language == "arabic" else "This is not medical advice."
    system = (
        "You are a general health and wellness advisor. "
        f"CRITICAL LANGUAGE RULE: {lang_instruction} This rule overrides everything else — "
        "never answer in English unless English was explicitly requested. "
        "Give exactly one concrete action the user can do today. "
        "The tip's theme for today is given below — stay on that theme; do NOT force an unrelated "
        "connection to diabetes or any other specific condition unless the theme is actually about it. "
        "Use 2-3 short sentences in simple language, plain text only (no markdown, no ** or #). "
        f"End with a single disclaimer: '{disclaimer}' "
        "Do not give medical advice or diagnoses."
    )
    prompt = (
        f"Today is {day_name}, {today}. Focus for this tip: {theme}. "
        f"Generate one short, practical general health tip on this theme. "
        f"Give one specific action. 2-3 sentences only. {lang_instruction}"
    )
    return _generate(prompt, system=system, language=language)


def answer_scenario(
    scenario: str,
    assessment: Optional[dict] = None,
    language: str = "english",
) -> str:
    """Scenario explorer: user's 'what if' + optional assessment context, one response."""
    if not (scenario or "").strip():
        if language == "turkish":
            return "Lütfen bir senaryo girin (örn. Şekerimi 20 puan düşürürsem ne olur?)."
        if language == "arabic":
            return "يرجى إدخال سيناريو (مثال: ماذا لو خفضت مستوى السكر لدي بمقدار 20؟)."
        return "Please enter a scenario (e.g. What if I lower my glucose by 20?)."
    lang_instruction = (
        "Respond in Turkish only, using Turkish script throughout." if language == "turkish"
        else "Respond in Arabic only, using Arabic script (فصحى) throughout. Do not mix in any other language or script." if language == "arabic"
        else "Respond in English."
    )
    context = ""
    if assessment:
        risk = assessment.get("risk_level") or assessment.get("risk_level_display", "unknown")
        prob = assessment.get("probability")
        if prob is not None:
            context = f" User's last assessment: risk level = {risk}, probability = {prob:.0%}."
        else:
            context = f" User's last assessment: risk level = {risk}."
    system = (
        "You are a general health educator answering a 'what if' scenario question. "
        f"CRITICAL LANGUAGE RULE: {lang_instruction} This rule overrides everything else — "
        "never answer in English unless English was explicitly requested. "
        "Your answer should naturally cover two things as it flows: what might change for "
        "their situation, and what could help (one or two practical, general lifestyle steps). "
        "These are things to cover, not sections to label.\n\n"
        "CRITICAL FORMATTING INSTRUCTION: DO NOT use any structural headers, section names, "
        "lists, or labels in your response (e.g., COMPLETELY AVOID phrases like 'القسم الأول', "
        "'القسم الثاني', 'الجزء الأول', 'أولاً', 'ثانياً', 'Part 1', 'Part One', 'First,', "
        "'Second,', numbered points like '1.'/'2.', or any equivalent introducing a labeled "
        "section in ANY language). You MUST write the entire response as a single, natural, "
        "continuous conversational paragraph flowing smoothly from one idea to the next — no "
        "headers, no bullet points, no numbering, no bold labels of any kind, in the response "
        "language or any other. "
        "Use simple language, plain text only — no markdown, no ** or #. "
        "3-4 sentences total, as one paragraph. Do not add a disclaimer or 'medical advice' line.\n\n"
        "NEVER invent, name, or recommend a specific medication, drug, or supplement — "
        "there is no verified drug database backing this feature, and naming one risks "
        "giving fabricated (hallucinated) medical information. Speak only in terms of general "
        "lifestyle, monitoring, and 'ask your doctor about medication options' — never a drug name.\n\n"
        f"{_emergency_protocol_for(language)}"
    )
    prompt = (
        f"User asks: {scenario.strip()}.{context} "
        "Reply as a single flowing paragraph — no headers, no part labels, no numbering — that "
        "naturally covers both what might change for their situation and what could help. "
        f"{lang_instruction}"
    )
    return _generate(prompt, system=system, language=language)
