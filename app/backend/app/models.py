"""Pydantic models for all API request/response schemas.

Authors: Muhammed Jalahej, Yazen Emino
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, validator, ConfigDict
from datetime import datetime


# ---------------------------------------------------------------
# Chat
# ---------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    language: Optional[str] = "english"
    user_id: Optional[str] = "default"
    user_context: Optional[str] = None  # Latest assessment context for personalized responses


class ChatResponse(BaseModel):
    response: str
    timestamp: str
    conversation_id: str
    model: str
    error_detail: Optional[str] = None  # only in development when LLM fails


# ---------------------------------------------------------------
# Diabetes Assessment
# ---------------------------------------------------------------
class DiabetesAssessmentRequest(BaseModel):
    glucose: float = Field(..., ge=0, le=500, description="Glucose level in mg/dL")
    blood_pressure: float = Field(..., ge=0, le=300, description="Blood pressure in mmHg")
    weight: float = Field(..., ge=20, le=300, description="Weight in kg")
    height: float = Field(..., ge=50, le=250, description="Height in cm")
    age: int = Field(..., ge=1, le=120, description="Age in years")
    pregnancies: Optional[int] = Field(0, ge=0, le=20, description="Number of pregnancies")
    skin_thickness: Optional[float] = Field(20.0, ge=0, le=100, description="Skin thickness in mm")
    insulin: Optional[float] = Field(80.0, ge=0, le=900, description="Insulin level in mu U/ml")
    diabetes_pedigree_function: Optional[float] = Field(0.5, ge=0, le=3.0, description="Diabetes pedigree function")
    language: Optional[str] = Field("english", description="Response language")


class AssessmentResponse(BaseModel):
    assessment_id: str
    timestamp: str
    executive_summary: str
    risk_analysis: Dict[str, Any]
    health_metrics: Dict[str, Any]
    recommendations: Dict[str, Any]


# ---------------------------------------------------------------
# Heart Disease Risk Assessment (UCI Cleveland-style features)
# ---------------------------------------------------------------
class HeartAssessmentRequest(BaseModel):
    age: int = Field(..., ge=1, le=120, description="Age in years")
    sex: int = Field(..., ge=0, le=1, description="Sex (0=female, 1=male)")
    cp: int = Field(..., ge=0, le=4, description="Chest pain type (0-4)")
    trestbps: int = Field(..., ge=80, le=250, description="Resting blood pressure (mmHg)")
    chol: int = Field(..., ge=100, le=600, description="Serum cholesterol (mg/dL)")
    fbs: int = Field(0, ge=0, le=1, description="Fasting blood sugar >120 (0/1)")
    restecg: int = Field(0, ge=0, le=2, description="Resting ECG (0=normal, 1=ST-T, 2=LVH)")
    thalach: int = Field(..., ge=60, le=220, description="Max heart rate achieved")
    exang: int = Field(0, ge=0, le=1, description="Exercise induced angina (0/1)")
    oldpeak: float = Field(0.0, ge=0.0, le=10.0, description="ST depression (exercise)")
    slope: int = Field(1, ge=1, le=3, description="Peak exercise ST slope (1-3)")
    ca: int = Field(0, ge=0, le=4, description="Number of major vessels (0-4)")
    thal: int = Field(3, ge=0, le=7, description="Thalassemia (3=normal, 6=fixed, 7=reversible)")
    language: Optional[str] = Field("english", description="Response language")


class HeartAssessmentResponse(BaseModel):
    assessment_id: str
    timestamp: str
    executive_summary: str
    risk_analysis: Dict[str, Any]
    recommendations: Dict[str, Any]


# ---------------------------------------------------------------
# CKD Assessment (Chronic Kidney Disease)
# ---------------------------------------------------------------
class CKDAssessmentRequest(BaseModel):
    # Patient Info
    age: float = Field(..., ge=1, le=120, description="Age in years")
    blood_pressure: float = Field(..., ge=40, le=200, description="Diastolic blood pressure (mmHg)")
    # Urine Tests
    specific_gravity: float = Field(1.020, ge=1.000, le=1.030, description="Urine specific gravity")
    albumin: int = Field(0, ge=0, le=5, description="Albumin in urine (0–5 scale)")
    sugar: int = Field(0, ge=0, le=5, description="Sugar in urine (0–5 scale)")
    red_blood_cells: int = Field(0, ge=0, le=1, description="RBC in urine (0=normal, 1=abnormal)")
    pus_cell: int = Field(0, ge=0, le=1, description="Pus cell (0=normal, 1=abnormal)")
    pus_cell_clumps: int = Field(0, ge=0, le=1, description="Pus cell clumps (0=not present, 1=present)")
    bacteria: int = Field(0, ge=0, le=1, description="Bacteria (0=not present, 1=present)")
    # Blood Tests
    blood_glucose_random: float = Field(120.0, ge=50, le=500, description="Random blood glucose (mg/dL)")
    blood_urea: float = Field(25.0, ge=5, le=200, description="Blood urea (mg/dL)")
    serum_creatinine: float = Field(1.0, ge=0.1, le=20.0, description="Serum creatinine (mg/dL)")
    sodium: float = Field(140.0, ge=100, le=160, description="Serum sodium (mEq/L)")
    potassium: float = Field(4.5, ge=2.0, le=10.0, description="Serum potassium (mEq/L)")
    hemoglobin: float = Field(13.0, ge=3.0, le=20.0, description="Hemoglobin (g/dL)")
    packed_cell_volume: float = Field(40.0, ge=10, le=60, description="Packed cell volume (%)")
    white_blood_cell_count: float = Field(7800.0, ge=2000, le=30000, description="WBC count (cells/mm³)")
    red_blood_cell_count: float = Field(5.0, ge=1.0, le=8.0, description="RBC count (millions/mm³)")
    # Medical History
    hypertension: int = Field(0, ge=0, le=1, description="Hypertension (0=no, 1=yes)")
    diabetes_mellitus: int = Field(0, ge=0, le=1, description="Diabetes mellitus (0=no, 1=yes)")
    coronary_artery_disease: int = Field(0, ge=0, le=1, description="Coronary artery disease (0=no, 1=yes)")
    appetite: int = Field(1, ge=0, le=1, description="Appetite (0=poor, 1=good)")
    pedal_edema: int = Field(0, ge=0, le=1, description="Pedal edema (0=no, 1=yes)")
    anemia: int = Field(0, ge=0, le=1, description="Anemia (0=no, 1=yes)")
    language: Optional[str] = Field("english", description="Response language")


class CKDAssessmentResponse(BaseModel):
    assessment_id: str
    timestamp: str
    prediction: str          # "CKD" | "No CKD"
    confidence: float        # 0.0 – 1.0
    executive_summary: str
    risk_analysis: Dict[str, Any]
    recommendations: Dict[str, Any]


# ---------------------------------------------------------------
# Diet Plan
# ---------------------------------------------------------------
class DietPlanRequest(BaseModel):
    age: int
    weight: float
    height: float
    gender: str
    dietaryPreference: str = "balanced"
    healthConditions: str = ""
    activityLevel: str = "moderate"
    goals: str = "diabetes_prevention"
    allergies: str = ""
    typicalDay: str = ""
    language: str = "english"


class DietPlanResponse(BaseModel):
    plan_name: str = ""
    overview: str
    daily_plan: str
    grocery_list: str
    important_notes: str
    nutritional_info: Dict[str, Any] = {}
    timestamp: str
    status: str = "success"
    generation_time: float = 0.0


class SaveDietPlanRequest(BaseModel):
    """Save an existing plan to the user's account (e.g. from mobile after viewing)."""
    goal: str = ""
    overview: str = ""
    language: str = "english"
    payload: Dict[str, Any] = Field(..., description="Full plan object (overview, daily_plan, etc.)")


# ---------------------------------------------------------------
# Meal Photo Analyzer
# ---------------------------------------------------------------
class MealPhotoAnalyzeRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded meal image (optional data URL prefix)")
    save_to_log: bool = Field(False, description="If true and user logged in, save this meal to their log")
    language: str = Field("english", description="Response language: english, arabic, or turkish")


class MealPhotoAnalyzeResponse(BaseModel):
    meal_name: str
    carb_level: str  # low | medium | high
    healthier_swaps: str
    saved_to_log: bool = False


# ---------------------------------------------------------------
# Symptom Checker (ML disease prediction from symptoms + profile)
# ---------------------------------------------------------------
class SymptomCheckerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fever: int = Field(..., ge=0, le=1, description="Fever (0=No, 1=Yes)")
    cough: int = Field(..., ge=0, le=1, description="Cough (0=No, 1=Yes)")
    fatigue: int = Field(..., ge=0, le=1, description="Fatigue (0=No, 1=Yes)")
    difficulty_breathing: int = Field(..., ge=0, le=1, description="Difficulty breathing (0=No, 1=Yes)", alias="difficultyBreathing")
    age: float = Field(..., ge=0, le=120, description="Age in years")
    gender: int = Field(..., ge=0, le=1, description="Gender (0=Female, 1=Male)")
    blood_pressure: int = Field(..., ge=0, le=1, description="Blood pressure (0=Normal/Low, 1=High)", alias="bloodPressure")
    cholesterol: int = Field(..., ge=0, le=1, description="Cholesterol (0=Normal/Low, 1=High)")
    language: str = Field("english", description="Response language: english | arabic | turkish")


class SymptomPredictionItem(BaseModel):
    disease: str
    probability: float
    disease_examples: List[str] = []


class SymptomCheckerResponse(BaseModel):
    predictions: List[SymptomPredictionItem]


# ---------------------------------------------------------------
# Voice Chat
# ---------------------------------------------------------------
class VoiceChatRequest(BaseModel):
    audio_data: str
    language: str = "english"
    user_id: str = "default"


class VoiceChatResponse(BaseModel):
    text_input: str
    ai_response: str
    timestamp: str
    language: str
    confidence: float


# ---------------------------------------------------------------
# ML Model (used by ml_model.py / prediction pipeline)
# ---------------------------------------------------------------
class DiabetesInput(BaseModel):
    pregnancies: int = Field(..., ge=0, le=20, description="Number of pregnancies")
    glucose: float = Field(..., ge=0, le=200, description="Glucose level in mg/dL")
    blood_pressure: float = Field(..., ge=0, le=122, description="Blood pressure in mmHg")
    skin_thickness: float = Field(..., ge=0, le=99, description="Skin thickness in mm")
    insulin: float = Field(..., ge=0, le=846, description="Insulin level in mu U/ml")
    weight: float = Field(..., ge=20, le=200, description="Weight in kg")
    height: float = Field(..., ge=0.5, le=2.5, description="Height in meters")
    diabetes_pedigree_function: float = Field(..., ge=0.08, le=2.42, description="Diabetes pedigree function")
    age: int = Field(..., ge=21, le=81, description="Age in years")

    @validator("height")
    def validate_height(cls, v):
        if v <= 0:
            raise ValueError("Height must be positive")
        return v

    @property
    def bmi(self) -> float:
        return round(self.weight / (self.height ** 2), 1)


class MLModelOutput(BaseModel):
    risk_label: str = Field(..., description="Risk label")
    probability: float = Field(..., ge=0.0, le=1.0, description="Probability of diabetes")
    feature_importances: Optional[Dict[str, float]] = Field(None, description="Feature importance scores")
    calculated_bmi: float = Field(..., description="BMI calculated from weight and height")


class LLMAdviceResponse(BaseModel):
    risk_summary: str
    clinical_interpretation: List[str]
    recommendations: Dict[str, str]
    prevention_tips: List[str]
    monitoring_plan: List[str]
    clinician_message: str
    feature_explanation: str
    safety_note: str

    @validator("recommendations", pre=True)
    def validate_recommendations(cls, v):
        if isinstance(v, dict):
            for key, value in v.items():
                if isinstance(value, list):
                    v[key] = "\n".join(
                        [f"- {item}" if not item.startswith("-") else item for item in value]
                    )
                elif not isinstance(value, str):
                    v[key] = str(value)
        return v


class CombinedResponse(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ml_output: MLModelOutput
    llm_advice: LLMAdviceResponse
    bmi_category: str = Field(..., description="Underweight, Normal, Overweight, or Obese")


class ChatMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, description="User's message")
    conversation_context: Optional[str] = Field(None, description="Previous conversation context")


class HealthMetrics(BaseModel):
    status: str
    timestamp: datetime
    version: str
    uptime_seconds: float
    services: Dict[str, bool]
    metrics: Dict[str, Any]


class ErrorResponse(BaseModel):
    detail: str


# ---------------------------------------------------------------
# Auth
# ---------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class UserMeResponse(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    role: str
    preferred_language: str
    is_active: bool
    created_at: Optional[datetime] = None
    # Diet preferences
    dietary_preference: str = ""
    allergies: str = ""
    calorie_goal: Optional[int] = None
    # 2FA
    totp_enabled: bool = False
    # Onboarding
    onboarding_completed: bool = False
    # Subscription (no feature gating – all tools free; Pro = early access to future features)
    subscription_tier: str = "free"
    subscription_status: str = ""
    current_period_end: Optional[datetime] = None


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    preferred_language: Optional[str] = None
    avatar_url: Optional[str] = None
    # Diet preferences
    dietary_preference: Optional[str] = None
    allergies: Optional[str] = None
    calorie_goal: Optional[int] = None
    # Onboarding
    onboarding_completed: Optional[bool] = None


class AdminUserUpdateRequest(BaseModel):
    """Admin can update user role and active status."""
    role: Optional[str] = None  # "user" or "admin"
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


# ---------------------------------------------------------------
# Admin: Create user, Bulk actions, Announcements, Settings
# ---------------------------------------------------------------
class AdminCreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str = ""
    role: str = "user"

class AdminBulkActionRequest(BaseModel):
    user_ids: List[int]
    action: str  # "deactivate", "activate", "delete"

class AnnouncementRequest(BaseModel):
    title: str
    message: str
    is_active: bool = True
    expires_at: Optional[str] = None  # ISO datetime string or None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)

class SiteSettingUpdate(BaseModel):
    key: str
    value: str


class AdminSendEmailRequest(BaseModel):
    subject: str
    body: str


class AdminBulkEmailRequest(BaseModel):
    subject: str
    body: str
    user_ids: Optional[List[int]] = None  # None = all users
    role_filter: Optional[str] = None     # "user" | "admin"


class AdminUserNotesRequest(BaseModel):
    admin_notes: str


class TOTPSetupResponse(BaseModel):
    secret: str
    uri: str


class TOTPVerifyRequest(BaseModel):
    code: str
