"""
Brain MRI Tumor Classification Service — Bonus Life AI
Uses PyTorch ResNet18 fine-tuned on Brain Tumor MRI dataset.

Classes: no tumor | glioma | meningioma | pituitary
Model: best_brain_tumor_resnet18_finetuned.pth (45 MB)
"""

import io
import os
import logging
from typing import Dict, Any, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy import guards — torch/torchvision are optional (large dependency)
# ---------------------------------------------------------------------------
try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("torch/torchvision not installed — Brain MRI CNN will use fallback")

try:
    from PIL import Image as _PIL_Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


# ---------------------------------------------------------------------------
# Labels (must match training order)
# ---------------------------------------------------------------------------
TUMOR_LABELS = ["no tumor", "glioma", "meningioma", "pituitary"]

TUMOR_DESCRIPTIONS = {
    "en": {
        "no tumor": "No tumor detected in the MRI scan.",
        "glioma": "Glioma — a tumor originating from glial cells in the brain or spine.",
        "meningioma": "Meningioma — typically a slow-growing tumor forming on the brain membranes.",
        "pituitary": "Pituitary adenoma — a typically benign tumor of the pituitary gland.",
    },
    "ar": {
        "no tumor": "لم يتم اكتشاف أي ورم في صورة الرنين المغناطيسي.",
        "glioma": "ورم دبقي — ورم ينشأ من الخلايا الدبقية في الدماغ أو النخاع الشوكي.",
        "meningioma": "ورم سحائي — عادة ما يكون ورمًا بطيء النمو يتكوّن على الأغشية المحيطة بالدماغ.",
        "pituitary": "ورم الغدة النخامية — ورم حميد في الغالب يصيب الغدة النخامية.",
    },
    "tr": {
        "no tumor": "MR taramasında tümör tespit edilmedi.",
        "glioma": "Gliom — beyin veya omurilikteki glial hücrelerden kaynaklanan bir tümör.",
        "meningioma": "Menenjiyom — genellikle beyin zarları üzerinde oluşan yavaş büyüyen bir tümör.",
        "pituitary": "Hipofiz adenomu — hipofiz bezinin genellikle iyi huylu bir tümörü.",
    },
}


def _description_lang(language: Optional[str]) -> str:
    lang = (language or "english").lower()
    if "arabic" in lang or lang == "ar":
        return "ar"
    if "turkish" in lang or lang == "tr":
        return "tr"
    return "en"

TUMOR_SEVERITY = {
    "no tumor": "low",
    "glioma": "high",
    "meningioma": "moderate",
    "pituitary": "moderate",
}

# ImageNet normalization (used during training)
_TRANSFORM = None
if TORCH_AVAILABLE:
    _TRANSFORM = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])


# ---------------------------------------------------------------------------
# Model singleton
# ---------------------------------------------------------------------------
class _BrainModelSingleton:
    _instance = None
    _model = None
    _device = None
    _loaded = False

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._model, cls._device, cls._loaded

    def __init__(self):
        if not TORCH_AVAILABLE:
            logger.warning("BrainMRIService: torch not available, CNN disabled")
            return

        model_path = os.getenv(
            "BRAIN_MRI_MODEL_PATH",
            os.path.join(
                os.path.dirname(__file__), "..", "..", "data", "brain_tumor_resnet18.pth"
            ),
        )
        model_path = os.path.abspath(model_path)

        if not os.path.exists(model_path):
            logger.warning(
                f"BrainMRIService: model file not found at {model_path} — inference unavailable"
            )
            return

        try:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model = models.resnet18(weights=None)
            # Replicate the custom FC head used during training
            model.fc = nn.Sequential(
                nn.Linear(512, 512),
                nn.ReLU(),
                nn.Dropout(0.5),
                nn.Linear(512, 4),
            )
            state = torch.load(model_path, map_location=device, weights_only=True)
            model.load_state_dict(state)
            model.to(device)
            model.eval()

            _BrainModelSingleton._model = model
            _BrainModelSingleton._device = device
            _BrainModelSingleton._loaded = True
            logger.info(f"BrainMRIService: model loaded from {model_path} on {device}")
        except Exception as e:
            logger.error(f"BrainMRIService: failed to load model — {e}")


# ---------------------------------------------------------------------------
# Public service interface
# ---------------------------------------------------------------------------
class BrainMriService:
    """Brain MRI tumor classification using ResNet18."""

    def initialize(self):
        """Pre-load model on startup."""
        _BrainModelSingleton.get()

    def predict(self, image_bytes: bytes, language: Optional[str] = "english") -> Dict[str, Any]:
        """
        Runs ResNet18 inference on the supplied MRI image.
        Returns tumor_class, confidence, all_probabilities.
        """
        model, device, loaded = _BrainModelSingleton.get()
        desc_lang = _description_lang(language)

        if not loaded or model is None:
            return self._unavailable_response(desc_lang)

        if not PIL_AVAILABLE:
            raise RuntimeError("Pillow is required for image preprocessing")
        if not TORCH_AVAILABLE:
            raise RuntimeError("torch/torchvision is required for Brain MRI inference")

        try:
            img = _PIL_Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = _TRANSFORM(img).unsqueeze(0).to(device)

            with torch.no_grad():
                outputs = model(tensor)
                probs = torch.softmax(outputs, dim=1)[0]
                pred_idx = int(torch.argmax(probs).item())

            tumor_class = TUMOR_LABELS[pred_idx]
            confidence = float(probs[pred_idx].item())
            all_probs = {
                label: round(float(probs[i].item()), 4)
                for i, label in enumerate(TUMOR_LABELS)
            }

            return {
                "tumor_class": tumor_class,
                "confidence": round(confidence, 4),
                "all_probabilities": all_probs,
                "tumor_description": TUMOR_DESCRIPTIONS[desc_lang].get(tumor_class, ""),
                "severity": TUMOR_SEVERITY.get(tumor_class, "moderate"),
                "model_available": True,
            }

        except Exception as e:
            logger.error(f"BrainMriService.predict error: {e}")
            raise

    @staticmethod
    def _unavailable_response(desc_lang: str = "en") -> Dict[str, Any]:
        unavailable_msg = {
            "en": "Model unavailable. Please ensure the model file is installed.",
            "ar": "النموذج غير متاح. يرجى التأكد من تثبيت ملف النموذج.",
            "tr": "Model kullanılamıyor. Lütfen model dosyasının kurulu olduğundan emin olun.",
        }
        return {
            "tumor_class": "unavailable",
            "confidence": None,
            "all_probabilities": {label: None for label in TUMOR_LABELS},
            "tumor_description": unavailable_msg.get(desc_lang, unavailable_msg["en"]),
            "severity": "unknown",
            "model_available": False,
        }
