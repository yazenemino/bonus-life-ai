"""User-scoped routes: my assessments, my diet plans, profile, avatar upload, export, share."""

import json
import logging
import re
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, DB_DIR
from app.db_models import User, Assessment, HeartAssessment, DietPlanRecord, Notification, BrainMriAnalysis, CKDAssessment
from app.models import UserMeResponse, ProfileUpdateRequest, ChangePasswordRequest, SaveDietPlanRequest, TOTPVerifyRequest
from app.auth import get_current_user, hash_password
from app.services import stripe_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


def _safe_json(s):
    """Parse a JSON string, returning None on any error (handles corrupted DB payloads)."""
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return None

# Avatars live alongside the DB (same persistent volume in production) so uploads
# survive redeploys instead of vanishing with the container filesystem.
UPLOAD_DIR = Path(DB_DIR) / "avatars"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_SIZE_MB = 5
MAX_BYTES = MAX_SIZE_MB * 1024 * 1024


def _user_response(user: User) -> UserMeResponse:
    return UserMeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name or "",
        avatar_url=user.avatar_url,
        role=user.role or "user",
        preferred_language=user.preferred_language or "english",
        is_active=user.is_active,
        created_at=user.created_at,
        dietary_preference=user.dietary_preference or "",
        allergies=user.allergies or "",
        calorie_goal=user.calorie_goal,
        totp_enabled=bool(user.totp_enabled),
        onboarding_completed=bool(user.onboarding_completed),
        subscription_tier=user.subscription_tier or "free",
        subscription_status=user.subscription_status or "",
        current_period_end=user.current_period_end,
    )


@router.get("/users/me", response_model=UserMeResponse)
async def get_me(user: User = Depends(get_current_user)):
    return _user_response(user)


@router.patch("/users/me", response_model=UserMeResponse)
async def update_me(
    data: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.preferred_language is not None:
        user.preferred_language = data.preferred_language.strip()
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url.strip() if data.avatar_url else None
    if data.dietary_preference is not None:
        user.dietary_preference = data.dietary_preference.strip()
    if data.allergies is not None:
        user.allergies = data.allergies.strip()
    if data.calorie_goal is not None:
        user.calorie_goal = data.calorie_goal
    if data.onboarding_completed is not None:
        user.onboarding_completed = data.onboarding_completed
    db.commit()
    db.refresh(user)
    return _user_response(user)


@router.post("/users/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a profile picture from the user's computer. Returns the avatar URL and updates the user."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an image (jpg, png, gif, webp).")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allowed formats: jpg, jpeg, png, gif, webp.")
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Image must be under {MAX_SIZE_MB} MB.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{user.id}_{int(time.time() * 1000)}{suffix}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    # Store relative path so frontend can prepend its API_BASE_URL and always load from same origin
    avatar_path = f"/avatars/{filename}"
    try:
        user.avatar_url = avatar_path
        db.commit()
        db.refresh(user)
    except Exception as db_err:
        logger.error(f"Failed to update avatar_url in DB for user {user.id}: {db_err}")
        try:
            filepath.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to save avatar. Please try again.")
    logger.info(f"User {user.id} uploaded avatar: {filename}")
    return {"avatar_url": avatar_path}


@router.post("/users/me/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.auth import verify_password
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"message": "Password updated"}


@router.get("/users/me/assessments")
async def my_assessments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(Assessment)
        .filter(Assessment.user_id == user.id)
        .order_by(Assessment.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "assessment_id": r.assessment_id,
            "risk_level": r.risk_level,
            "probability": r.probability,
            "executive_summary": r.executive_summary,
            "payload": _safe_json(r.payload),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/users/me/heart-assessments")
async def my_heart_assessments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(HeartAssessment)
        .filter(HeartAssessment.user_id == user.id)
        .order_by(HeartAssessment.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "assessment_id": r.assessment_id,
            "risk_level": r.risk_level,
            "probability": r.probability,
            "executive_summary": r.executive_summary,
            "payload": _safe_json(r.payload),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/users/me/diet-plans")
async def my_diet_plans(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(DietPlanRecord)
        .filter(DietPlanRecord.user_id == user.id)
        .order_by(DietPlanRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "goal": r.goal,
            "overview": r.overview,
            "payload": _safe_json(r.payload),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/users/me/diet-plans")
async def save_diet_plan(
    body: SaveDietPlanRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a diet plan to the current user's account (e.g. from mobile)."""
    overview = (body.overview or (body.payload.get("overview") if body.payload else ""))[:4096]
    goal = (body.goal or (body.payload.get("goals") if isinstance(body.payload, dict) else "")) or ""
    if isinstance(goal, str):
        goal = goal[:128]
    rec = DietPlanRecord(
        user_id=user.id,
        goal=goal,
        overview=overview,
        payload=json.dumps(body.payload) if body.payload else None,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "message": "saved"}


# ---- Export my data (feature f11) ----
@router.get("/users/me/export")
async def export_my_data(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all user data as JSON for download."""
    assessments = (
        db.query(Assessment).filter(Assessment.user_id == user.id)
        .order_by(Assessment.created_at.desc()).all()
    )
    diet_plans = (
        db.query(DietPlanRecord).filter(DietPlanRecord.user_id == user.id)
        .order_by(DietPlanRecord.created_at.desc()).all()
    )
    return {
        "profile": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name or "",
            "role": user.role or "user",
            "preferred_language": user.preferred_language or "english",
            "dietary_preference": user.dietary_preference or "",
            "allergies": user.allergies or "",
            "calorie_goal": user.calorie_goal,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "assessments": [
            {
                "id": a.id,
                "assessment_id": a.assessment_id,
                "risk_level": a.risk_level,
                "probability": a.probability,
                "executive_summary": a.executive_summary,
                "payload": _safe_json(a.payload),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in assessments
        ],
        "diet_plans": [
            {
                "id": d.id,
                "goal": d.goal,
                "overview": d.overview,
                "payload": _safe_json(d.payload),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in diet_plans
        ],
        "exported_at": datetime.utcnow().isoformat(),
    }


# ---- Share assessment with doctor (feature f16) ----
@router.post("/users/me/assessments/{assessment_id}/share")
async def share_assessment(
    assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a public share token for an assessment."""
    a = db.query(Assessment).filter(
        Assessment.id == assessment_id, Assessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if not a.share_token:
        a.share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(a)
    return {"share_token": a.share_token, "assessment_id": a.id}


@router.delete("/users/me/assessments/{assessment_id}/share")
async def revoke_share(
    assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke a shared assessment link."""
    a = db.query(Assessment).filter(
        Assessment.id == assessment_id, Assessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    a.share_token = None
    db.commit()
    return {"message": "Share link revoked"}


@router.delete("/users/me/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete one of the current user's assessments."""
    a = db.query(Assessment).filter(
        Assessment.id == assessment_id, Assessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    db.delete(a)
    db.commit()
    return {"message": "Assessment deleted"}


# ---- Heart assessment share / delete ----
@router.post("/users/me/heart-assessments/{heart_assessment_id}/share")
async def share_heart_assessment(
    heart_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a public share token for a heart assessment."""
    a = db.query(HeartAssessment).filter(
        HeartAssessment.id == heart_assessment_id, HeartAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Heart assessment not found")
    if not a.share_token:
        a.share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(a)
    return {"share_token": a.share_token, "assessment_id": a.id}


@router.delete("/users/me/heart-assessments/{heart_assessment_id}/share")
async def revoke_heart_share(
    heart_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke a shared heart assessment link."""
    a = db.query(HeartAssessment).filter(
        HeartAssessment.id == heart_assessment_id, HeartAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Heart assessment not found")
    a.share_token = None
    db.commit()
    return {"message": "Share link revoked"}


@router.delete("/users/me/heart-assessments/{heart_assessment_id}")
async def delete_heart_assessment(
    heart_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete one of the current user's heart assessments."""
    a = db.query(HeartAssessment).filter(
        HeartAssessment.id == heart_assessment_id, HeartAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Heart assessment not found")
    db.delete(a)
    db.commit()
    return {"message": "Heart assessment deleted"}


# ---- CKD Assessment history ----
@router.get("/users/me/ckd-assessments")
async def my_ckd_assessments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(CKDAssessment)
        .filter(CKDAssessment.user_id == user.id)
        .order_by(CKDAssessment.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "assessment_id": r.assessment_id,
            "prediction": r.prediction,
            "confidence": r.confidence,
            "executive_summary": r.executive_summary,
            "payload": _safe_json(r.payload),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "share_token": r.share_token,
        }
        for r in rows
    ]


@router.post("/users/me/ckd-assessments/{ckd_assessment_id}/share")
async def share_ckd_assessment(
    ckd_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(CKDAssessment).filter(
        CKDAssessment.id == ckd_assessment_id, CKDAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="CKD assessment not found")
    if not a.share_token:
        a.share_token = secrets.token_urlsafe(32)
        db.commit()
        db.refresh(a)
    return {"share_token": a.share_token, "assessment_id": a.id}


@router.delete("/users/me/ckd-assessments/{ckd_assessment_id}/share")
async def revoke_ckd_share(
    ckd_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(CKDAssessment).filter(
        CKDAssessment.id == ckd_assessment_id, CKDAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="CKD assessment not found")
    a.share_token = None
    db.commit()
    return {"message": "Share link revoked"}


@router.delete("/users/me/ckd-assessments/{ckd_assessment_id}")
async def delete_ckd_assessment(
    ckd_assessment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.query(CKDAssessment).filter(
        CKDAssessment.id == ckd_assessment_id, CKDAssessment.user_id == user.id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="CKD assessment not found")
    db.delete(a)
    db.commit()
    return {"message": "CKD assessment deleted"}


# ---- Brain MRI Analysis history ----
@router.get("/users/me/brain-mri-analyses")
async def my_brain_mri_analyses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(BrainMriAnalysis)
        .filter(BrainMriAnalysis.user_id == user.id)
        .order_by(BrainMriAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "assessment_id": r.assessment_id,
            "tumor_class": r.tumor_class,
            "confidence": r.confidence,
            "executive_summary": r.executive_summary,
            "payload": _safe_json(r.payload),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/users/me/brain-mri-analyses/{record_id}")
async def delete_brain_mri_analysis(
    record_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = db.query(BrainMriAnalysis).filter(
        BrainMriAnalysis.id == record_id, BrainMriAnalysis.user_id == user.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Brain MRI analysis not found")
    db.delete(r)
    db.commit()
    return {"message": "Brain MRI analysis deleted"}


@router.delete("/users/me/diet-plans/{diet_plan_id}")
async def delete_diet_plan(
    diet_plan_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete one of the current user's diet plans."""
    d = db.query(DietPlanRecord).filter(
        DietPlanRecord.id == diet_plan_id, DietPlanRecord.user_id == user.id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Diet plan not found")
    db.delete(d)
    db.commit()
    return {"message": "Diet plan deleted"}


# ---- 2FA TOTP setup (feature f15) ----
@router.post("/users/me/2fa/setup")
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a TOTP secret and return URI for QR code scanning."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=501, detail="2FA not available (pyotp not installed)")
    secret = pyotp.random_base32()
    user.totp_secret = secret
    db.commit()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="Bonus Life AI")
    return {"secret": secret, "uri": uri}


@router.post("/users/me/2fa/verify")
async def verify_2fa(
    body: TOTPVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify TOTP code and enable 2FA. Accepts code in request body (not query string)."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=501, detail="2FA not available (pyotp not installed)")
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="No 2FA setup found. Call /2fa/setup first.")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Try again.")
    user.totp_enabled = True
    db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/users/me/2fa/disable")
async def disable_2fa(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable 2FA for the current user."""
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"message": "2FA disabled"}


# ---- Notifications (feature f17) ----
class CreateReminderRequest(BaseModel):
    title: str
    message: str = ""

@router.post("/users/me/notifications/reminder")
async def create_reminder(
    body: CreateReminderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = Notification(
        user_id=user.id,
        title=body.title[:255],
        message=(body.message or "")[:2048],
        type="reminder",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "title": rec.title, "message": rec.message, "type": rec.type, "is_read": rec.is_read}


@router.get("/users/me/notifications")
async def get_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
) -> List[dict]:
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


@router.post("/users/me/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == user.id
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"message": "Marked as read"}


@router.post("/users/me/notifications/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.is_read == False
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read"}


@router.delete("/users/me/notifications/{notif_id}")
async def delete_notification(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == user.id
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(n)
    db.commit()
    return {"message": "Notification deleted"}


# ---------------------------------------------------------------------------
# Subscription (Stripe) – no feature gating; Pro = early access to future features
# ---------------------------------------------------------------------------
class CheckoutRequest(BaseModel):
    plan: str  # "pro_monthly" | "pro_yearly"


class ConfirmSubscriptionRequest(BaseModel):
    session_id: str  # Stripe Checkout Session ID (e.g. cs_xxx)


@router.get("/users/me/subscription")
async def get_my_subscription(
    user: User = Depends(get_current_user),
):
    """Return current user's subscription tier and status."""
    return {
        "subscription_tier": user.subscription_tier or "free",
        "subscription_status": user.subscription_status or "",
        "current_period_end": user.current_period_end.isoformat() if user.current_period_end else None,
    }


@router.post("/users/me/subscription/confirm")
async def confirm_subscription(
    data: ConfirmSubscriptionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm subscription after Stripe Checkout success using session_id from redirect URL."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Subscription is not configured")
    result = stripe_service.confirm_checkout_session(data.session_id)
    if not result:
        raise HTTPException(status_code=400, detail="Invalid or expired checkout session")
    tier, status, period_end, sub_id, customer_id, metadata_user_id = result
    if metadata_user_id and str(user.id) != metadata_user_id:
        raise HTTPException(status_code=403, detail="Session does not belong to this user")
    user.subscription_tier = tier
    user.subscription_status = status or "active"
    user.current_period_end = period_end
    if sub_id:
        user.stripe_subscription_id = sub_id
    if customer_id:
        user.stripe_customer_id = customer_id
    db.commit()
    db.refresh(user)
    return {
        "subscription_tier": user.subscription_tier or "free",
        "subscription_status": user.subscription_status or "",
        "current_period_end": user.current_period_end.isoformat() if user.current_period_end else None,
    }


@router.post("/users/me/subscription/sync")
async def sync_subscription_from_stripe(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch current subscription from Stripe and update user. Use if redirect confirm was missed."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Subscription is not configured")
    result = stripe_service.fetch_subscription_for_user(
        getattr(user, "stripe_subscription_id", None),
        user.stripe_customer_id,
    )
    if not result:
        raise HTTPException(
            status_code=404,
            detail="No active subscription found in Stripe. Complete checkout and return to the dashboard, or try again later.",
        )
    tier, status, period_end, sub_id = result
    user.subscription_tier = tier
    user.subscription_status = status or "active"
    user.current_period_end = period_end
    if sub_id:
        user.stripe_subscription_id = sub_id
    db.commit()
    db.refresh(user)
    return {
        "subscription_tier": user.subscription_tier or "free",
        "subscription_status": user.subscription_status or "",
        "current_period_end": user.current_period_end.isoformat() if user.current_period_end else None,
    }


@router.post("/users/me/checkout")
async def create_checkout(
    data: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create Stripe Checkout session; returns { url } to redirect user."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Subscription is not configured")
    price_id = stripe_service.get_price_id(data.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail="Invalid plan")
    import os
    # Default matches the Vercel production domain (project: bonus-life-ai) so Stripe
    # checkout/portal redirects work even if FRONTEND_URL isn't set on Railway.
    base = os.getenv("FRONTEND_URL", "https://bonus-life-ai-cyan.vercel.app").rstrip("/")
    success_url = f"{base}/dashboard?subscription=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{base}/pricing"
    customer_id = stripe_service.create_or_get_customer(
        user.email, user.full_name or "", user.stripe_customer_id
    )
    if not customer_id:
        raise HTTPException(status_code=500, detail="Could not create customer")
    if not user.stripe_customer_id:
        user.stripe_customer_id = customer_id
        db.commit()
    url, stripe_error = stripe_service.create_checkout_session(
        customer_id, price_id, success_url, cancel_url, user.id
    )
    if not url:
        raise HTTPException(
            status_code=400,
            detail=stripe_error or "Could not create checkout session",
        )
    return {"url": url}


@router.post("/users/me/customer-portal")
async def create_portal_session(
    user: User = Depends(get_current_user),
):
    """Create Stripe Customer Portal session; returns { url } to manage subscription."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Subscription is not configured")
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No subscription to manage")
    import os
    # Default matches the Vercel production domain (project: bonus-life-ai) so Stripe
    # checkout/portal redirects work even if FRONTEND_URL isn't set on Railway.
    base = os.getenv("FRONTEND_URL", "https://bonus-life-ai-cyan.vercel.app").rstrip("/")
    return_url = f"{base}/dashboard"
    url = stripe_service.create_portal_session(user.stripe_customer_id, return_url)
    if not url:
        raise HTTPException(status_code=500, detail="Could not create portal session")
    return {"url": url}
