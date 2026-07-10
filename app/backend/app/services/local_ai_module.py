"""
Local AI module: one module for two features (health tip, scenario).
Tries Ollama first (local); falls back to Groq cloud API if GROQ_API_KEY is set.
"""
import os
import logging
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "30"))
GROQ_API_KEY = os.getenv("LOCAL_AI_GROQ_KEY", "") or os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


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
    payload = {"model": GROQ_MODEL, "messages": messages, "max_tokens": 300}
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


def _generate(prompt: str, system: Optional[str] = None) -> str:
    """Try Ollama first; fall back to Groq if available."""
    try:
        return _call_ollama(prompt, system=system)
    except Exception as ollama_err:
        logger.warning("Ollama unavailable (%s), trying Groq.", ollama_err)
        if GROQ_API_KEY:
            try:
                return _call_groq(prompt, system=system)
            except Exception as groq_err:
                logger.exception("Groq call failed: %s", groq_err)
                raise RuntimeError("AI service unavailable. Please try again later.") from groq_err
        raise RuntimeError("Service unavailable: run ollama with " + OLLAMA_MODEL) from ollama_err


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
    lang_instruction = "Respond in Turkish." if language == "turkish" else "Respond in Arabic." if language == "arabic" else "Respond in English."
    disclaimer = "Bu tıbbi bir tavsiye değildir." if language == "turkish" else "هذه ليست نصيحة طبية." if language == "arabic" else "This is not medical advice."
    system = (
        "You are a diabetes prevention and wellness advisor. "
        "Give exactly one concrete action the user can do today. "
        "Use 2-3 short sentences in simple language. "
        f"End with a single disclaimer: '{disclaimer}' "
        "Do not give medical advice or diagnoses."
    )
    prompt = (
        f"Today is {day_name}, {today}. Focus for this tip: {theme}. "
        f"Generate one short, practical health tip for diabetes prevention or management. "
        f"Give one specific action. 2-3 sentences only. {lang_instruction}"
    )
    return _generate(prompt, system=system)


def answer_scenario(
    scenario: str,
    assessment: Optional[dict] = None,
    language: str = "english",
) -> str:
    """Scenario explorer: user's 'what if' + optional assessment context, one response."""
    if not (scenario or "").strip():
        return "Please enter a scenario (e.g. What if I lower my glucose by 20?)."
    lang_instruction = "Respond in Turkish." if language == "turkish" else "Respond in Arabic." if language == "arabic" else "Respond in English."
    context = ""
    if assessment:
        risk = assessment.get("risk_level") or assessment.get("risk_level_display", "unknown")
        prob = assessment.get("probability")
        if prob is not None:
            context = f" User's last assessment: risk level = {risk}, probability = {prob:.0%}."
        else:
            context = f" User's last assessment: risk level = {risk}."
    system = (
        "You are a diabetes educator. Answer in two short parts. "
        "Part 1: What might change (for their situation). "
        "Part 2: What could help (one or two practical steps). "
        "Use simple language, 3-4 sentences total. Do not add a disclaimer or 'medical advice' line."
    )
    prompt = (
        f"User asks: {scenario.strip()}.{context} "
        f"Reply in two parts only: (1) What might change (2) What could help. "
        f"{lang_instruction}"
    )
    return _generate(prompt, system=system)
