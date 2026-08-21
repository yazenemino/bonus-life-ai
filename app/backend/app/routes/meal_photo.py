"""AI Meal Photo Analyzer: analyze meal photo, carb level, healthier swaps; save to log."""

import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.db_models import MealLog
from app.auth import get_current_user_optional
from app.models import MealPhotoAnalyzeRequest, MealPhotoAnalyzeResponse
from app.services.meal_photo import analyze_meal_image, MealAnalysisError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/meal-photo")
async def meal_photo_info():
    """Simple GET so you can verify the meal-photo API is loaded (e.g. open in browser)."""
    return {"status": "ok", "message": "Meal Photo Analyzer API", "endpoints": ["POST /api/v1/meal-photo/analyze", "GET /api/v1/meal-photo/log"]}


@router.post("/meal-photo/analyze", response_model=MealPhotoAnalyzeResponse)
async def analyze_meal(
    request: MealPhotoAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Analyze a meal photo: identify meal, estimate carb level (low/medium/high), suggest healthier swaps. Optionally save to user's meal log."""
    try:
        result = await analyze_meal_image(request.image_base64, language=request.language)
    except MealAnalysisError as e:
        logger.warning(f"Meal analyze failed ({e.status_code}): {e.detail}")
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        logger.exception(f"Meal analyze failed: {e}")
        detail = (
            "فشل تحليل الوجبة" if request.language == "arabic"
            else "Öğün analizi başarısız oldu" if request.language == "turkish"
            else "Meal analysis failed"
        )
        raise HTTPException(status_code=500, detail=detail)

    saved = False
    if request.save_to_log and current_user:
        try:
            rec = MealLog(
                user_id=current_user.id,
                meal_name=result["meal_name"],
                carb_level=result["carb_level"],
                healthier_swaps=result["healthier_swaps"],
            )
            db.add(rec)
            db.commit()
            saved = True
        except Exception as e:
            logger.warning(f"Save to meal log failed: {e}")

    return MealPhotoAnalyzeResponse(
        meal_name=result["meal_name"],
        carb_level=result["carb_level"],
        healthier_swaps=result["healthier_swaps"],
        saved_to_log=saved,
    )


class MealLogEntry(BaseModel):
    id: int
    meal_name: str
    carb_level: str
    healthier_swaps: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("/meal-photo/log", response_model=List[MealLogEntry])
async def get_meal_log(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Return the current user's meal log (requires auth)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required to view meal log")
    rows = (
        db.query(MealLog)
        .filter(MealLog.user_id == current_user.id)
        .order_by(MealLog.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    return [
        MealLogEntry(
            id=r.id,
            meal_name=r.meal_name,
            carb_level=r.carb_level,
            healthier_swaps=r.healthier_swaps or "",
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.delete("/meal-photo/log")
@router.post("/meal-photo/log/clear")
async def clear_meal_log(
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Delete all meal log entries for the current user (requires auth). POST /log/clear for compatibility."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required to clear meal log")
    deleted = db.query(MealLog).filter(MealLog.user_id == current_user.id).delete()
    db.commit()
    return {"deleted": deleted}
