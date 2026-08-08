"""
WebAuthn (passkey) routes: register options, register complete, login options, login complete.
Enables 'Continue with passkey' / Face ID / Touch ID when the device supports it.
"""

import os
import base64
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.db_models import User, PasskeyCredential
from app.auth import get_current_user, create_access_token
from app.routes.auth import _user_to_response

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webauthn"])

# Relying Party config (from env). Defaults match the Vercel production domain (project:
# bonus-life-ai) so Passkey login works even if these aren't set on Railway — same pattern as
# main.py's CORS. WebAuthn is strict about origin matching, so for LOCAL passkey testing set
# WEBAUTHN_RP_ID=localhost and WEBAUTHN_ORIGIN=http://localhost:5173 in your local .env.
WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "bonus-life-ai-cyan.vercel.app")
WEBAUTHN_RP_NAME = os.getenv("WEBAUTHN_RP_NAME", "Bonus Life AI")
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "https://bonus-life-ai-cyan.vercel.app")


def _b64url_decode(s: str) -> bytes:
    pad = 4 - (len(s) % 4)
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def _get_origin(request=None):
    """Prefer env; otherwise derive from request if needed."""
    if WEBAUTHN_ORIGIN:
        return WEBAUTHN_ORIGIN
    # Could use request.base_url for dynamic origin
    return "https://bonus-life-ai-cyan.vercel.app"


# In-memory challenge store (use Redis in production for multi-instance)
_challenge_store: dict[str, dict] = {}


def _save_challenge(key: str, challenge: bytes, user_id: int | None = None):
    _challenge_store[key] = {"challenge": challenge, "user_id": user_id}


def _get_challenge(key: str) -> dict | None:
    return _challenge_store.pop(key, None)


# ---------------------------------------------------------------------------
# Registration (add passkey) – requires auth
# ---------------------------------------------------------------------------


class RegisterCompleteBody(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str = "public-key"


@router.get("/webauthn/register/options")
async def webauthn_register_options(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get options for navigator.credentials.create(). Call from frontend after user clicks 'Enable passkey'."""
    try:
        from webauthn import generate_registration_options, options_to_json
        from webauthn.helpers.structs import (
            PublicKeyCredentialRpEntity,
            PublicKeyCredentialUserEntity,
            AuthenticatorSelectionCriteria,
            AuthenticatorAttachment,
            UserVerificationRequirement,
            ResidentKeyRequirement,
        )
    except ImportError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebAuthn not available")

    # User id for WebAuthn must be opaque bytes (max 64 bytes). Use a stable encoding of our user id.
    user_id_bytes = str(user.id).encode("utf-8")[:64]
    challenge = secrets.token_bytes(32)
    state_key = secrets.token_urlsafe(16)
    _save_challenge(state_key, challenge, user_id=user.id)

    rp = PublicKeyCredentialRpEntity(name=WEBAUTHN_RP_NAME, id=WEBAUTHN_RP_ID)
    user_entity = PublicKeyCredentialUserEntity(
        id=user_id_bytes,
        name=user.email,
        display_name=user.full_name or user.email,
    )
    # Prefer platform authenticator (Face ID, Touch ID, Windows Hello) so the browser offers it first
    authenticator_selection = AuthenticatorSelectionCriteria(
        authenticator_attachment=AuthenticatorAttachment.PLATFORM,
        user_verification=UserVerificationRequirement.PREFERRED,
        resident_key=ResidentKeyRequirement.PREFERRED,
    )

    options = generate_registration_options(
        rp=rp,
        user=user_entity,
        challenge=challenge,
        authenticator_selection=authenticator_selection,
    )
    options_dict = options_to_json(options)
    # Frontend will send state_key back so we can retrieve challenge
    return {"options": options_dict, "state_key": state_key}


@router.post("/webauthn/register/complete")
async def webauthn_register_complete(
    body: dict,  # { state_key, credential: RegisterCompleteBody }
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify the credential from the client and store it. Body: { state_key, credential }."""
    state_key = body.get("state_key")
    credential = body.get("credential")
    if not state_key or not credential:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="state_key and credential required")

    state = _get_challenge(state_key)
    if not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired challenge")

    try:
        from webauthn import verify_registration_response
        from webauthn.helpers import parse_registration_credential_json
        from webauthn.helpers.structs import RegistrationCredential
    except ImportError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebAuthn not available")

    try:
        reg_cred = parse_registration_credential_json(credential)
        verification = verify_registration_response(
            credential=reg_cred,
            expected_challenge=state["challenge"],
            expected_rp_id=WEBAUTHN_RP_ID,
            expected_origin=_get_origin(),
        )
    except Exception as e:
        logger.warning("WebAuthn verify_registration_response failed: %s", e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification failed")

    credential_id_b64 = base64.urlsafe_b64encode(verification.credential_id).decode("ascii").replace("=", "")
    public_key_b64 = base64.urlsafe_b64encode(verification.credential_public_key).decode("ascii").replace("=", "")

    if db.query(PasskeyCredential).filter(PasskeyCredential.credential_id == credential_id_b64).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credential already registered")

    pk = PasskeyCredential(
        user_id=user.id,
        credential_id=credential_id_b64,
        public_key=public_key_b64,
        sign_count=verification.sign_count,
    )
    db.add(pk)
    db.commit()
    return {"ok": True, "message": "Passkey registered"}


@router.get("/webauthn/status")
async def webauthn_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return whether the current user has at least one passkey (for settings UI)."""
    count = db.query(PasskeyCredential).filter(PasskeyCredential.user_id == user.id).count()
    return {"has_passkey": count > 0}


# ---------------------------------------------------------------------------
# Authentication (login with passkey) – no auth required
# ---------------------------------------------------------------------------


@router.get("/webauthn/login/options")
async def webauthn_login_options(db: Session = Depends(get_db)):
    """Get options for navigator.credentials.get(). Returns allow_credentials from all users (discoverable)."""
    try:
        from webauthn import generate_authentication_options, options_to_json
        from webauthn.helpers.structs import PublicKeyCredentialDescriptor
    except ImportError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebAuthn not available")

    credentials = db.query(PasskeyCredential).all()
    allow_credentials = [
        PublicKeyCredentialDescriptor(id=_b64url_decode(c.credential_id))
        for c in credentials
    ]

    challenge = secrets.token_bytes(32)
    state_key = secrets.token_urlsafe(16)
    _save_challenge(state_key, challenge)

    options = generate_authentication_options(
        rp_id=WEBAUTHN_RP_ID,
        challenge=challenge,
        allow_credentials=allow_credentials if allow_credentials else None,
    )
    options_dict = options_to_json(options)
    return {"options": options_dict, "state_key": state_key}


class LoginCompleteBody(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str = "public-key"


@router.post("/webauthn/login/complete")
async def webauthn_login_complete(body: dict, db: Session = Depends(get_db)):
    """Verify assertion and return JWT. Body: { state_key, credential }."""
    state_key = body.get("state_key")
    credential = body.get("credential")
    if not state_key or not credential:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="state_key and credential required")

    state = _get_challenge(state_key)
    if not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired challenge")

    # Client sends id (base64url string) and sometimes rawId (base64url or ArrayBuffer).
    cred_id = credential.get("id")
    raw_id = credential.get("rawId")
    if isinstance(cred_id, str) and cred_id:
        credential_id_b64 = cred_id
    elif isinstance(raw_id, str) and raw_id:
        credential_id_b64 = raw_id
    elif raw_id is not None:
        credential_id_b64 = base64.urlsafe_b64encode(raw_id).decode("ascii").replace("=", "") if isinstance(raw_id, bytes) else str(raw_id)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing credential id")

    # Normalize: remove padding for consistent lookup
    credential_id_b64 = credential_id_b64.replace("=", "")
    pk = db.query(PasskeyCredential).filter(PasskeyCredential.credential_id == credential_id_b64).first()
    if not pk:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown credential")

    user = db.query(User).filter(User.id == pk.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    try:
        from webauthn import verify_authentication_response
        from webauthn.helpers import parse_authentication_credential_json
        from webauthn.helpers.structs import PublicKeyCredentialDescriptor
    except ImportError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebAuthn not available")

    try:
        auth_cred = parse_authentication_credential_json(credential)
        verification = verify_authentication_response(
            credential=auth_cred,
            expected_challenge=state["challenge"],
            expected_rp_id=WEBAUTHN_RP_ID,
            expected_origin=_get_origin(),
            credential_public_key=_b64url_decode(pk.public_key),
            credential_current_sign_count=pk.sign_count,
        )
    except Exception as e:
        logger.warning("WebAuthn verify_authentication_response failed: %s", e)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Verification failed")

    pk.sign_count = verification.new_sign_count
    db.commit()

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return {"access_token": token, "user": _user_to_response(user)}
