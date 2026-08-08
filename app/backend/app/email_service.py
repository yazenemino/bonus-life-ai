"""
Simple SMTP email sender for password reset. Works with Gmail (App Password) and Outlook/Hotmail.
Set env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL, FRONTEND_URL.
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER or "noreply@morelife.local")
# Default matches the Vercel production domain (project: bonus-life-ai) so password-reset
# links in emails work even if FRONTEND_URL isn't set on Railway. Same pattern as main.py's CORS.
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://bonus-life-ai-cyan.vercel.app")


def _is_local_dev_mail():
    """True if using local dev mail server (no auth)."""
    return SMTP_HOST in ("localhost", "127.0.0.1") and SMTP_PORT == 1025


def is_configured():
    if not SMTP_HOST:
        return False
    if _is_local_dev_mail():
        return True
    return bool(SMTP_USER and SMTP_PASSWORD)


def get_reset_link(token: str) -> str:
    """Return the password reset URL (for logging when SMTP is not configured)."""
    return f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """Send password reset link. Returns True if sent, False if not configured or error."""
    if not is_configured():
        logger.warning("SMTP not configured; password reset email not sent. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.")
        logger.info("Dev reset link: %s", get_reset_link(reset_token))
        return False
    reset_link = get_reset_link(reset_token)
    subject = "Bonus Life AI - Reset your password"
    body = f"""Hello,

You requested a password reset for your Bonus Life AI account.

Click the link below to set a new password (link expires in 1 hour):

{reset_link}

If you did not request this, you can ignore this email.

— Bonus Life AI
"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if not _is_local_dev_mail():
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL or "noreply@morelife.local", [to_email], msg.as_string())
        logger.info(f"Password reset email sent to {to_email}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send password reset email: {e}")
        return False


def send_generic_email(to_email: str, subject: str, body: str) -> bool:
    """Send a generic email. Returns True if sent."""
    if not is_configured():
        logger.warning("SMTP not configured; email not sent to %s.", to_email)
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if not _is_local_dev_mail():
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL or "noreply@morelife.local", [to_email], msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email}: {e}")
        return False


def send_temporary_password_email(to_email: str, temporary_password: str) -> bool:
    """Send the new temporary password by email. Returns True if sent."""
    if not is_configured():
        logger.warning("SMTP not configured; temporary password email not sent.")
        logger.info("Dev temporary password for %s: %s", to_email, temporary_password)
        return False
    subject = "Bonus Life AI - Your new temporary password"
    body = f"""Hello,

You requested a new password for your Bonus Life AI account.

Your temporary password is: {temporary_password}

Please log in with this password, then go to Dashboard → Profile and change it to a password you will remember.

If you did not request this, please contact support or change your password after logging in.

— Bonus Life AI
"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if not _is_local_dev_mail():
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL or "noreply@morelife.local", [to_email], msg.as_string())
        logger.info(f"Temporary password email sent to {to_email}")
        return True
    except Exception as e:
        logger.exception(f"Failed to send temporary password email: {e}")
        return False
