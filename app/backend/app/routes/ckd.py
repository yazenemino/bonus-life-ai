"""CKD (Chronic Kidney Disease) prediction endpoint."""

import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import CKDAssessment
from app.auth import get_current_user_optional
from app.models import CKDAssessmentRequest, CKDAssessmentResponse
from app.services.ai_specialist import AIDiabetesSpecialist
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)
router = APIRouter()

_ai_specialist = None
_ckd_model = None


def init(ai_specialist: AIDiabetesSpecialist, ckd_model):
    global _ai_specialist, _ckd_model
    _ai_specialist = ai_specialist
    _ckd_model = ckd_model


@router.post("/ckd-assessment", response_model=CKDAssessmentResponse)
async def ckd_assessment(
    request: CKDAssessmentRequest,
    db: Session = Depends(get_db),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """Chronic Kidney Disease risk assessment using 24 clinical features."""
    try:
        logger.info(f"[DATA] CKD assessment for age {request.age}")

        features = {
            "age": request.age,
            "blood_pressure": request.blood_pressure,
            "specific_gravity": request.specific_gravity,
            "albumin": request.albumin,
            "sugar": request.sugar,
            "red_blood_cells": request.red_blood_cells,
            "pus_cell": request.pus_cell,
            "pus_cell_clumps": request.pus_cell_clumps,
            "bacteria": request.bacteria,
            "blood_glucose_random": request.blood_glucose_random,
            "blood_urea": request.blood_urea,
            "serum_creatinine": request.serum_creatinine,
            "sodium": request.sodium,
            "potassium": request.potassium,
            "hemoglobin": request.hemoglobin,
            "packed_cell_volume": request.packed_cell_volume,
            "white_blood_cell_count": request.white_blood_cell_count,
            "red_blood_cell_count": request.red_blood_cell_count,
            "hypertension": request.hypertension,
            "diabetes_mellitus": request.diabetes_mellitus,
            "coronary_artery_disease": request.coronary_artery_disease,
            "appetite": request.appetite,
            "pedal_edema": request.pedal_edema,
            "anemia": request.anemia,
        }

        prediction_label, probability, feature_importances = _ckd_model.predict(features)

        insights_prompt = (
            f"Provide a concise chronic kidney disease risk summary in {request.language}. "
            f"Patient age: {request.age}, hemoglobin: {request.hemoglobin} g/dL, "
            f"serum creatinine: {request.serum_creatinine} mg/dL, "
            f"blood urea: {request.blood_urea} mg/dL, "
            f"prediction: {prediction_label} (confidence {probability:.1%}). "
            "Include 1–2 sentences on key CKD indicators and when to consult a nephrologist."
        )
        insights_response = await _ai_specialist.generate_medical_response(
            insights_prompt, request.language
        )
        llm_insights = (
            insights_response["response"]
            if insights_response["success"]
            else "Assessment completed. Consult a nephrologist for a comprehensive kidney function evaluation."
        )

        lang = (request.language or "english").lower()
        is_ar = "arabic" in lang or lang == "ar"
        is_tr = "turkish" in lang or lang == "tr"

        risk_analysis = {
            "prediction": prediction_label,
            "confidence": round(probability, 3),
            "risk_level": "High Risk" if prediction_label == "CKD" else "Low Risk",
            "probability": round(probability, 3),
            "key_factors": _identify_risk_factors(features, lang),
            "feature_importances": feature_importances,
        }
        if prediction_label == "CKD":
            medical_followup = (
                "استشر طبيب كلى لقياس معدل الترشيح الكبيبي ونسبة الألبومين إلى الكرياتينين في البول، وإجراء تصوير بالموجات فوق الصوتية للكلى إذا اشتُبه بوجود قصور كلوي."
                if is_ar else
                "Böbrek yetmezliğinden şüpheleniliyorsa GFR ölçümü, idrarda albümin-kreatinin oranı ve böbrek ultrasonu için bir nefroloğa danışın."
                if is_tr else
                "Consult a nephrologist for GFR measurement, urine albumin-to-creatinine ratio, "
                "and renal ultrasound if CKD is suspected."
            )
        else:
            medical_followup = (
                "حافظ على نمط حياة صحي وقم بجدولة فحوصات سنوية لوظائف الكلى."
                if is_ar else
                "Sağlıklı bir yaşam tarzı sürdürün ve yıllık böbrek fonksiyon testleri planlayın."
                if is_tr else
                "Maintain a healthy lifestyle and schedule annual kidney function tests."
            )
        recommendations = {
            "lifestyle_changes": _lifestyle_recommendations(prediction_label, features, lang),
            "medical_followup": medical_followup,
        }

        assessment_id = str(uuid.uuid4())

    except Exception as e:
        logger.error(f"CKD assessment error: {e}")
        raise HTTPException(
            status_code=500,
            detail="CKD assessment service temporarily unavailable. Please try again shortly.",
        )

    if current_user:
        try:
            payload = {
                "request": request.dict(),
                "risk_analysis": risk_analysis,
                "recommendations": recommendations,
            }
            rec = CKDAssessment(
                user_id=current_user.id,
                assessment_id=assessment_id,
                prediction=prediction_label,
                confidence=float(probability),
                executive_summary=llm_insights,
                payload=json.dumps(payload),
            )
            db.add(rec)
            db.commit()
            create_notification(
                db, current_user.id,
                "CKD assessment complete",
                "Your kidney disease risk assessment is ready. View it in your Dashboard.",
                "success",
            )
        except Exception as db_err:
            logger.error(f"Failed to save CKD assessment to DB: {db_err}")
            db.rollback()

    return CKDAssessmentResponse(
        assessment_id=assessment_id,
        timestamp=datetime.utcnow().isoformat(),
        prediction=prediction_label,
        confidence=round(probability, 3),
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
    sc = features.get("serum_creatinine", 0)
    if sc > 1.5:
        factors.append({"factor": _t(f"Elevated serum creatinine ({sc} mg/dL)", f"ارتفاع الكرياتينين في الدم ({sc} مغ/ديسيلتر)", f"Yüksek serum kreatinini ({sc} mg/dL)"), "severity": _sev("high")})
    elif sc > 1.2:
        factors.append({"factor": _t(f"Borderline serum creatinine ({sc} mg/dL)", f"كرياتينين الدم حدّي ({sc} مغ/ديسيلتر)", f"Sınırda serum kreatinini ({sc} mg/dL)"), "severity": _sev("moderate")})

    bu = features.get("blood_urea", 0)
    if bu > 40:
        factors.append({"factor": _t(f"Elevated blood urea ({bu} mg/dL)", f"ارتفاع اليوريا في الدم ({bu} مغ/ديسيلتر)", f"Yüksek kan üresi ({bu} mg/dL)"), "severity": _sev("high")})

    hemo = features.get("hemoglobin", 15)
    if hemo < 10:
        factors.append({"factor": _t(f"Low hemoglobin — anemia ({hemo} g/dL)", f"انخفاض الهيموغلوبين — فقر دم ({hemo} غ/ديسيلتر)", f"Düşük hemoglobin — anemi ({hemo} g/dL)"), "severity": _sev("high")})
    elif hemo < 12:
        factors.append({"factor": _t(f"Mildly low hemoglobin ({hemo} g/dL)", f"انخفاض طفيف في الهيموغلوبين ({hemo} غ/ديسيلتر)", f"Hafif düşük hemoglobin ({hemo} g/dL)"), "severity": _sev("moderate")})

    al = features.get("albumin", 0)
    if al >= 3:
        factors.append({"factor": _t(f"High albuminuria (albumin={al})", f"زلال بولي مرتفع (الألبومين={al})", f"Yüksek albüminüri (albümin={al})"), "severity": _sev("high")})
    elif al >= 1:
        factors.append({"factor": _t(f"Mild albuminuria (albumin={al})", f"زلال بولي خفيف (الألبومين={al})", f"Hafif albüminüri (albümin={al})"), "severity": _sev("moderate")})

    htn = features.get("hypertension", 0)
    if htn == 1:
        factors.append({"factor": _t("Hypertension present", "وجود ارتفاع ضغط الدم", "Hipertansiyon mevcut"), "severity": _sev("high")})

    dm = features.get("diabetes_mellitus", 0)
    if dm == 1:
        factors.append({"factor": _t("Diabetes mellitus present", "وجود داء السكري", "Diyabet mevcut"), "severity": _sev("high")})

    bp = features.get("blood_pressure", 0)
    if bp >= 90:
        factors.append({"factor": _t(f"Elevated blood pressure ({bp} mmHg diastolic)", f"ارتفاع ضغط الدم ({bp} مم زئبق انبساطي)", f"Yüksek kan basıncı ({bp} mmHg diyastolik)"), "severity": _sev("moderate")})

    if not factors:
        factors.append({"factor": _t("No major CKD risk indicators from inputs", "لا توجد مؤشرات رئيسية لخطر الكلى من البيانات المدخلة", "Girilen verilerden önemli bir KBH risk göstergesi yok"), "severity": _sev("low")})
    return factors


def _lifestyle_recommendations(prediction: str, features: Dict[str, Any], lang: str = "english") -> List[str]:
    is_ar = "arabic" in lang or lang == "ar"
    is_tr = "turkish" in lang or lang == "tr"

    def _t(en, ar, tr):
        if is_ar: return ar
        if is_tr: return tr
        return en

    recs = [
        _t("Maintain adequate hydration (1.5–2L water/day unless restricted)", "حافظ على ترطيب كافٍ (1.5-2 لتر ماء يومياً ما لم يكن هناك قيود)", "Yeterli sıvı alımını sürdürün (kısıtlama yoksa günde 1.5–2L su)"),
        _t("Adopt a kidney-friendly diet: limit sodium, protein, and phosphorus", "اتبع نظاماً غذائياً صديقاً للكلى: قلّل الصوديوم والبروتين والفوسفور", "Böbrek dostu bir diyet uygulayın: sodyum, protein ve fosforu sınırlayın"),
        _t("Monitor blood pressure regularly and keep it under 130/80 mmHg", "راقب ضغط الدم بانتظام واجعله أقل من 130/80 مم زئبق", "Kan basıncını düzenli izleyin ve 130/80 mmHg altında tutun"),
        _t("Control blood sugar if diabetic — HbA1c < 7%", "تحكم بمستوى سكر الدم إذا كنت مصاباً بالسكري — HbA1c أقل من 7%", "Diyabetikseniz kan şekerini kontrol edin — HbA1c < %7"),
        _t("Avoid nephrotoxic medications (NSAIDs, contrast dyes) without physician guidance", "تجنب الأدوية السامة للكلى (مضادات الالتهاب غير الستيرويدية، صبغات التباين) دون إشراف طبي", "Doktor önerisi olmadan böbreğe zararlı ilaçlardan (NSAİİ, kontrast maddeler) kaçının"),
    ]
    if prediction == "CKD":
        recs.insert(0, _t("Seek nephrology consultation promptly for CKD staging (eGFR, urine ACR)", "اطلب استشارة طبيب كلى فوراً لتحديد مرحلة القصور الكلوي (eGFR، نسبة الألبومين للكرياتينين)", "KBH evrelemesi için (eGFR, idrar ACR) hemen bir nefrolog görüşü alın"))
        recs.append(_t("Avoid smoking and limit alcohol consumption", "تجنب التدخين وقلل من استهلاك الكحول", "Sigaradan kaçının ve alkol tüketimini sınırlayın"))
        recs.append(_t("Schedule follow-up kidney function tests every 3–6 months", "جدول فحوصات متابعة لوظائف الكلى كل 3-6 أشهر", "Her 3–6 ayda bir böbrek fonksiyon testi takibi planlayın"))
    else:
        recs.append(_t("Annual kidney function screening is recommended", "يُنصح بإجراء فحص سنوي لوظائف الكلى", "Yıllık böbrek fonksiyon taraması önerilir"))
        recs.append(_t("Stay physically active with moderate exercise (150 min/week)", "حافظ على نشاطك البدني بتمارين معتدلة (150 دقيقة أسبوعياً)", "Orta düzeyde egzersizle fiziksel olarak aktif kalın (haftada 150 dk)"))
    return recs
