"""Heart disease risk assessment endpoint (UCI Cleveland-style features)."""

import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import HeartAssessment
from app.auth import get_current_user_optional
from app.models import HeartAssessmentRequest, HeartAssessmentResponse
from app.services.ai_specialist import AIDiabetesSpecialist
from app.services.notification_service import create_notification, localized_notification

logger = logging.getLogger(__name__)
router = APIRouter()

_ai_specialist = None
_heart_model = None


def init(ai_specialist: AIDiabetesSpecialist, heart_model):
    global _ai_specialist, _heart_model
    _ai_specialist = ai_specialist
    _heart_model = heart_model


@router.post("/heart-assessment", response_model=HeartAssessmentResponse)
async def heart_assessment(
    request: HeartAssessmentRequest,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Heart disease risk assessment using Cleveland-style clinical features."""
    try:
        logger.info(f"[DATA] Heart assessment for age {request.age}")

        features = {
            "age": request.age,
            "sex": request.sex,
            "cp": request.cp,
            "trestbps": request.trestbps,
            "chol": request.chol,
            "fbs": request.fbs,
            "restecg": request.restecg,
            "thalach": request.thalach,
            "exang": request.exang,
            "oldpeak": request.oldpeak,
            "slope": request.slope,
            "ca": request.ca,
            "thal": request.thal,
        }

        risk_label, probability, feature_importances = _heart_model.predict(features)

        insights_prompt = (
            f"Provide a short heart disease risk assessment summary in {request.language} "
            f"based on: age {request.age}, resting BP {request.trestbps} mmHg, "
            f"cholesterol {request.chol} mg/dL, max heart rate {request.thalach}, "
            f"risk level {risk_label} (probability {probability:.1%}). "
            "Include 1–2 sentences on key factors and when to see a doctor."
        )
        insights_response = await _ai_specialist.generate_medical_response(
            insights_prompt, request.language, domain="heart"
        )
        llm_insights = (
            insights_response["response"]
            if insights_response["success"]
            else "Assessment completed. Consult a healthcare provider for a full cardiac evaluation."
        )

        lang = (request.language or "english").lower()

        risk_analysis = {
            "risk_level": risk_label,
            "probability": round(probability, 3),
            "key_factors": _identify_risk_factors(features, lang),
            "feature_importances": feature_importances,
        }
        if "arabic" in lang or lang == "ar":
            medical_followup = "استشر طبيب قلب أو طبيباً عاماً لإجراء تخطيط قلب وفحص دهون إذا كان الخطر متوسطاً أو مرتفعاً."
        elif "turkish" in lang or lang == "tr":
            medical_followup = "Risk orta veya yüksekse EKG ve lipid paneli için bir kardiyolog veya pratisyen hekime danışın."
        else:
            medical_followup = "Consult a cardiologist or GP for ECG and lipid panel if risk is moderate or high."
        recommendations = {
            "lifestyle_changes": _lifestyle_recommendations(risk_label, features, lang),
            "medical_followup": medical_followup,
        }

        assessment_id = str(uuid.uuid4())

    except Exception as e:
        logger.error(f"Heart assessment error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Heart assessment service temporarily unavailable. Please try again shortly.",
        )

    if current_user:
        try:
            payload = {
                "request": request.dict(),
                "risk_analysis": risk_analysis,
                "recommendations": recommendations,
            }
            rec = HeartAssessment(
                user_id=current_user.id,
                assessment_id=assessment_id,
                risk_level=risk_label,
                probability=float(probability),
                executive_summary=llm_insights,
                payload=json.dumps(payload),
            )
            db.add(rec)
            db.commit()
            notif_title, notif_message = localized_notification("heart_complete", request.language)
            create_notification(db, current_user.id, notif_title, notif_message, "success")
        except Exception as db_err:
            logger.error(f"Failed to save heart assessment to DB: {db_err}")
            db.rollback()

    return HeartAssessmentResponse(
        assessment_id=assessment_id,
        timestamp=datetime.utcnow().isoformat(),
        executive_summary=llm_insights,
        risk_analysis=risk_analysis,
        recommendations=recommendations,
    )


def _identify_risk_factors(features: Dict[str, Any], lang: str = "english") -> List[Dict[str, Any]]:
    is_ar = "arabic" in lang or lang == "ar"
    is_tr = "turkish" in lang or lang == "tr"

    def _t(en, ar, tr):
        if is_ar: return ar
        if is_tr: return tr
        return en

    def _sev(en):
        return _t(en, "عالي" if en == "high" else "متوسط" if en == "moderate" else "منخفض",
                   "Yüksek" if en == "high" else "Orta" if en == "moderate" else "Düşük")

    factors = []
    if features.get("trestbps", 0) >= 140:
        factors.append({"factor": _t("Elevated resting blood pressure", "ارتفاع ضغط الدم أثناء الراحة", "Yüksek istirahat tansiyonu"), "severity": _sev("high")})
    elif features.get("trestbps", 0) >= 130:
        factors.append({"factor": _t("Borderline high blood pressure", "ضغط دم مرتفع حدّي", "Sınırda yüksek tansiyon"), "severity": _sev("moderate")})
    if features.get("chol", 0) >= 240:
        factors.append({"factor": _t("High cholesterol", "ارتفاع الكوليسترول", "Yüksek kolesterol"), "severity": _sev("high")})
    elif features.get("chol", 0) >= 200:
        factors.append({"factor": _t("Borderline high cholesterol", "كوليسترول مرتفع حدّي", "Sınırda yüksek kolesterol"), "severity": _sev("moderate")})
    if features.get("age", 0) >= 55:
        factors.append({"factor": _t("Age-related cardiovascular risk", "خطر قلبي وعائي مرتبط بالعمر", "Yaşa bağlı kardiyovasküler risk"), "severity": _sev("moderate")})
    if features.get("thalach", 200) < 120:
        factors.append({"factor": _t("Low max heart rate (possible limitation)", "انخفاض أقصى معدل لضربات القلب (احتمال وجود قصور)", "Düşük maksimum kalp hızı (olası kısıtlama)"), "severity": _sev("moderate")})
    if features.get("exang", 0) == 1:
        factors.append({"factor": _t("Exercise-induced angina", "ذبحة صدرية ناتجة عن التمرين", "Egzersizle tetiklenen anjina"), "severity": _sev("high")})
    if not factors:
        factors.append({"factor": _t("No major risk factors identified from inputs", "لم يتم تحديد عوامل خطر رئيسية من البيانات المدخلة", "Girilen verilerden önemli bir risk faktörü tespit edilmedi"), "severity": _sev("low")})
    return factors


def _lifestyle_recommendations(risk_level: str, features: Dict[str, Any], lang: str = "english") -> List[str]:
    is_ar = "arabic" in lang or lang == "ar"
    is_tr = "turkish" in lang or lang == "tr"

    def _t(en, ar, tr):
        if is_ar: return ar
        if is_tr: return tr
        return en

    recs = [
        _t("Regular aerobic exercise (e.g. 150 min/week moderate intensity)", "نشاط هوائي منتظم (مثلاً 150 دقيقة أسبوعياً بشدة معتدلة)", "Düzenli aerobik egzersiz (örn. haftada 150 dk orta yoğunlukta)"),
        _t("Heart-healthy diet (Mediterranean style, limit saturated fat)", "نظام غذائي صحي للقلب (نمط البحر الأبيض المتوسط، تقليل الدهون المشبعة)", "Kalp dostu beslenme (Akdeniz tarzı, doymuş yağı sınırlayın)"),
        _t("Avoid smoking; limit alcohol", "تجنب التدخين والحد من الكحول", "Sigaradan kaçının; alkolü sınırlayın"),
    ]
    if "high" in risk_level.lower() or "moderate" in risk_level.lower():
        recs.insert(0, _t("Consult a doctor for ECG and lipid panel", "استشر طبيباً لإجراء تخطيط قلب وفحص دهون", "EKG ve lipid paneli için bir doktora danışın"))
    if features.get("trestbps", 0) >= 130:
        recs.append(_t("Monitor blood pressure regularly", "راقب ضغط الدم بانتظام", "Kan basıncını düzenli olarak izleyin"))
    if features.get("chol", 0) >= 200:
        recs.append(_t("Consider cholesterol recheck and diet adjustments", "فكّر في إعادة فحص الكوليسترول وتعديل النظام الغذائي", "Kolesterolü yeniden kontrol ettirmeyi ve diyeti gözden geçirmeyi düşünün"))
    return recs
