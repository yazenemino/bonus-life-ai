"""Diabetes risk assessment endpoint."""

import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import Assessment
from app.auth import get_current_user_optional
from app.models import DiabetesAssessmentRequest, AssessmentResponse
from app.services.notification_service import create_notification, localized_notification

logger = logging.getLogger(__name__)
router = APIRouter()

_ai_specialist = None
_diabetes_model = None


def init(ai_specialist, diabetes_model):
    global _ai_specialist, _diabetes_model
    _ai_specialist = ai_specialist
    _diabetes_model = diabetes_model


@router.post("/diabetes-assessment", response_model=AssessmentResponse)
async def diabetes_assessment(
    request: DiabetesAssessmentRequest,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Diabetes risk assessment with LLM-powered insights."""
    try:
        logger.info(f"[DATA] Diabetes assessment for age {request.age}")

        height_m = request.height / 100
        bmi = request.weight / (height_m ** 2)
        lang = (request.language or "english").lower()
        if "arabic" in lang or lang == "ar":
            bmi_category = (
                "نقص الوزن" if bmi < 18.5
                else "طبيعي" if bmi < 25
                else "زيادة وزن" if bmi < 30
                else "سمنة"
            )
        elif "turkish" in lang or lang == "tr":
            bmi_category = (
                "Zayıf" if bmi < 18.5
                else "Normal" if bmi < 25
                else "Kilolu" if bmi < 30
                else "Obez"
            )
        else:
            bmi_category = (
                "Underweight" if bmi < 18.5
                else "Normal" if bmi < 25
                else "Overweight" if bmi < 30
                else "Obese"
            )

        features = {
            "Pregnancies": request.pregnancies,
            "Glucose": request.glucose,
            "BloodPressure": request.blood_pressure,
            "SkinThickness": request.skin_thickness,
            "Insulin": request.insulin,
            "BMI": bmi,
            "DiabetesPedigreeFunction": request.diabetes_pedigree_function,
            "Age": request.age,
        }

        risk_label, probability, feature_importances = _diabetes_model.predict(features)

        # SHAP explainability (per-prediction)
        shap_explanation = None
        if hasattr(_diabetes_model, "explain"):
            shap_explanation = _diabetes_model.explain(features)

        insights_prompt = (
            f"Provide a comprehensive diabetes risk assessment summary in {request.language} "
            f"based on these metrics:\n"
            f"- Age: {request.age} years\n"
            f"- Glucose: {request.glucose} mg/dL\n"
            f"- Blood Pressure: {request.blood_pressure} mmHg\n"
            f"- BMI: {bmi:.1f} ({bmi_category})\n"
            f"- Risk Level: {risk_label} (Probability: {probability:.1%})\n\n"
            "Please provide:\n"
            "1. Executive summary of the assessment\n"
            "2. Key risk factors identified\n"
            "3. Immediate lifestyle recommendations\n"
            "4. When to consult a healthcare provider\n"
        )

        insights_response = await _ai_specialist.generate_medical_response(
            insights_prompt, request.language
        )
        llm_insights = (
            insights_response["response"]
            if insights_response["success"]
            else "Assessment completed. Please consult with healthcare provider for detailed analysis."
        )

        assessment_id = str(uuid.uuid4())
        risk_analysis = {
            "risk_level": risk_label,
            "probability": round(probability, 3),
            "key_factors": _identify_risk_factors(features, bmi, lang),
            "feature_importances": feature_importances,
            **({"shap_explanation": shap_explanation} if shap_explanation else {}),
        }
        health_metrics = {
            "bmi": round(bmi, 1),
            "bmi_category": bmi_category,
            "metabolic_age": _calculate_metabolic_age(features),
            "health_score": _calculate_health_score(features),
        }
        if "arabic" in lang or lang == "ar":
            medical_followup = "استشر مقدم الرعاية الصحية لإجراء تقييم شامل"
            monitoring_schedule = "يُنصح بإجراء فحوصات منتظمة"
        elif "turkish" in lang or lang == "tr":
            medical_followup = "Kapsamlı değerlendirme için sağlık uzmanına başvurun"
            monitoring_schedule = "Düzenli kontroller önerilir"
        else:
            medical_followup = "Consult healthcare provider for comprehensive evaluation"
            monitoring_schedule = "Regular check-ups recommended"
        recommendations = {
            "lifestyle_changes": _generate_lifestyle_recommendations(risk_label, features, lang),
            "medical_followup": medical_followup,
            "monitoring_schedule": monitoring_schedule,
        }

    except Exception as e:
        logger.error(f"Assessment error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Assessment service temporarily unavailable. Please try again shortly.",
        )

    if current_user:
        try:
            payload = {
                "request": request.dict(),
                "risk_analysis": risk_analysis,
                "health_metrics": health_metrics,
                "recommendations": recommendations,
            }
            rec = Assessment(
                user_id=current_user.id,
                assessment_id=assessment_id,
                risk_level=risk_label,
                probability=float(probability),
                executive_summary=llm_insights,
                payload=json.dumps(payload),
            )
            db.add(rec)
            db.commit()
            notif_title, notif_message = localized_notification("assessment_complete", request.language)
            create_notification(db, current_user.id, notif_title, notif_message, "success")
        except Exception as db_err:
            logger.error(f"Failed to save diabetes assessment to DB: {db_err}")
            db.rollback()

    return AssessmentResponse(
        assessment_id=assessment_id,
        timestamp=datetime.utcnow().isoformat(),
        executive_summary=llm_insights,
        risk_analysis=risk_analysis,
        health_metrics=health_metrics,
        recommendations=recommendations,
    )


# -- helper functions ---------------------------------------------------------

def _identify_risk_factors(features: Dict[str, Any], bmi: float, lang: str = "english") -> List[Dict[str, Any]]:
    is_ar = "arabic" in lang or lang == "ar"
    is_tr = "turkish" in lang or lang == "tr"

    def _t(en, ar, tr):
        if is_ar: return ar
        if is_tr: return tr
        return en

    risk_factors = []
    if features["Glucose"] >= 126:
        risk_factors.append({"factor": _t("Diabetes-level glucose", "مستوى جلوكوز مرتفع جداً", "Diyabet düzeyinde glukoz"), "severity": _t("high", "عالي", "Yüksek")})
    elif features["Glucose"] >= 100:
        risk_factors.append({"factor": _t("Prediabetes glucose levels", "مستوى جلوكوز في مرحلة ما قبل السكري", "Prediyabet glukoz düzeyi"), "severity": _t("moderate", "متوسط", "Orta")})
    if bmi >= 30:
        risk_factors.append({"factor": _t("Clinical obesity", "سمنة مرضية", "Klinik obezite"), "severity": _t("high", "عالي", "Yüksek")})
    elif bmi >= 25:
        risk_factors.append({"factor": _t("Overweight", "زيادة في الوزن", "Kilolu"), "severity": _t("moderate", "متوسط", "Orta")})
    if features["BloodPressure"] >= 140:
        risk_factors.append({"factor": _t("Stage 2 hypertension", "ارتفاع ضغط الدم - المرحلة الثانية", "Evre 2 hipertansiyon"), "severity": _t("high", "عالي", "Yüksek")})
    elif features["BloodPressure"] >= 130:
        risk_factors.append({"factor": _t("Stage 1 hypertension", "ارتفاع ضغط الدم - المرحلة الأولى", "Evre 1 hipertansiyon"), "severity": _t("moderate", "متوسط", "Orta")})
    if features["Age"] >= 45:
        risk_factors.append({"factor": _t("Age-related risk increase", "ازدياد الخطر المرتبط بالعمر", "Yaşa bağlı risk artışı"), "severity": _t("moderate", "متوسط", "Orta")})
    no_risk = _t("No significant risk factors identified", "لا توجد عوامل خطر مهمة", "Önemli risk faktörü tespit edilmedi")
    return risk_factors if risk_factors else [{"factor": no_risk, "severity": _t("low", "منخفض", "Düşük")}]


def _calculate_metabolic_age(features: Dict[str, Any]) -> int:
    base_age = features["Age"]
    adj = 0
    if features["Glucose"] < 100:
        adj -= 3
    if features["BMI"] < 25:
        adj -= 2
    if features["BloodPressure"] < 120:
        adj -= 2
    return max(20, base_age + adj)


def _calculate_health_score(features: Dict[str, Any]) -> int:
    score = 50
    bmi = features.get("BMI", 25)
    if 18.5 <= bmi <= 24.9:
        score += 20
    elif 25 <= bmi <= 29.9:
        score += 10
    glucose = features.get("Glucose", 100)
    if glucose < 100:
        score += 20
    elif glucose < 126:
        score += 10
    bp = features.get("BloodPressure", 120)
    if bp < 120:
        score += 15
    elif bp < 140:
        score += 10
    return min(100, score)


def _generate_lifestyle_recommendations(risk_level: str, features: Dict[str, Any], lang: str = "english") -> List[str]:
    is_ar = "arabic" in lang or lang == "ar"
    is_tr = "turkish" in lang or lang == "tr"

    def _t(en, ar, tr):
        if is_ar: return ar
        if is_tr: return tr
        return en

    recs = []
    if "high" in risk_level.lower():
        recs.extend([
            _t("Immediate consultation with healthcare provider", "استشارة فورية مع مقدم الرعاية الصحية", "Sağlık uzmanıyla acil konsültasyon"),
            _t("Comprehensive blood work and monitoring", "إجراء تحاليل دم شاملة ومراقبة دورية", "Kapsamlı kan tahlili ve izleme"),
            _t("Structured diet and exercise program", "برنامج غذائي ورياضي منظم", "Yapılandırılmış diyet ve egzersiz programı"),
        ])
    else:
        recs.extend([
            _t("Regular physical activity (30 mins daily)", "نشاط بدني منتظم (30 دقيقة يومياً)", "Düzenli fiziksel aktivite (günlük 30 dakika)"),
            _t("Balanced diet with portion control", "نظام غذائي متوازن مع التحكم في الحصص", "Porsiyon kontrolüyle dengeli beslenme"),
            _t("Regular health check-ups", "فحوصات صحية دورية منتظمة", "Düzenli sağlık kontrolleri"),
            _t("Stress management and adequate sleep", "إدارة التوتر والنوم الكافي", "Stres yönetimi ve yeterli uyku"),
        ])
    if features.get("BMI", 0) > 25:
        recs.append(_t("Weight management program", "برنامج إدارة الوزن", "Kilo yönetimi programı"))
    if features.get("Glucose", 0) > 100:
        recs.append(_t("Blood sugar monitoring", "مراقبة مستوى السكر في الدم", "Kan şekeri takibi"))
    return recs
