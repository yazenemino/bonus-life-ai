"""ML-based symptom checker: predicts top-k condition groups and returns example disease names."""

import os
import logging
import pickle
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Absolute path to Symptom.pkl so it works regardless of server cwd
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_MODEL_PATH = str(_BACKEND_ROOT / "data" / "Symptom.pkl")
CSV_PATH = str(_BACKEND_ROOT / "data" / "disease_symptom_dataset.csv")
MAX_EXAMPLE_DISEASES = 8

FEATURE_NAMES = [
    "Fever", "Cough", "Fatigue", "Difficulty Breathing",
    "Age", "Gender", "Blood Pressure", "Cholesterol Level",
]

# Fallback when CSV/import fails: show at least these example diseases per group
FALLBACK_GROUP_DISEASES = {
    "Respiratory": ["Influenza", "Asthma", "Common Cold", "Bronchitis", "Pneumonia", "Sinusitis"],
    "Infectious": ["Dengue Fever", "Malaria", "Hepatitis", "Tuberculosis", "Chickenpox", "Lyme Disease"],
    "Cardiovascular": ["Stroke", "Hypertension", "Coronary Artery Disease"],
    "Metabolic & Endocrine": ["Diabetes", "Hyperthyroidism", "Hypothyroidism"],
    "Gastrointestinal": ["Gastroenteritis", "Pancreatitis", "Ulcerative Colitis", "Crohn's Disease", "Cirrhosis"],
    "Cancer": ["Liver Cancer", "Kidney Cancer", "Lung Cancer", "Breast Cancer", "Colorectal Cancer"],
    "Neurological": ["Migraine", "Epilepsy", "Multiple Sclerosis", "Parkinson's Disease", "Alzheimer's Disease"],
    "Mental Health": ["Depression", "Anxiety Disorders", "Bipolar Disorder"],
    "Musculoskeletal": ["Rheumatoid Arthritis", "Osteoarthritis", "Osteoporosis", "Fibromyalgia"],
    "Skin & Eye": ["Eczema", "Psoriasis", "Acne", "Conjunctivitis", "Cataracts", "Glaucoma"],
    "Urological & Kidney": ["Urinary Tract Infection", "Kidney Disease", "Chronic Kidney Disease"],
    "Blood & Genetic": ["Anemia", "Hemophilia", "Sickle Cell Anemia", "Down Syndrome"],
    "Allergy & Immune": ["Allergic Rhinitis", "Systemic Lupus"],
    "Other": ["Endometriosis", "Fibromyalgia"],
}

# Localized group labels. The trained model can only emit the 6 classes it was fit on
# (Respiratory, Cardiovascular, Metabolic & Endocrine, Gastrointestinal, Infectious, Other);
# the rest are translated too so the CSV-backed grouping path (_load_group_to_diseases)
# stays correct if it's ever re-enabled.
GROUP_LABEL_TRANSLATIONS = {
    "ar": {
        "Respiratory": "أمراض الجهاز التنفسي",
        "Infectious": "أمراض معدية",
        "Cardiovascular": "أمراض القلب والأوعية الدموية",
        "Metabolic & Endocrine": "أمراض الغدد الصماء والتمثيل الغذائي",
        "Gastrointestinal": "أمراض الجهاز الهضمي",
        "Cancer": "أمراض سرطانية",
        "Neurological": "أمراض عصبية",
        "Mental Health": "أمراض الصحة النفسية",
        "Musculoskeletal": "أمراض العظام والعضلات",
        "Skin & Eye": "أمراض الجلد والعين",
        "Urological & Kidney": "أمراض المسالك البولية والكلى",
        "Blood & Genetic": "أمراض الدم والأمراض الوراثية",
        "Allergy & Immune": "أمراض الحساسية والمناعة",
        "Other": "أخرى",
    },
    "tr": {
        "Respiratory": "Solunum Sistemi Hastalıkları",
        "Infectious": "Bulaşıcı Hastalıklar",
        "Cardiovascular": "Kalp ve Damar Hastalıkları",
        "Metabolic & Endocrine": "Metabolik ve Endokrin Hastalıklar",
        "Gastrointestinal": "Sindirim Sistemi Hastalıkları",
        "Cancer": "Kanser",
        "Neurological": "Nörolojik Hastalıklar",
        "Mental Health": "Ruh Sağlığı",
        "Musculoskeletal": "Kas ve İskelet Sistemi Hastalıkları",
        "Skin & Eye": "Cilt ve Göz Hastalıkları",
        "Urological & Kidney": "Ürolojik ve Böbrek Hastalıkları",
        "Blood & Genetic": "Kan ve Genetik Hastalıklar",
        "Allergy & Immune": "Alerji ve Bağışıklık Hastalıkları",
        "Other": "Diğer",
    },
}

# Localized names for every disease that can appear in FALLBACK_GROUP_DISEASES (and thus
# in a live API response, since the CSV-backed grouping path is currently unreachable —
# see _load_group_to_diseases).
DISEASE_TRANSLATIONS = {
    "ar": {
        "Influenza": "الإنفلونزا", "Asthma": "الربو", "Common Cold": "الزكام",
        "Bronchitis": "التهاب الشعب الهوائية", "Pneumonia": "الالتهاب الرئوي", "Sinusitis": "التهاب الجيوب الأنفية",
        "Dengue Fever": "حمى الضنك", "Malaria": "الملاريا", "Hepatitis": "التهاب الكبد",
        "Tuberculosis": "السل", "Chickenpox": "جدري الماء", "Lyme Disease": "داء لايم",
        "Stroke": "السكتة الدماغية", "Hypertension": "ارتفاع ضغط الدم", "Coronary Artery Disease": "مرض الشريان التاجي",
        "Diabetes": "داء السكري", "Hyperthyroidism": "فرط نشاط الغدة الدرقية", "Hypothyroidism": "قصور الغدة الدرقية",
        "Gastroenteritis": "التهاب المعدة والأمعاء", "Pancreatitis": "التهاب البنكرياس",
        "Ulcerative Colitis": "التهاب القولون التقرحي", "Crohn's Disease": "مرض كرون", "Cirrhosis": "تليف الكبد",
        "Liver Cancer": "سرطان الكبد", "Kidney Cancer": "سرطان الكلى", "Lung Cancer": "سرطان الرئة",
        "Breast Cancer": "سرطان الثدي", "Colorectal Cancer": "سرطان القولون والمستقيم",
        "Migraine": "الصداع النصفي", "Epilepsy": "الصرع", "Multiple Sclerosis": "التصلب المتعدد",
        "Parkinson's Disease": "مرض باركنسون", "Alzheimer's Disease": "مرض ألزهايمر",
        "Depression": "الاكتئاب", "Anxiety Disorders": "اضطرابات القلق", "Bipolar Disorder": "الاضطراب ثنائي القطب",
        "Rheumatoid Arthritis": "التهاب المفاصل الروماتويدي", "Osteoarthritis": "خشونة المفاصل",
        "Osteoporosis": "هشاشة العظام", "Fibromyalgia": "الألم العضلي الليفي",
        "Eczema": "الأكزيما", "Psoriasis": "الصدفية", "Acne": "حب الشباب",
        "Conjunctivitis": "التهاب الملتحمة", "Cataracts": "إعتام عدسة العين", "Glaucoma": "الجلوكوما (الماء الأزرق)",
        "Urinary Tract Infection": "التهاب المسالك البولية", "Kidney Disease": "مرض الكلى",
        "Chronic Kidney Disease": "مرض الكلى المزمن",
        "Anemia": "فقر الدم", "Hemophilia": "الهيموفيليا (الناعور)", "Sickle Cell Anemia": "فقر الدم المنجلي",
        "Down Syndrome": "متلازمة داون",
        "Allergic Rhinitis": "التهاب الأنف التحسسي", "Systemic Lupus": "الذئبة الحمامية الجهازية",
        "Endometriosis": "بطانة الرحم المهاجرة",
    },
    "tr": {
        "Influenza": "Grip", "Asthma": "Astım", "Common Cold": "Nezle",
        "Bronchitis": "Bronşit", "Pneumonia": "Zatürre", "Sinusitis": "Sinüzit",
        "Dengue Fever": "Dang Humması", "Malaria": "Sıtma", "Hepatitis": "Hepatit",
        "Tuberculosis": "Tüberküloz (Verem)", "Chickenpox": "Suçiçeği", "Lyme Disease": "Lyme Hastalığı",
        "Stroke": "İnme", "Hypertension": "Hipertansiyon", "Coronary Artery Disease": "Koroner Arter Hastalığı",
        "Diabetes": "Diyabet", "Hyperthyroidism": "Hipertiroidizm", "Hypothyroidism": "Hipotiroidizm",
        "Gastroenteritis": "Gastroenterit", "Pancreatitis": "Pankreatit",
        "Ulcerative Colitis": "Ülseratif Kolit", "Crohn's Disease": "Crohn Hastalığı", "Cirrhosis": "Siroz",
        "Liver Cancer": "Karaciğer Kanseri", "Kidney Cancer": "Böbrek Kanseri", "Lung Cancer": "Akciğer Kanseri",
        "Breast Cancer": "Meme Kanseri", "Colorectal Cancer": "Kolorektal Kanser",
        "Migraine": "Migren", "Epilepsy": "Epilepsi", "Multiple Sclerosis": "Multipl Skleroz",
        "Parkinson's Disease": "Parkinson Hastalığı", "Alzheimer's Disease": "Alzheimer Hastalığı",
        "Depression": "Depresyon", "Anxiety Disorders": "Anksiyete Bozuklukları", "Bipolar Disorder": "Bipolar Bozukluk",
        "Rheumatoid Arthritis": "Romatoid Artrit", "Osteoarthritis": "Osteoartrit",
        "Osteoporosis": "Osteoporoz", "Fibromyalgia": "Fibromiyalji",
        "Eczema": "Egzama", "Psoriasis": "Sedef Hastalığı", "Acne": "Akne",
        "Conjunctivitis": "Konjonktivit", "Cataracts": "Katarakt", "Glaucoma": "Glokom",
        "Urinary Tract Infection": "İdrar Yolu Enfeksiyonu", "Kidney Disease": "Böbrek Hastalığı",
        "Chronic Kidney Disease": "Kronik Böbrek Hastalığı",
        "Anemia": "Anemi", "Hemophilia": "Hemofili", "Sickle Cell Anemia": "Orak Hücre Anemisi",
        "Down Syndrome": "Down Sendromu",
        "Allergic Rhinitis": "Alerjik Rinit", "Systemic Lupus": "Sistemik Lupus",
        "Endometriosis": "Endometriozis",
    },
}


def _lang_code(language: str) -> str:
    lang = (language or "english").lower()
    if "arabic" in lang or lang == "ar":
        return "ar"
    if "turkish" in lang or lang == "tr":
        return "tr"
    return "en"


def _localize_group(group_name: str, lang_code: str) -> str:
    return GROUP_LABEL_TRANSLATIONS.get(lang_code, {}).get(group_name, group_name)


def _localize_diseases(diseases: List[str], lang_code: str) -> List[str]:
    table = DISEASE_TRANSLATIONS.get(lang_code, {})
    return [table.get(d, d) for d in diseases]


class SymptomCheckerService:
    """Load Symptom.pkl and predict top-k condition groups; attach example disease names per group."""

    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.getenv("SYMPTOM_MODEL_PATH", DEFAULT_MODEL_PATH)
        self._model_data = None
        self._group_to_diseases: Dict[str, List[str]] = {}

    def _load_group_to_diseases(self) -> None:
        """Build mapping group_name -> list of disease names from the dataset."""
        if self._group_to_diseases:
            return
        try:
            import sys
            import csv
            if str(_BACKEND_ROOT) not in sys.path:
                sys.path.insert(0, str(_BACKEND_ROOT))
            from scripts.disease_to_group import disease_to_group
            if not os.path.exists(CSV_PATH):
                return
            mapping: Dict[str, set] = {}
            with open(CSV_PATH, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    disease = str(row.get("Disease", "")).strip()
                    if not disease:
                        continue
                    group = disease_to_group.get(disease, "Other")
                    mapping.setdefault(group, set()).add(disease)
            self._group_to_diseases = {g: sorted(d) for g, d in mapping.items()}
        except Exception as e:
            logger.warning(f"Could not load group->diseases mapping: {e}")

    def _load(self) -> bool:
        if self._model_data is not None:
            return True
        try:
            if not os.path.exists(self.model_path):
                logger.warning(f"Symptom model not found at {self.model_path}")
                return False
            with open(self.model_path, "rb") as f:
                self._model_data = pickle.load(f)
            self._load_group_to_diseases()
            logger.info(f"Symptom checker model loaded from {self.model_path}")
            return True
        except Exception as e:
            logger.error(f"Symptom model load failed: {e}")
            return False

    def predict_top_k(
        self,
        fever: int,
        cough: int,
        fatigue: int,
        difficulty_breathing: int,
        age: float,
        gender: int,
        blood_pressure: int,
        cholesterol: int,
        top_k: int = 3,
        language: str = "english",
    ) -> List[Dict[str, Any]]:
        """Return list of {disease, probability} for top-k diseases."""
        if not self._load():
            return []
        import numpy as np

        lang_code = _lang_code(language)

        model = self._model_data["model"]
        le = self._model_data["label_encoder"]
        imputer = self._model_data.get("imputer")

        row = [
            fever, cough, fatigue, difficulty_breathing,
            age, gender, blood_pressure, cholesterol,
        ]
        X = np.array([row], dtype=np.float64)
        if imputer is not None:
            X = imputer.transform(X)

        if not hasattr(model, "predict_proba"):
            pred = model.predict(X)[0]
            group_name = le.inverse_transform([pred])[0]
            examples = (self._group_to_diseases.get(group_name) or FALLBACK_GROUP_DISEASES.get(group_name, []))[:MAX_EXAMPLE_DISEASES]
            if not examples:
                examples = [group_name]
            return [{
                "disease": _localize_group(group_name, lang_code),
                "probability": 1.0,
                "disease_examples": _localize_diseases(examples, lang_code),
            }]

        probs = model.predict_proba(X)[0]
        top_indices = probs.argsort()[-top_k:][::-1]
        out = []
        for i in top_indices:
            group_name = le.inverse_transform([i])[0]
            examples = (self._group_to_diseases.get(group_name) or FALLBACK_GROUP_DISEASES.get(group_name, []))[:MAX_EXAMPLE_DISEASES]
            if not examples:
                examples = [group_name]  # ensure frontend always has something to show
            out.append({
                "disease": _localize_group(group_name, lang_code),
                "probability": float(probs[i]),
                "disease_examples": _localize_diseases(examples, lang_code),
            })
        return out


# Singleton for use in routes
_symptom_checker: SymptomCheckerService = None


def get_symptom_checker() -> SymptomCheckerService:
    global _symptom_checker
    if _symptom_checker is None:
        _symptom_checker = SymptomCheckerService()
    return _symptom_checker
