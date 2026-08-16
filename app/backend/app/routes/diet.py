"""Diet plan generation endpoint."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import DietPlanRecord
from app.auth import get_current_user_optional
from app.models import DietPlanRequest, DietPlanResponse
from app.services.notification_service import create_notification, localized_notification

logger = logging.getLogger(__name__)
router = APIRouter()

_meal_service = None


def init(meal_service):
    global _meal_service
    _meal_service = meal_service


@router.post("/diet-plan/generate", response_model=DietPlanResponse)
async def generate_diet_plan(
    request: DietPlanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Generate personalized diet plan."""
    logger.info(f"[TARGET] Generating plan for {request.age}y/o {request.gender} - Goal: {request.goals}")
    try:
        result = await _meal_service.generate_plan(request)
        logger.info(f"[OK] Plan generated - Time: {result['generation_time']}s")
        if current_user:
            rec = DietPlanRecord(
                user_id=current_user.id,
                goal=request.goals or "",
                overview=result.get("overview", "")[:4096],
                payload=json.dumps(result),
            )
            db.add(rec)
            db.commit()
            notif_title, notif_message = localized_notification("diet_plan_ready", request.language)
            create_notification(db, current_user.id, notif_title, notif_message, "success")
        return DietPlanResponse(**result)
    except Exception as e:
        logger.error(f"[ERROR] Plan generation failed: {e}")
        raise HTTPException(status_code=500, detail="Meal plan generation failed")
