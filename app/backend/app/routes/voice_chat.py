"""Voice chat endpoints. Groq only (GPTOSS)."""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user_optional
from app.database import get_db
from app.db_models import Assessment, User
from app.models import VoiceChatRequest, VoiceChatResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()

_voice_service = None
_gpt_oss_specialist = None


def init(voice_service, gpt_oss_specialist):
    global _voice_service, _gpt_oss_specialist
    _voice_service = voice_service
    _gpt_oss_specialist = gpt_oss_specialist


@router.post("/voice-chat", response_model=VoiceChatResponse)
async def voice_chat_assistant(
    request: VoiceChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Voice chat endpoint for diabetes concerns. Uses last assessment when user is logged in."""
    try:
        user_id = str(current_user.id) if current_user else request.user_id
        assessment_context = _get_last_assessment_for_user(db, current_user.id) if current_user else None
        user_has_no_assessment = bool(current_user and assessment_context is None)

        logger.info(f"Voice chat request from {user_id}, language: {request.language}")
        audio_bytes = _voice_service.decode_audio(request.audio_data)
        transcribed_text, confidence = await _voice_service.transcribe_audio(audio_bytes, request.language)
        logger.info(f"Transcribed text: {transcribed_text}")

        llm_result = await _gpt_oss_specialist.generate_diabetes_response(
            message=transcribed_text,
            language=request.language,
            user_id=user_id,
            is_voice=True,
            assessment_context=assessment_context,
            user_has_no_assessment=user_has_no_assessment,
        )

        return VoiceChatResponse(
            text_input=transcribed_text,
            ai_response=llm_result["response"],
            timestamp=datetime.utcnow().isoformat(),
            language=request.language,
            confidence=confidence,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice chat error: {e}")
        detail_by_language = {
            "arabic": "خدمة المحادثة الصوتية غير متوفرة مؤقتاً.",
            "turkish": "Sesli sohbet hizmeti geçici olarak kullanılamıyor.",
            "english": "Voice chat service is temporarily unavailable.",
        }
        raise HTTPException(status_code=500, detail=detail_by_language.get(request.language, detail_by_language["english"]))


def _get_last_assessment_for_user(db: Session, user_id: int) -> Optional[dict]:
    """Return the user's most recent assessment as a short summary dict, or None."""
    row = (
        db.query(Assessment)
        .filter(Assessment.user_id == user_id)
        .order_by(Assessment.created_at.desc())
        .limit(1)
        .first()
    )
    if not row:
        return None
    return {
        "risk_level": row.risk_level or "unknown",
        "probability": row.probability,
        "executive_summary": (row.executive_summary or "")[:1024],
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.post("/voice-chat/test")
async def voice_chat_test(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Test voice chat without actual audio processing. Uses last assessment when user is logged in."""
    try:
        form_data = await request.form()
        text = form_data.get("text", "")
        language = form_data.get("language", "english")
        user_id = form_data.get("user_id", "default")
        is_voice = form_data.get("is_voice", "1") == "1"

        if current_user:
            user_id = str(current_user.id)

        assessment_context = None
        user_has_no_assessment = False
        if current_user and db:
            assessment_context = _get_last_assessment_for_user(db, current_user.id)
            if current_user and assessment_context is None:
                user_has_no_assessment = True
        logger.info(f"Voice chat test: user_id={user_id}, has_assessment={assessment_context is not None}")

        if not text:
            raise HTTPException(status_code=400, detail="Text input is required")

        llm_result = await _gpt_oss_specialist.generate_diabetes_response(
            message=text,
            language=language,
            user_id=user_id,
            is_voice=is_voice,
            assessment_context=assessment_context,
            user_has_no_assessment=user_has_no_assessment,
        )

        return VoiceChatResponse(
            text_input=text,
            ai_response=llm_result["response"],
            timestamp=datetime.utcnow().isoformat(),
            language=language,
            confidence=0.95,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice chat test error: {e}")
        detail_by_language = {
            "arabic": "فشل اختبار المحادثة الصوتية.",
            "turkish": "Sesli sohbet testi başarısız oldu.",
            "english": "Voice chat test failed",
        }
        raise HTTPException(status_code=500, detail=detail_by_language.get(language, detail_by_language["english"]))
