"""Create in-app notifications for users."""

from typing import Tuple

from sqlalchemy.orm import Session

from app.db_models import Notification

# System-generated notification text, localized. Keyed by a short event name so route
# handlers can pass the user's language instead of hardcoding English strings — the
# notification panel UI is localized but these were always dispatched in English.
NOTIFICATION_TEXT = {
    "assessment_complete": {
        "arabic": ("اكتمل التقييم", "تقييم مخاطر السكري الخاص بك جاهز. اطّلع عليه في لوحة التحكم."),
        "turkish": ("Değerlendirme tamamlandı", "Diyabet risk değerlendirmeniz hazır. Panelinizden görüntüleyin."),
        "english": ("Assessment complete", "Your diabetes risk assessment is ready. View it in your Dashboard."),
    },
    "brain_mri_complete": {
        "arabic": ("اكتمل تحليل الرنين المغناطيسي للدماغ", "تحليل الرنين المغناطيسي للدماغ جاهز. اطّلع على النتائج في لوحة التحكم."),
        "turkish": ("Beyin MR analizi tamamlandı", "Beyin MR analiziniz hazır. Sonuçları panelinizden görüntüleyin."),
        "english": ("Brain MRI analysis complete", "Your brain MRI analysis is ready. View results in your Dashboard."),
    },
    "heart_complete": {
        "arabic": ("اكتمل تقييم القلب", "تقييم مخاطر القلب الخاص بك جاهز. اطّلع عليه في لوحة التحكم."),
        "turkish": ("Kalp değerlendirmesi tamamlandı", "Kalp risk değerlendirmeniz hazır. Panelinizden görüntüleyin."),
        "english": ("Heart assessment complete", "Your heart risk assessment is ready. View it in your Dashboard."),
    },
    "ckd_complete": {
        "arabic": ("اكتمل تقييم الكلى", "تقييم مخاطر أمراض الكلى الخاص بك جاهز. اطّلع عليه في لوحة التحكم."),
        "turkish": ("Böbrek değerlendirmesi tamamlandı", "Böbrek hastalığı risk değerlendirmeniz hazır. Panelinizden görüntüleyin."),
        "english": ("CKD assessment complete", "Your kidney disease risk assessment is ready. View it in your Dashboard."),
    },
    "diet_plan_ready": {
        "arabic": ("خطة النظام الغذائي جاهزة", "تم حفظ خطتك الغذائية الجديدة. اطّلع عليها في لوحة التحكم."),
        "turkish": ("Diyet planı hazır", "Yeni diyet planınız kaydedildi. Panelinizden görüntüleyin."),
        "english": ("Diet plan ready", "Your new diet plan has been saved. View it in your Dashboard."),
    },
}


def localized_notification(kind: str, language: str) -> Tuple[str, str]:
    """Return (title, message) for a system notification event, localized to `language`."""
    variants = NOTIFICATION_TEXT.get(kind, {})
    return variants.get(language, variants.get("english", ("Notification", "")))


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str = "",
    notif_type: str = "info",
) -> Notification:
    """Create and persist an in-app notification for a user."""
    msg_truncated = (message or "")[:2048]  # avoid huge messages
    rec = Notification(
        user_id=user_id,
        title=(title or "Notification")[:255],
        message=msg_truncated,
        type=(notif_type or "info")[:50],
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec
