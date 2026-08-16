"""Symptom Checker API: ML-based top-k condition groups from symptoms + profile."""

import logging
from fastapi import APIRouter, HTTPException

from app.models import SymptomCheckerRequest, SymptomCheckerResponse, SymptomPredictionItem
from app.services.symptom_checker import get_symptom_checker

logger = logging.getLogger(__name__)
router = APIRouter(tags=["symptom-checker"])


@router.post("/symptom-checker/predict", response_model=SymptomCheckerResponse)
async def symptom_checker_predict(request: SymptomCheckerRequest):
    """Predict top-3 condition groups from symptom and profile inputs."""
    try:
        svc = get_symptom_checker()
        results = svc.predict_top_k(
            fever=request.fever,
            cough=request.cough,
            fatigue=request.fatigue,
            difficulty_breathing=request.difficulty_breathing,
            age=request.age,
            gender=request.gender,
            blood_pressure=request.blood_pressure,
            cholesterol=request.cholesterol,
            top_k=3,
            language=request.language,
        )
        predictions = [
            SymptomPredictionItem(
                disease=item["disease"],
                probability=item["probability"],
                disease_examples=item.get("disease_examples", []),
            )
            for item in results
        ]
        return SymptomCheckerResponse(predictions=predictions)
    except Exception as e:
        logger.exception("Symptom checker predict failed")
        raise HTTPException(status_code=500, detail=str(e))
