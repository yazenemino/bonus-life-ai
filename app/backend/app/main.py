"""
Bonus Life AI - Type 2 Diabetes Early Detection Platform
Backend entry point.

Authors: Muhammed Jalahej, Yazen Emino
"""

import os
import logging
import pickle
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

try:
    import shap
    SHAP_AVAILABLE = True
except (ImportError, AttributeError, Exception):
    SHAP_AVAILABLE = False

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend root so Stripe keys etc. are correct regardless of cwd
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global timing
# ---------------------------------------------------------------------------
app_start_time = datetime.utcnow()

# ---------------------------------------------------------------------------
# ML Model  (simple inline loader – will be replaced in Phase 2)
# ---------------------------------------------------------------------------
class DiabetesMLModel:
    """Load and run the trained diabetes model from a bundled .pkl artifact.

    The bundle is a dict: {"model": <sklearn model>, "scaler": <StandardScaler>, "feature_names": [...]}
    Saved by training/scripts/train_model.py.
    """

    FEATURE_MAP = {
        # maps incoming key -> lower-case feature name used by the training script
        "Pregnancies": "pregnancies",
        "Glucose": "glucose",
        "BloodPressure": "blood_pressure",
        "SkinThickness": "skin_thickness",
        "Insulin": "insulin",
        "BMI": "bmi",
        "DiabetesPedigreeFunction": "diabetes_pedigree_function",
        "Age": "age",
    }

    def __init__(self):
        self.model = None
        self.scaler = None
        self.feature_names = list(self.FEATURE_MAP.keys())  # PascalCase order
        self.load_model()

    def load_model(self):
        model_path = os.getenv("MODEL_PATH", "data/best_model.pkl")
        try:
            if not os.path.exists(model_path):
                logger.warning(f"Model file not found at {model_path}, using rule-based fallback")
                return

            with open(model_path, "rb") as f:
                artifact = pickle.load(f)

            # Support both bundle dict and raw model
            if isinstance(artifact, dict) and "model" in artifact:
                self.model = artifact["model"]
                self.scaler = artifact.get("scaler")
                stored_names = artifact.get("feature_names")
                if stored_names:
                    self.feature_names = [
                        next((k for k, v in self.FEATURE_MAP.items() if v == n), n)
                        for n in stored_names
                    ]
                logger.info(f"Model bundle loaded from {model_path} (scaler={'yes' if self.scaler else 'no'})")
            else:
                # Legacy: raw sklearn model (no scaler)
                self.model = artifact
                logger.info(f"Legacy model loaded from {model_path} (no scaler)")

        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            self.model = None

    def predict(self, features: Dict[str, Any]) -> tuple:
        feature_values = [
            features.get(fn, 0) for fn in self.feature_names
        ]

        if self.model and hasattr(self.model, "predict_proba"):
            try:
                X = np.array([feature_values])

                # Apply scaler if available
                if self.scaler is not None:
                    X = self.scaler.transform(X)

                probability = float(self.model.predict_proba(X)[0][1])

                if probability >= 0.7:
                    risk_label = "High Risk"
                elif probability >= 0.4:
                    risk_label = "Moderate Risk"
                elif probability >= 0.2:
                    risk_label = "Low Risk"
                else:
                    risk_label = "Very Low Risk"

                if hasattr(self.model, "feature_importances_"):
                    fi = dict(zip(self.feature_names, self.model.feature_importances_))
                else:
                    fi = {fn: round(1.0 / len(self.feature_names), 3) for fn in self.feature_names}

                logger.info(f"ML Prediction: {risk_label} (probability: {probability:.3f})")
                return risk_label, probability, fi

            except Exception as e:
                logger.error(f"Prediction error: {e}")
                return self._rule_based_risk(features)

        return self._rule_based_risk(features)

    def explain(self, features: Dict[str, Any]) -> Optional[Dict[str, float]]:
        """Return per-feature SHAP values for a single prediction (explainable AI)."""
        if not SHAP_AVAILABLE or self.model is None:
            return None
        try:
            feature_values = [features.get(fn, 0) for fn in self.feature_names]
            X = np.array([feature_values])
            if self.scaler is not None:
                X = self.scaler.transform(X)

            explainer = shap.TreeExplainer(self.model)
            sv = explainer.shap_values(X)
            # For binary classifiers sv may be [class0, class1]
            vals = sv[1][0] if isinstance(sv, list) else sv[0]
            return {fn: round(float(v), 4) for fn, v in zip(self.feature_names, vals)}
        except Exception as e:
            logger.warning(f"SHAP explanation failed: {e}")
            return None

    def _rule_based_risk(self, features: Dict[str, Any]) -> tuple:
        g = features.get("Glucose", 100)
        b = features.get("BMI", 25)
        a = features.get("Age", 30)
        bp = features.get("BloodPressure", 120)
        risk_score = 0.0
        if g >= 126:    risk_score += 0.6
        elif g >= 100:  risk_score += 0.3
        else:           risk_score += 0.1
        if b >= 30:     risk_score += 0.5
        elif b >= 25:   risk_score += 0.3
        else:           risk_score += 0.1
        if a >= 45:     risk_score += 0.3
        elif a >= 35:   risk_score += 0.2
        else:           risk_score += 0.1
        if bp >= 140:   risk_score += 0.4
        elif bp >= 130: risk_score += 0.2
        else:           risk_score += 0.1
        probability = min(0.95, risk_score / 2.0)
        if probability >= 0.7:   risk_label = "High Risk"
        elif probability >= 0.4: risk_label = "Moderate Risk"
        else:                    risk_label = "Low Risk"
        return risk_label, probability, {"Glucose": 0.3, "BMI": 0.25, "Age": 0.2, "BloodPressure": 0.25}


class HeartMLModel:
    """Load and run the trained heart disease model (UCI Cleveland). Bundle: model, scaler, feature_names (lowercase)."""

    FEATURE_NAMES = [
        "age", "sex", "cp", "trestbps", "chol", "fbs", "restecg",
        "thalach", "exang", "oldpeak", "slope", "ca", "thal",
    ]

    def __init__(self):
        self.model = None
        self.scaler = None
        self.feature_names = list(self.FEATURE_NAMES)
        self.load_model()

    def load_model(self):
        model_path = os.getenv("HEART_MODEL_PATH", "data/Heart.pkl")
        try:
            if not os.path.exists(model_path):
                logger.warning(f"Heart model not found at {model_path}, using rule-based fallback")
                return
            with open(model_path, "rb") as f:
                artifact = pickle.load(f)
            if isinstance(artifact, dict) and "model" in artifact:
                self.model = artifact["model"]
                self.scaler = artifact.get("scaler")
                if artifact.get("feature_names"):
                    self.feature_names = list(artifact["feature_names"])
                logger.info(f"Heart model loaded from {model_path}")
            else:
                self.model = artifact
                logger.info(f"Heart model (legacy) loaded from {model_path}")
        except Exception as e:
            logger.error(f"Heart model loading failed: {e}")
            self.model = None

    def predict(self, features: Dict[str, Any]) -> tuple:
        feature_values = [features.get(fn, 0) for fn in self.feature_names]
        if self.model and hasattr(self.model, "predict_proba"):
            try:
                X = np.array([feature_values])
                if self.scaler is not None:
                    X = self.scaler.transform(X)
                probability = float(self.model.predict_proba(X)[0][1])
                if probability >= 0.6:
                    risk_label = "High Risk"
                elif probability >= 0.35:
                    risk_label = "Moderate Risk"
                elif probability >= 0.15:
                    risk_label = "Low Risk"
                else:
                    risk_label = "Very Low Risk"
                if hasattr(self.model, "feature_importances_"):
                    fi = dict(zip(self.feature_names, self.model.feature_importances_))
                else:
                    fi = {fn: round(1.0 / len(self.feature_names), 3) for fn in self.feature_names}
                logger.info(f"Heart prediction: {risk_label} (probability: {probability:.3f})")
                return risk_label, probability, fi
            except Exception as e:
                logger.error(f"Heart prediction error: {e}")
        return self._rule_based_risk(features)

    def _rule_based_risk(self, features: Dict[str, Any]) -> tuple:
        age = features.get("age", 55)
        chol = features.get("chol", 240)
        trestbps = features.get("trestbps", 130)
        thalach = features.get("thalach", 150)
        score = 0.0
        if age >= 55: score += 0.3
        elif age >= 45: score += 0.2
        if chol >= 240: score += 0.25
        if trestbps >= 140: score += 0.25
        if thalach < 120: score += 0.2
        probability = min(0.9, score)
        if probability >= 0.6: risk_label = "High Risk"
        elif probability >= 0.35: risk_label = "Moderate Risk"
        else: risk_label = "Low Risk"
        return risk_label, probability, {fn: 0.08 for fn in self.feature_names}


class CKDMLModel:
    """Load and run the trained CKD model (24-feature RandomForest).

    Bundle keys: model, feature_names (CSV col order), user_to_csv (API field → CSV col).
    """

    # Maps the 24 user-facing API field names to the CSV column names used by the model
    USER_TO_CSV = {
        "age": "age", "blood_pressure": "bp", "specific_gravity": "sg",
        "albumin": "al", "sugar": "su", "red_blood_cells": "rbc",
        "pus_cell": "pc", "pus_cell_clumps": "pcc", "bacteria": "ba",
        "blood_glucose_random": "bgr", "blood_urea": "bu", "serum_creatinine": "sc",
        "sodium": "sod", "potassium": "pot", "hemoglobin": "hemo",
        "packed_cell_volume": "pcv", "white_blood_cell_count": "wc",
        "red_blood_cell_count": "rc", "hypertension": "htn",
        "diabetes_mellitus": "dm", "coronary_artery_disease": "cad",
        "appetite": "appet", "pedal_edema": "pe", "anemia": "ane",
    }

    FEATURE_ORDER = [
        "age", "bp", "sg", "al", "su", "rbc", "pc", "pcc", "ba",
        "bgr", "bu", "sc", "sod", "pot", "hemo", "pcv", "wc", "rc",
        "htn", "dm", "cad", "appet", "pe", "ane",
    ]

    def __init__(self):
        self.model = None
        self.feature_names = list(self.FEATURE_ORDER)
        self.load_model()

    def load_model(self):
        model_path = os.getenv("CKD_MODEL_PATH", "data/Kidney.pkl")
        try:
            if not os.path.exists(model_path):
                logger.warning(f"CKD model not found at {model_path}, using rule-based fallback")
                return
            with open(model_path, "rb") as f:
                artifact = pickle.load(f)
            if isinstance(artifact, dict) and "model" in artifact:
                self.model = artifact["model"]
                if artifact.get("feature_names"):
                    self.feature_names = list(artifact["feature_names"])
                logger.info(f"CKD model loaded from {model_path}")
            else:
                self.model = artifact
                logger.info(f"CKD model (legacy) loaded from {model_path}")
        except Exception as e:
            logger.error(f"CKD model loading failed: {e}")
            self.model = None

    def predict(self, features: Dict[str, Any]) -> tuple:
        # Translate user-facing field names to CSV column names
        csv_features = {self.USER_TO_CSV.get(k, k): v for k, v in features.items()}
        feature_values = [csv_features.get(fn, 0) for fn in self.feature_names]

        if self.model and hasattr(self.model, "predict_proba"):
            try:
                X = np.array([feature_values])
                probability = float(self.model.predict_proba(X)[0][1])
                label = "CKD" if probability >= 0.5 else "No CKD"
                if hasattr(self.model, "feature_importances_"):
                    fi = dict(zip(self.feature_names, self.model.feature_importances_))
                else:
                    fi = {fn: round(1.0 / len(self.feature_names), 3) for fn in self.feature_names}
                logger.info(f"CKD prediction: {label} (probability: {probability:.3f})")
                return label, probability, fi
            except Exception as e:
                logger.error(f"CKD prediction error: {e}")
        return self._rule_based(features)

    def _rule_based(self, features: Dict[str, Any]) -> tuple:
        sc = features.get("serum_creatinine", 1.0)
        hemo = features.get("hemoglobin", 14.0)
        htn = features.get("hypertension", 0)
        al = features.get("albumin", 0)
        score = 0.0
        if sc > 1.5: score += 0.4
        if hemo < 10: score += 0.3
        if htn == 1: score += 0.15
        if al >= 2: score += 0.15
        probability = min(0.95, score)
        label = "CKD" if probability >= 0.5 else "No CKD"
        return label, probability, {fn: 0.04 for fn in self.feature_names}


# ---------------------------------------------------------------------------
# Service instantiation
# ---------------------------------------------------------------------------
from app.services.ai_specialist import AIDiabetesSpecialist, GPTOSSDiabetesSpecialist
from app.services.diet import GroqLLMService, ProductionMealPlanningService
from app.services.voice_chat import VoiceChatService
from app.services.brain_mri_service import BrainMriService

ai_specialist = AIDiabetesSpecialist()
gpt_oss_specialist = GPTOSSDiabetesSpecialist()
diabetes_model = DiabetesMLModel()
heart_model = HeartMLModel()
ckd_model = CKDMLModel()
llm_service = GroqLLMService()
meal_service = ProductionMealPlanningService(llm_service)
voice_service = VoiceChatService()
brain_mri_service = BrainMriService()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Database (create tables on startup)
# ---------------------------------------------------------------------------
from app.database import engine, Base
from app import db_models as _  # noqa: F401 - ensure models are registered
from sqlalchemy import text

Base.metadata.create_all(bind=engine)

# Add new columns to existing SQLite DB if missing
try:
    with engine.connect() as conn:
        for col_sql in [
            "ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN password_reset_expires DATETIME",
            "ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1",
            "ALTER TABLE users ADD COLUMN preferred_language VARCHAR(20) DEFAULT 'english'",
            "ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512)",
            # New feature columns
            "ALTER TABLE users ADD COLUMN dietary_preference VARCHAR(50) DEFAULT ''",
            "ALTER TABLE users ADD COLUMN allergies VARCHAR(500) DEFAULT ''",
            "ALTER TABLE users ADD COLUMN calorie_goal INTEGER",
            "ALTER TABLE users ADD COLUMN admin_notes TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64)",
            "ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0",
            "ALTER TABLE assessments ADD COLUMN share_token VARCHAR(64)",
            "ALTER TABLE face_enrollments ADD COLUMN enabled INTEGER DEFAULT 1",
            # Subscription (Stripe)
            "ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN subscription_tier VARCHAR(50) DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT ''",
            "ALTER TABLE users ADD COLUMN current_period_end DATETIME",
            # Soft-delete: admin hides assessment without deleting user data
            "ALTER TABLE assessments ADD COLUMN admin_hidden INTEGER DEFAULT 0",
            "ALTER TABLE ckd_assessments ADD COLUMN admin_hidden INTEGER DEFAULT 0",
            "ALTER TABLE heart_assessments ADD COLUMN admin_hidden INTEGER DEFAULT 0",
            "ALTER TABLE brain_mri_analyses ADD COLUMN admin_hidden INTEGER DEFAULT 0",
            "ALTER TABLE diet_plan_records ADD COLUMN admin_hidden INTEGER DEFAULT 0",
            "ALTER TABLE announcements ADD COLUMN expires_at DATETIME",
        ]:
            try:
                conn.execute(text(col_sql))
                conn.commit()
            except Exception:
                pass  # column may already exist
except Exception as e:
    logger.warning(f"Optional DB migration skipped: {e}")

# Create performance indexes for frequently filtered columns (safe: IF NOT EXISTS)
try:
    with engine.connect() as conn:
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS ix_assessments_hidden ON assessments (admin_hidden)",
            "CREATE INDEX IF NOT EXISTS ix_heart_assessments_hidden ON heart_assessments (admin_hidden)",
            "CREATE INDEX IF NOT EXISTS ix_ckd_assessments_hidden ON ckd_assessments (admin_hidden)",
            "CREATE INDEX IF NOT EXISTS ix_brain_mri_hidden ON brain_mri_analyses (admin_hidden)",
            "CREATE INDEX IF NOT EXISTS ix_diet_plan_hidden ON diet_plan_records (admin_hidden)",
            "CREATE INDEX IF NOT EXISTS ix_users_is_active ON users (is_active)",
            "CREATE INDEX IF NOT EXISTS ix_users_role ON users (role)",
            "CREATE INDEX IF NOT EXISTS ix_notifications_user_read ON notifications (user_id, is_read)",
            "CREATE INDEX IF NOT EXISTS ix_assessments_user_created ON assessments (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_heart_user_created ON heart_assessments (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_ckd_user_created ON ckd_assessments (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_brain_user_created ON brain_mri_analyses (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_diet_user_created ON diet_plan_records (user_id, created_at DESC)",
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                pass
except Exception as e:
    logger.warning(f"Index migration skipped: {e}")

# Fix old avatar URLs: normalize /uploads/avatars/ -> /avatars/, then strip http prefix
try:
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE users SET avatar_url = replace(avatar_url, '/uploads/avatars/', '/avatars/') "
            "WHERE avatar_url IS NOT NULL AND avatar_url LIKE '%/uploads/avatars/%'"
        ))
        conn.commit()
        conn.execute(text(
            "UPDATE users SET avatar_url = substr(avatar_url, instr(avatar_url, '/avatars')) "
            "WHERE avatar_url IS NOT NULL AND avatar_url LIKE 'http%' AND avatar_url LIKE '%/avatars/%'"
        ))
        conn.commit()
except Exception:
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[START] Starting Bonus Life AI Platform")
    logger.info(f"   LLM Status: {'Connected' if ai_specialist.client else 'Disconnected'}")
    logger.info(f"   ML Model:   {'Loaded' if diabetes_model.model else 'Rule-based fallback'}")
    brain_mri_service.initialize()
    # One-time admin seed: set ADMIN_SEED_EMAIL + ADMIN_SEED_PASSWORD env vars on Railway
    _seed_email = os.getenv("ADMIN_SEED_EMAIL", "").strip().lower()
    _seed_pass  = os.getenv("ADMIN_SEED_PASSWORD", "").strip()
    if _seed_email and _seed_pass:
        from app.database import SessionLocal
        from app.db_models import User as _User
        from app.auth import hash_password as _hp
        _db = SessionLocal()
        try:
            _u = _db.query(_User).filter(_User.email == _seed_email).first()
            if _u:
                _u.role = "admin"
                _db.commit()
                logger.info(f"[SEED] Promoted {_seed_email} to admin")
            else:
                _db.add(_User(email=_seed_email, hashed_password=_hp(_seed_pass),
                              full_name="Admin", role="admin", is_active=True))
                _db.commit()
                logger.info(f"[SEED] Created admin user {_seed_email}")
        except Exception as _e:
            logger.error(f"[SEED] Failed: {_e}")
        finally:
            _db.close()
    yield
    logger.info("[STOP] Shutting down Bonus Life AI Platform")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Bonus Life AI",
    description="Type 2 Diabetes Early Detection Platform - AI-Powered Health Insights",
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS — only allow known origins; never use wildcard with credentials.
# FRONTEND_URL accepts a comma-separated list so a custom domain and the default
# Vercel subdomain (or apex + www) can be allowed at the same time during migration,
# e.g. FRONTEND_URL=https://bonuslife.tech,https://www.bonuslife.tech,https://bonus-life-ai-cyan.vercel.app
_frontend_urls = [
    u.strip().rstrip("/")
    for u in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",")
    if u.strip()
]
_CORS_ORIGINS = list({
    *_frontend_urls,
    # Actual live Vercel production domain (project: bonus-life-ai) — baked in as a safe
    # default so the deploy works even before FRONTEND_URL is set on Railway. Harmless to
    # keep once it is. Vercel assigned a "-cyan" suffix rather than the bare project name.
    "https://bonus-life-ai-cyan.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    # Vercel preview deployments get a unique per-branch/per-commit subdomain
    # (bonus-life-ai-<hash-or-branch>-<team>.vercel.app) that can't be listed ahead of time —
    # match them by pattern instead. Tightened to this project's prefix, not all of *.vercel.app.
    allow_origin_regex=r"^https://bonus-life-ai(-[a-z0-9]+)*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Maintenance-mode middleware
# ---------------------------------------------------------------------------
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.database import SessionLocal
from app.db_models import SiteSetting


class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    """Return 503 for non-admin requests when maintenance_mode is enabled."""

    # Paths that are always allowed (login, admin endpoints, static assets, health, user identity)
    _ALLOWED_PREFIXES = (
        "/docs", "/redoc", "/openapi.json",
        "/api/v1/auth/",
        "/api/v1/webauthn/",
        "/api/v1/face-auth/",
        "/api/v1/admin/",
        "/api/v1/announcements/",
        "/api/v1/shared/",
        "/api/v1/reports/",
        "/avatars/",
        "/health", "/",
    )
    # Exact paths allowed (not prefix-matched)
    _ALLOWED_EXACT = ("/api/v1/users/me",)

    # Cached maintenance state — refreshed at most once every 10 seconds
    _cached_value: bool = False
    _cached_at: float = 0.0
    _CACHE_TTL: float = 10.0

    async def dispatch(self, request, call_next):
        import time
        path = request.url.path

        # Always allow admin, auth, static, health endpoints, and exact identity endpoint
        if path in ("/", "/health") or path in self._ALLOWED_EXACT or any(
            path.startswith(p) for p in self._ALLOWED_PREFIXES if p not in ("/", "/health")
        ):
            return await call_next(request)

        # Use cached maintenance state; hit DB only when cache is stale
        now = time.monotonic()
        if now - MaintenanceModeMiddleware._cached_at > MaintenanceModeMiddleware._CACHE_TTL:
            try:
                db = SessionLocal()
                row = db.query(SiteSetting).filter(SiteSetting.key == "maintenance_mode").first()
                MaintenanceModeMiddleware._cached_value = bool(
                    row and row.value.lower() in ("true", "1", "yes")
                )
                MaintenanceModeMiddleware._cached_at = now
                db.close()
            except Exception:
                MaintenanceModeMiddleware._cached_value = False

        if MaintenanceModeMiddleware._cached_value:
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "The platform is currently under maintenance. Please try again later."
                },
            )

        return await call_next(request)


app.add_middleware(MaintenanceModeMiddleware)


# ---------------------------------------------------------------------------
# Wire up routes
# ---------------------------------------------------------------------------
# Register TTS routes on the app first so they are never shadowed (fixes 404 → robot voice)
from app.routes import tts as _tts_routes

@app.get("/api/v1/voices", tags=["tts"])
@app.get("/api/v1/tts/voices", tags=["tts"])
def list_voices_endpoint():
    """List ElevenLabs voices. Use a voice_id in .env as ELEVENLABS_VOICE_ID."""
    return _tts_routes.list_voices()

@app.post("/api/v1/tts", tags=["tts"])
def post_tts_endpoint(body: _tts_routes.TTSRequest):
    """Synthesize speech via ElevenLabs. Requires ELEVENLABS_API_KEY in .env."""
    return _tts_routes.post_tts(body)

from app.routes import chat, assessment, diet, health, topics, user, voice_chat, voice_command, tts, hospitals, language, auth, me_routes, admin_routes, reports, meal_photo, webauthn_routes, face_routes, workout_videos, local_ai_routes, stripe_webhook, heart, symptom_checker, brain_mri, ckd, agent

# Inject service instances into route modules
chat.init(ai_specialist)
assessment.init(ai_specialist, diabetes_model)
heart.init(ai_specialist, heart_model)
ckd.init(ai_specialist, ckd_model)
brain_mri.init(ai_specialist, brain_mri_service)
diet.init(meal_service)
health.init(ai_specialist, llm_service, diabetes_model, app_start_time)
user.init(ai_specialist)
voice_chat.init(voice_service, gpt_oss_specialist)

# Include all routers under /api/v1 prefix (except root / health which are top-level)
app.include_router(health.router)                          # /, /health, /api/v1/*
app.include_router(chat.router, prefix="/api/v1")          # /api/v1/chat
app.include_router(assessment.router, prefix="/api/v1")    # /api/v1/diabetes-assessment
app.include_router(heart.router, prefix="/api/v1")         # /api/v1/heart-assessment
app.include_router(ckd.router, prefix="/api/v1")           # /api/v1/ckd-assessment
app.include_router(brain_mri.router, prefix="/api/v1")     # /api/v1/brain-mri-analysis
app.include_router(diet.router, prefix="/api/v1")           # /api/v1/diet-plan/generate
app.include_router(symptom_checker.router, prefix="/api/v1")  # /api/v1/symptom-checker/predict
app.include_router(topics.router, prefix="/api/v1")        # /api/v1/health-topics
app.include_router(user.router, prefix="/api/v1")          # /api/v1/user/*
app.include_router(voice_chat.router, prefix="/api/v1")    # /api/v1/voice-chat
app.include_router(voice_command.router, prefix="/api/v1") # /api/v1/voice-command
app.include_router(tts.router, prefix="/api/v1")           # /api/v1/tts
app.include_router(hospitals.router, prefix="/api/v1")    # /api/v1/nearby-hospitals
app.include_router(language.router, prefix="/api/v1")      # /api/v1/detect-language
app.include_router(auth.router, prefix="/api/v1")          # /api/v1/auth/*
app.include_router(me_routes.router, prefix="/api/v1")     # /api/v1/users/me/*
app.include_router(admin_routes.router, prefix="/api/v1")  # /api/v1/admin/*
app.include_router(admin_routes.public_router, prefix="/api/v1")  # /api/v1/announcements/active
app.include_router(reports.router, prefix="/api/v1")  # /api/v1/reports/*
app.include_router(meal_photo.router, prefix="/api/v1")  # /api/v1/meal-photo/*
app.include_router(webauthn_routes.router, prefix="/api/v1")  # /api/v1/webauthn/*
app.include_router(face_routes.router, prefix="/api/v1")  # /api/v1/face-auth/*
app.include_router(workout_videos.router, prefix="/api/v1/workout-videos")  # GET /api/v1/workout-videos
app.include_router(local_ai_routes.router, prefix="/api/v1/local-ai")  # Local LLM: term, health-tip, scenario
app.include_router(stripe_webhook.router, prefix="/api/v1")    # POST /api/v1/webhooks/stripe
app.include_router(agent.router, prefix="/api/v1")             # POST /api/v1/agent (JARVIS)

# Serve uploaded avatars at /avatars/
_static_avatars = os.path.join(os.path.dirname(__file__), "..", "static", "avatars")
os.makedirs(_static_avatars, exist_ok=True)
if os.path.isdir(_static_avatars):
    app.mount("/avatars", StaticFiles(directory=_static_avatars), name="avatars")


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Production entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8001)),
        reload=os.getenv("RELOAD", "True").lower() == "true",
        log_level="info",
    )
