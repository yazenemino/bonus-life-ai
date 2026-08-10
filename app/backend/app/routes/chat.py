"""Chat endpoint - real-time AI diabetes specialist."""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks

from app.models import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Service instances injected at startup via app.state
_ai_specialist = None


def init(ai_specialist):
    global _ai_specialist
    _ai_specialist = ai_specialist


@router.post("/chat", response_model=ChatResponse)
async def diabetes_chat(chat_request: ChatRequest, background_tasks: BackgroundTasks):
    """Main chat endpoint with real LLM integration."""
    try:
        message = chat_request.message.strip()
        language = chat_request.language
        user_id = chat_request.user_id or "default"

        if not message:
            raise HTTPException(status_code=422, detail="Message cannot be empty")

        logger.info(f"[AI] Chat request from {user_id}: {message[:50]}...")

        # Feature f7: prepend user context if available
        enriched_message = message
        if chat_request.user_context:
            enriched_message = f"[Context: {chat_request.user_context}]\n\n{message}"

        llm_result = await _ai_specialist.generate_medical_response(
            message=enriched_message, language=language, user_id=user_id
        )

        return ChatResponse(
            response=llm_result["response"],
            timestamp=datetime.utcnow().isoformat(),
            conversation_id=user_id,
            model=llm_result["model"],
            error_detail=llm_result.get("error_detail"),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Chat error")
        detail_by_language = {
            "turkish": "Yapay zeka diyabet uzmanı şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
            "arabic": "أخصائي السكري الذكي غير متوفر حالياً. يرجى المحاولة لاحقاً.",
            "english": "Our AI diabetes specialist is currently unavailable. Please try again later.",
        }
        detail = detail_by_language.get(getattr(chat_request, "language", None), detail_by_language["english"])
        raise HTTPException(status_code=500, detail=detail)
