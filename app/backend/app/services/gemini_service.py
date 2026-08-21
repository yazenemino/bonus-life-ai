"""Gemini API helper – used when GEMINI_API_KEY is set instead of Groq for chat, diet, meal photo."""

import os
import base64
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

_genai = None
_model = None
_model_name = ""


def _configure():
    global _genai, _model, _model_name
    if _genai is not None:
        return
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        _genai = genai
        # Default to a flash model, not *-pro: the free tier's per-day quota for
        # *-pro models is small enough to exhaust in normal use.
        _model_name = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
        _model = genai.GenerativeModel(_model_name)
        logger.info("[OK] Gemini initialized with model: %s", _model_name)
    except Exception as e:
        logger.warning("Gemini init failed: %s", e)
        _genai = None
        _model = None


def is_available() -> bool:
    _configure()
    return _model is not None


def get_model_name() -> str:
    _configure()
    return _model_name or (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()


def generate_chat(messages: List[Dict[str, str]]) -> str:
    """Generate a response from messages. roles: system, user, assistant. Builds one prompt for compatibility."""
    _configure()
    if not _model:
        raise RuntimeError("Gemini not configured")
    prompt_parts = []
    for m in messages:
        role = (m.get("role") or "user").lower()
        content = (m.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            prompt_parts.append(f"[System instructions]\n{content}\n")
        elif role == "user":
            prompt_parts.append(f"User: {content}\n")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}\n")
    prompt_parts.append("Assistant:")
    full_prompt = "\n".join(prompt_parts)
    try:
        response = _model.generate_content(
            full_prompt,
            generation_config=_genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=1500,
            ) if hasattr(_genai, "types") else None,
        )
        return (response.text or "").strip()
    except Exception as e:
        logger.exception("Gemini generate_chat failed: %s", e)
        raise


def generate_text(prompt: str, temperature: float = 0.7) -> str:
    """Single prompt, no history."""
    _configure()
    if not _model:
        raise RuntimeError("Gemini not configured")
    try:
        config = None
        if hasattr(_genai, "types") and hasattr(_genai.types, "GenerationConfig"):
            config = _genai.types.GenerationConfig(temperature=temperature, max_output_tokens=1500)
        response = _model.generate_content(prompt, generation_config=config)
        return (response.text or "").strip()
    except Exception as e:
        logger.exception("Gemini generate_text failed: %s", e)
        raise


def _detect_mime_type(image_bytes: bytes) -> str:
    """Sniff image format from magic bytes; default to jpeg if unrecognized."""
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes[:4] in (b"GIF8",):
        return "image/gif"
    return "image/jpeg"


def _relaxed_safety_settings():
    """Food photos are benign; relax over-eager safety blocking that can strip response.text."""
    if not (hasattr(_genai, "types") and hasattr(_genai.types, "HarmCategory")):
        return None
    HarmCategory = _genai.types.HarmCategory
    HarmBlockThreshold = _genai.types.HarmBlockThreshold
    return {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    }


def generate_vision(image_base64: str, prompt: str, response_json: bool = False) -> str:
    """Analyze an image with a text prompt. image_base64: raw base64 string.

    response_json: when True, forces Gemini's structured-output JSON mode so the reply is
    always a parseable JSON string instead of free text that may include markdown fences
    or get cut off mid-object.
    """
    _configure()
    if not _model:
        raise RuntimeError("Gemini not configured")
    try:
        image_bytes = base64.b64decode(image_base64)
        mime_type = _detect_mime_type(image_bytes)
        # Prefer SDK Part type; fallback to inline_data dict (data as bytes)
        image_part = None
        if hasattr(_genai, "types") and hasattr(_genai.types, "Part"):
            image_part = _genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        if image_part is None:
            image_part = {"inline_data": {"mime_type": mime_type, "data": image_bytes}}
        generation_config = None
        if response_json and hasattr(_genai, "types") and hasattr(_genai.types, "GenerationConfig"):
            generation_config = _genai.types.GenerationConfig(
                response_mime_type="application/json",
                # gemini-2.5-flash spends part of this budget on hidden "thinking"
                # tokens before it emits any visible JSON, and this SDK version
                # (google-generativeai 0.8.5) has no thinking_config/thinking_budget
                # field to disable that — it 400s if you try to pass one. 500 was
                # nowhere near enough: confirmed live that it truncated on every
                # single call (finish_reason=MAX_TOKENS after 16-24 chars). 3000
                # leaves real headroom for thinking + the actual JSON object.
                max_output_tokens=3000,
            )
        response = _model.generate_content(
            [prompt, image_part],
            safety_settings=_relaxed_safety_settings(),
            generation_config=generation_config,
        )
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            block_reason = getattr(getattr(response, "prompt_feedback", None), "block_reason", None)
            raise RuntimeError(f"Gemini returned no candidates (block_reason={block_reason})")
        try:
            return (response.text or "").strip()
        except Exception:
            finish_reason = getattr(candidates[0], "finish_reason", None)
            raise RuntimeError(f"Gemini response has no usable text (finish_reason={finish_reason})")
    except Exception as e:
        logger.exception("Gemini generate_vision failed: %s", e)
        raise
