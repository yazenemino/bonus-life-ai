"""
SQLAlchemy ORM models.
Authors: Muhammed Jalahej, Yazen Emino
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from app.database import Base


# ---- Audit Log ----
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    admin_email = Column(String(255), default="")
    action = Column(String(100), nullable=False)  # e.g. "delete_user", "change_role"
    target_type = Column(String(50), default="")  # e.g. "user", "announcement"
    target_id = Column(Integer, nullable=True)
    target_label = Column(String(255), default="")  # e.g. user email
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


# ---- Announcements ----
class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)


# ---- Site Settings / Feature Flags ----
class SiteSetting(Base):
    __tablename__ = "site_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(500), default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), default="")
    avatar_url = Column(String(512), nullable=True)  # Profile picture URL
    role = Column(String(50), default="user")  # user | admin
    is_active = Column(Boolean, default=True)
    preferred_language = Column(String(20), default="english")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Password reset (for forgot-password flow)
    password_reset_token = Column(String(255), nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)
    # Diet preferences (feature f8)
    dietary_preference = Column(String(50), default="")   # vegetarian, vegan, etc.
    allergies = Column(String(500), default="")            # comma-separated
    calorie_goal = Column(Integer, nullable=True)
    # Admin notes (feature f12)
    admin_notes = Column(Text, default="")
    # 2FA (feature f15)
    totp_secret = Column(String(64), nullable=True)
    totp_enabled = Column(Boolean, default=False)
    # Onboarding (feature f2)
    onboarding_completed = Column(Boolean, default=False)
    # Subscription (Stripe): no feature gating – all tools stay free; Pro = early access to future features
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    subscription_tier = Column(String(50), default="free")  # free | pro_monthly | pro_yearly
    subscription_status = Column(String(50), default="")    # active | canceled | past_due | trialing | ""
    current_period_end = Column(DateTime, nullable=True)     # when current billing period ends

    assessments = relationship("Assessment", back_populates="user", cascade="all, delete-orphan")
    heart_assessments = relationship("HeartAssessment", back_populates="user", cascade="all, delete-orphan")
    ckd_assessments = relationship("CKDAssessment", back_populates="user", cascade="all, delete-orphan")
    brain_mri_analyses = relationship("BrainMriAnalysis", back_populates="user", cascade="all, delete-orphan")
    diet_plans = relationship("DietPlanRecord", back_populates="user", cascade="all, delete-orphan")
    meal_logs = relationship("MealLog", back_populates="user", cascade="all, delete-orphan")
    passkey_credentials = relationship("PasskeyCredential", back_populates="user", cascade="all, delete-orphan")
    face_enrollment = relationship("FaceEnrollment", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, default="")
    type = Column(String(50), default="info")  # info, warning, success, reminder
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(String(64), unique=True, index=True)
    risk_level = Column(String(64))
    probability = Column(Float)
    executive_summary = Column(Text, default="")
    payload = Column(Text)  # JSON string of request/response summary
    created_at = Column(DateTime, default=datetime.utcnow)
    # Share token for sharing with doctor (feature f16)
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    # Soft-delete: admin can hide from admin view without deleting user data
    admin_hidden = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="assessments")


class HeartAssessment(Base):
    __tablename__ = "heart_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(String(64), unique=True, index=True)
    risk_level = Column(String(64))
    probability = Column(Float)
    executive_summary = Column(Text, default="")
    payload = Column(Text)  # JSON string of request/response summary
    created_at = Column(DateTime, default=datetime.utcnow)
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    admin_hidden = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="heart_assessments")


class BrainMriAnalysis(Base):
    """Brain MRI tumor classification record (ResNet18)."""
    __tablename__ = "brain_mri_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(String(64), unique=True, index=True)
    tumor_class = Column(String(64), default="unknown")  # no tumor | glioma | meningioma | pituitary
    confidence = Column(Float, nullable=True)
    executive_summary = Column(Text, default="")
    payload = Column(Text)  # JSON: all_probabilities, full result
    created_at = Column(DateTime, default=datetime.utcnow)
    admin_hidden = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="brain_mri_analyses")




class DietPlanRecord(Base):
    __tablename__ = "diet_plan_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    goal = Column(String(128), default="")
    plan_name = Column(String(255), default="")
    overview = Column(Text, default="")
    payload = Column(Text)  # JSON string of full response
    created_at = Column(DateTime, default=datetime.utcnow)
    admin_hidden = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="diet_plans")


class CKDAssessment(Base):
    """Chronic Kidney Disease risk assessment record."""
    __tablename__ = "ckd_assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(String(64), unique=True, index=True)
    prediction = Column(String(32))       # "CKD" | "No CKD"
    confidence = Column(Float)
    executive_summary = Column(Text, default="")
    payload = Column(Text)               # JSON string of request/response summary
    created_at = Column(DateTime, default=datetime.utcnow)
    share_token = Column(String(64), nullable=True, unique=True, index=True)
    # Soft-delete: admin can hide from admin view without deleting user data
    admin_hidden = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="ckd_assessments")


class MealLog(Base):
    """AI Meal Photo Analyzer: one entry per analyzed meal (saved to user's log)."""
    __tablename__ = "meal_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_name = Column(String(255), nullable=False)
    carb_level = Column(String(32), nullable=False)  # low | medium | high
    healthier_swaps = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="meal_logs")


# ---- Passkey (WebAuthn) ----
class PasskeyCredential(Base):
    """Stored WebAuthn passkey credential for passwordless / Face ID login."""
    __tablename__ = "passkey_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String(512), nullable=False, unique=True)  # base64url
    public_key = Column(Text, nullable=False)  # base64url
    sign_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="passkey_credentials")


# ---- Face login (app-level face enrollment) ----
class FaceEnrollment(Base):
    """One face embedding per user for 'Sign in with your face' (Option 2)."""
    __tablename__ = "face_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    embedding = Column(Text, nullable=False)  # JSON array of 128 floats (from face-api.js or similar)
    enabled = Column(Boolean, default=True, nullable=False)  # user can turn face login on/off
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="face_enrollment")
