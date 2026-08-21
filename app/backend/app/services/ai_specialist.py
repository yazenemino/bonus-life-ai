"""AI Diabetes Specialist – Groq primary, Gemini secondary fallback.

Authors: Muhammed Jalahej, Yazen Emino
"""

import asyncio
import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from groq import Groq

from app.services import gemini_service

logger = logging.getLogger(__name__)

# llama-3.1-8b-instant is no longer served on this Groq account (every call 404s
# "model does not exist") — confirmed live against GET /openai/v1/models, which does
# not list it or any other llama-3.x model for this key. openai/gpt-oss-20b is
# confirmed available and is the same default already used by app.services.diet for
# the same reason. LLM_MODEL_NAME in the environment still wins when set — this is
# only the fallback used when it's absent, so it also needs updating directly in
# Railway's environment variables (not sourced from this repo's gitignored .env) for
# a production fix to actually take effect.
DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"
# Groq is either fast (a couple seconds) or fails fast (404/invalid model) — this is a
# ceiling against a genuine network stall, not the expected latency. The frontend's own
# fetch has a hard 30s AbortController (ChatBot.jsx); Groq (10s) + Gemini fallback (18s)
# below leaves a ~2s buffer under that even in the worst case where both time out.
GROQ_CHAT_TIMEOUT_S = 10.0

GREETING_WORDS = {
    "arabic": ["مرحبا", "مرحباً", "أهلا", "أهلاً", "السلام عليكم", "صباح الخير", "مساء الخير", "هلا", "اهلين"],
    "turkish": ["merhaba", "selam", "günaydın", "iyi günler", "iyi akşamlar"],
    "english": ["hi", "hello", "hey", "good morning", "good evening", "good afternoon"],
}

GREETING_REPLY = {
    "arabic": "أهلاً بك! أنا مساعدك الذكي لمرض السكري. كيف يمكنني مساعدتك اليوم؟",
    "turkish": "Merhaba! Ben diyabet konusunda yapay zeka asistanınızım. Bugün size nasıl yardımcı olabilirim?",
    "english": "Hello! I'm your AI diabetes assistant. How can I help you today?",
}

# Injected into every medical system prompt. Overrides normal analysis when the user
# describes symptoms that could be life-threatening: no medication suggestions, no
# home remedies (the model previously hallucinated recommending Ibuprofen for a
# described heart attack) — just an immediate, unambiguous instruction to call
# emergency services.
EMERGENCY_PROTOCOL = {
    "arabic": (
        "بروتوكول الطوارئ (أولوية قصوى): إذا وصف المستخدم أعراضاً قد تهدد الحياة "
        "(مثل ألم شديد أو ضاغط في الصدر، صعوبة شديدة في التنفس، علامات سكتة دماغية، "
        "نزيف حاد، فقدان الوعي، أو أفكار إيذاء النفس)، يجب عليك التوقف فوراً عن أي تحليل "
        "أو نصيحة إضافية، وعدم اقتراح أو ذكر اسم أي دواء أو علاج منزلي مهما كان، وإخبار "
        "المستخدم بوضوح وفوراً بالاتصال بخدمات الطوارئ (911 أو 112) أو التوجه إلى أقرب "
        "قسم طوارئ الآن."
    ),
    "turkish": (
        "ACİL DURUM PROTOKOLÜ (en yüksek öncelik): Kullanıcı hayatı tehdit edebilecek "
        "belirtiler tarif ederse (örn. şiddetli/baskı hissi veren göğüs ağrısı, ciddi nefes "
        "darlığı, inme belirtileri, ağır kanama, bilinç kaybı veya kendine zarar verme "
        "düşünceleri), analiz veya tavsiye vermeyi HEMEN durdurmalısın, herhangi bir ilaç "
        "veya ev çaresi önermemeli ya da adını anmamalısın ve kullanıcıya hemen acil "
        "servisleri (112) araması veya en yakın acil servise gitmesi gerektiğini açıkça "
        "söylemelisin."
    ),
    "english": (
        "EMERGENCY PROTOCOL (highest priority): If the user describes potentially "
        "life-threatening symptoms (e.g. severe or crushing chest pain, serious "
        "difficulty breathing, signs of stroke, heavy bleeding, loss of consciousness, "
        "or self-harm intent), you MUST immediately stop any further analysis or advice, "
        "NOT suggest or name any medication or home remedy under any circumstances, and "
        "clearly tell them to call emergency services (911/112) or go to the nearest "
        "emergency room right now."
    ),
}


def _emergency_protocol_for(language: str) -> str:
    return EMERGENCY_PROTOCOL.get(language, EMERGENCY_PROTOCOL["english"])


def _is_greeting(message: str, language: str) -> bool:
    text = (message or "").strip().lower()
    if not text or len(text) > 40:
        return False
    words = GREETING_WORDS.get(language, []) + GREETING_WORDS["english"] + GREETING_WORDS["arabic"] + GREETING_WORDS["turkish"]
    return any(text == w or text.startswith(w) for w in words)


GEMINI_FALLBACK_TIMEOUT_S = 18.0  # measured live: a real chat reply took ~13s; 10s was cutting off working responses


async def _try_gemini(messages: List[Dict[str, str]]) -> Optional[str]:
    """Best-effort secondary provider. Returns None if Gemini isn't configured or fails.

    Bounded with a timeout: neither the Groq SDK call above nor this one had any
    explicit timeout, so a provider that stalls instead of erroring quickly could
    block the request for a very long time with nothing surfaced to the user except
    a spinner that never resolves — this is what was actually behind reports of chat
    "hanging" (there is no streaming/SSE anywhere in this pipeline for a format
    mismatch to break; both the primary and fallback paths already return the same
    plain JSON shape, and the frontend does a single res.json() parse either way).
    """
    if not gemini_service.is_available():
        return None
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(gemini_service.generate_chat, messages), timeout=GEMINI_FALLBACK_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        logger.warning("Gemini fallback timed out after %.0fs", GEMINI_FALLBACK_TIMEOUT_S)
        return None
    except Exception as e:
        logger.warning("Gemini fallback failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# AIDiabetesSpecialist  (used by chat, assessment, user-profile endpoints)
# ---------------------------------------------------------------------------
class AIDiabetesSpecialist:
    def __init__(self):
        self.client = None
        self.conversation_memory: Dict[str, list] = {}
        self.user_profiles: Dict[str, dict] = {}
        self.initialize_llm()

    def initialize_llm(self):
        try:
            groq_api_key = os.getenv("GROQ_API_KEY")
            if groq_api_key and groq_api_key.startswith("gsk_"):
                self.client = Groq(api_key=groq_api_key)
                model_name = os.getenv("LLM_MODEL_NAME", DEFAULT_GROQ_MODEL)
                logger.info("[START] AI Diabetes Specialist LLM initialized with Groq model: %s", model_name)
                return
        except Exception as e:
            logger.error("[ERROR] Failed to initialize Groq LLM: %s", e)
            self.client = None
        if not self.client:
            logger.error("[ERROR] Invalid or missing Groq API key")

    # -- prompt -----------------------------------------------------------
    # Domain configs let generate_medical_response() serve non-diabetes callers
    # (e.g. Brain MRI) without leaking the diabetes-specialist framing into their
    # system prompt. "diabetes" remains the default so existing callers (chat,
    # assessment) are unaffected.
    _DOMAIN_CONFIG = {
        "diabetes": {
            "role": "an expert diabetes specialist and health advisor",
            "scope": "diabetes prevention, management, and treatment",
            "greeting_invite": "diabetes-related",
            "requirements": (
                "1. Provide medically accurate information about diabetes\n"
                "2. Focus on prevention strategies and healthy lifestyle\n"
                "3. Be specific and practical in recommendations\n"
                "4. Use clear, understandable language\n"
                "5. Include both immediate actions and long-term strategies\n"
                "6. When discussing diet, consider cultural context and local foods\n"
                "7. Always recommend consulting healthcare professionals for personal medical advice\n"
            ),
        },
        "brain_mri": {
            "role": "an expert neurology and neuroradiology advisor",
            "scope": "brain MRI tumor screening results and neurological next steps",
            "greeting_invite": "brain MRI-related",
            "requirements": (
                "1. Provide a medically accurate interpretation of the brain MRI classification result\n"
                "2. Focus strictly on the neurological / neuro-oncological findings — do NOT mention "
                "diabetes, cardiology, kidney disease, diet, or any unrelated condition\n"
                "3. Be specific and practical about recommended next steps (e.g. specialist referral, "
                "follow-up imaging)\n"
                "4. Use clear, understandable language\n"
                "5. Include both immediate actions and what to expect going forward\n"
                "6. Always recommend consulting a neurologist or radiologist for a definitive diagnosis\n"
            ),
        },
        "heart": {
            "role": "an expert cardiology advisor",
            "scope": "heart disease risk, cardiovascular health, and next steps",
            "greeting_invite": "heart health-related",
            "requirements": (
                "1. Provide a medically accurate interpretation of the cardiovascular risk result\n"
                "2. Focus strictly on cardiology — do NOT mention diabetes, kidney disease, brain/neurological "
                "conditions, or any unrelated condition\n"
                "3. Be specific and practical about recommended next steps (e.g. cardiologist referral, "
                "lifestyle changes, follow-up tests)\n"
                "4. Use clear, understandable language\n"
                "5. Include both immediate actions and long-term strategies\n"
                "6. Always recommend consulting a cardiologist for a definitive diagnosis\n"
            ),
        },
        "kidney": {
            "role": "an expert nephrology advisor",
            "scope": "chronic kidney disease (CKD) risk and next steps",
            "greeting_invite": "kidney health-related",
            "requirements": (
                "1. Provide a medically accurate interpretation of the kidney disease risk result\n"
                "2. Focus strictly on nephrology / kidney health — do NOT mention diabetes, cardiology, "
                "brain/neurological conditions, or any unrelated condition\n"
                "3. Be specific and practical about recommended next steps (e.g. nephrologist referral, "
                "follow-up labs, lifestyle changes)\n"
                "4. Use clear, understandable language\n"
                "5. Include both immediate actions and long-term strategies\n"
                "6. Always recommend consulting a nephrologist for a definitive diagnosis\n"
            ),
        },
    }

    def create_medical_prompt(self, message: str, language: str, user_context: Dict = None, domain: str = "diabetes") -> str:
        cfg = self._DOMAIN_CONFIG.get(domain, self._DOMAIN_CONFIG["diabetes"])
        lang_directive = {
            "arabic": "Respond ONLY in Arabic (فصحى بسيطة وواضحة), regardless of the language of the question.",
            "turkish": "Respond ONLY in Turkish, regardless of the language of the question.",
        }.get(language, "Respond in English.")
        prompt = (
            f"You are Bonus Life AI, {cfg['role']}. "
            f"Provide accurate, helpful medical information about {cfg['scope']}.\n\n"
            f'USER QUESTION: "{message}"\n'
            f"LANGUAGE: {language}. {lang_directive}\n\n"
            "If the user's message is just a greeting (e.g. hi, hello, مرحبا, merhaba) and not a health "
            f"question, reply with a short, friendly greeting and invite them to ask a {cfg['greeting_invite']} "
            "question. Do NOT dump medical information (e.g. symptom lists) unless it was actually asked for.\n\n"
            "If the user's question is on a different health topic than your specialty above, do NOT open "
            "with an apology or refusal — just answer helpfully to the best of your general medical knowledge, "
            "and only mention your specialty in passing if it's genuinely relevant.\n\n"
            f"{_emergency_protocol_for(language)}\n\n"
            "RESPONSE REQUIREMENTS:\n"
            f"{cfg['requirements']}\n"
            "FORMAT:\n"
            "- Start with a clear, empathetic response to the question\n"
            "- Provide structured, actionable advice\n"
            "- Use emojis sparingly for readability\n"
            "- End with encouragement and next steps\n\n"
            "IMPORTANT: Always emphasize that you are an AI assistant and users should consult "
            "healthcare providers for personal medical advice.\n"
        )
        return prompt

    # -- generate ---------------------------------------------------------
    async def generate_medical_response(self, message: str, language: str = "english", user_id: str = "default", domain: str = "diabetes") -> Dict[str, Any]:
        user_profile = self.get_user_profile(user_id)
        system_prompt = self.create_medical_prompt(message, language, user_profile.get("user_context", {}), domain=domain)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ]
        history = self.get_conversation_history(user_id)
        for msg in history[-3:]:
            messages.insert(1, {"role": msg["role"], "content": msg["content"]})

        try:
            if not self.client:
                raise RuntimeError("Groq client not configured")

            model_name = os.getenv("LLM_MODEL_NAME", DEFAULT_GROQ_MODEL)
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.client.chat.completions.create,
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1500,
                ),
                timeout=GROQ_CHAT_TIMEOUT_S,
            )
            llm_response = response.choices[0].message.content

            self.add_to_conversation(user_id, "user", message)
            self.add_to_conversation(user_id, "assistant", llm_response)
            self.update_user_profile(user_id, message, llm_response)

            return {"success": True, "response": llm_response, "model": model_name}
        except Exception as e:
            logger.warning("Groq chat generation failed (%s); trying Gemini fallback.", e)
            gemini_response = await _try_gemini(messages)
            if gemini_response:
                self.add_to_conversation(user_id, "user", message)
                self.add_to_conversation(user_id, "assistant", gemini_response)
                self.update_user_profile(user_id, message, gemini_response)
                return {"success": True, "response": gemini_response, "model": "gemini-fallback"}

            logger.exception("LLM generation error (chat/assessment): %s", e)
            err_msg = str(e)
            is_dev = os.getenv("ENVIRONMENT", "").lower() == "development" or os.getenv("DEBUG", "").lower() in ("true", "1", "yes")
            extra = {"error_detail": err_msg} if is_dev else {}
            unavailable_text = {
                "arabic": "عذراً، مساعدنا الذكي غير متوفر حالياً. يرجى المحاولة لاحقاً أو استشارة أخصائي رعاية صحية للحالات الطارئة.",
                "turkish": "Üzgünüz, yapay zeka uzmanımız şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin veya acil tıbbi konularda bir sağlık kuruluşuna başvurun.",
                "english": "I apologize, but our AI specialist is currently unavailable. Please try again later or consult with a healthcare provider for immediate medical advice.",
            }
            return {
                "success": False,
                "response": unavailable_text.get(language, unavailable_text["english"]),
                "model": "unavailable",
                **extra,
            }

    # -- user profiles ----------------------------------------------------
    def get_user_profile(self, user_id: str) -> Dict[str, Any]:
        if user_id not in self.user_profiles:
            self.user_profiles[user_id] = {
                "user_id": user_id,
                "created_at": datetime.utcnow(),
                "last_activity": datetime.utcnow(),
                "preferred_language": "english",
                "conversation_count": 0,
                "topics_discussed": [],
                "user_context": {},
            }
        return self.user_profiles[user_id]

    def update_user_profile(self, user_id: str, message: str, response: str):
        profile = self.get_user_profile(user_id)
        profile["last_activity"] = datetime.utcnow()
        profile["conversation_count"] += 1
        msg_lower = message.lower()
        topic_kw = {
            "nutrition": ["chakula", "kula", "diet", "food", "meal"],
            "exercise": ["mazoezi", "exercise", "activity", "workout"],
            "prevention": ["kuzuia", "prevent", "risk", "hatari"],
            "treatment": ["dawa", "medicine", "treatment", "tibabu"],
        }
        for topic, kws in topic_kw.items():
            if any(w in msg_lower for w in kws) and topic not in profile["topics_discussed"]:
                profile["topics_discussed"].append(topic)

    # -- conversation memory ----------------------------------------------
    def get_conversation_history(self, user_id: str, max_messages: int = 6) -> List[Dict]:
        if user_id in self.conversation_memory:
            return self.conversation_memory[user_id][-max_messages:]
        return []

    def add_to_conversation(self, user_id: str, role: str, content: str):
        if user_id not in self.conversation_memory:
            self.conversation_memory[user_id] = []
        self.conversation_memory[user_id].append(
            {"role": role, "content": content, "timestamp": datetime.utcnow().isoformat()}
        )
        if len(self.conversation_memory[user_id]) > 20:
            self.conversation_memory[user_id] = self.conversation_memory[user_id][-20:]


# ---------------------------------------------------------------------------
# GPTOSSDiabetesSpecialist  (used by voice-chat endpoints)
# ---------------------------------------------------------------------------
class GPTOSSDiabetesSpecialist:
    def __init__(self):
        self.client = None
        self.conversation_memory: Dict[str, list] = {}
        self.initialize_groq_client()

    def initialize_groq_client(self):
        try:
            groq_api_key = os.getenv("GROQ_API_KEY")
            if not groq_api_key:
                logger.error("[ERROR] GROQ_API_KEY not found")
                self.client = None
                return
            if not groq_api_key.startswith("gsk_"):
                logger.error("[ERROR] Invalid Groq API key format")
                self.client = None
                return
            self.client = Groq(api_key=groq_api_key)
            model_name = os.getenv("LLM_MODEL_NAME", DEFAULT_GROQ_MODEL)
            test_response = self.client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": "Say 'GPT-OSS-20B Diabetes Specialist Ready'"}],
                max_tokens=20,
                temperature=0.1,
            )
            logger.info(f"[OK] GPT-OSS-20B test: {test_response.choices[0].message.content}")
        except Exception as e:
            logger.warning(f"[WARN] GPT-OSS-20B init failed (non-fatal): {e}")
            self.client = None

    def create_diabetes_prompt(self, message: str, language: str, context: Dict = None) -> List[Dict]:
        context = context or {}
        is_voice = context.get("is_voice", False)
        assessment_context = context.get("assessment_context")
        voice_instructions = ""
        if is_voice:
            if language == "turkish":
                voice_instructions = (
                    " SESLİ MOD: Yanıtları kısa ve net tut; basit sorularda 2-4 cümle yeter. "
                    "Selamlama (merhaba, günaydın vb.) ise kısa karşılık ver ve bir sağlık sorusu sor. "
                    "Belirsiz veya çok kısa mesajlarda bağlamı kullan veya kısa bir netleştirme sorusu sor."
                )
            elif language == "arabic":
                voice_instructions = (
                    " وضع الصوت: اجعل الإجابات قصيرة وواضحة؛ للأسئلة البسيطة، يكفي 2-4 جمل. "
                    "للتحيات (مرحباً، صباح الخير)، قدم رداً ودياً قصيراً واسأل سؤالاً صحياً. "
                    "إذا كانت الرسالة غير واضحة، استخدم سياق المحادثة أو اطرح سؤالاً توضيحياً واحداً قصيراً."
                )
            else:
                voice_instructions = (
                    " VOICE MODE: Keep replies concise; use short sentences. For simple questions, 2-4 sentences. "
                    "For greetings (hi, hello), give a brief friendly reply and invite a health question. "
                    "If the message is vague or unclear, use conversation context or ask one short clarifying question."
                )
        assessment_block = ""
        if assessment_context:
            risk = assessment_context.get("risk_level", "unknown")
            prob = assessment_context.get("probability")
            summary = (assessment_context.get("executive_summary") or "").strip()
            date_str = assessment_context.get("created_at") or ""
            summary_part = ""
            if summary:
                if language == "turkish":
                    summary_part = f" Özet: {summary[:400]}{'...' if len(summary) > 400 else ''}."
                elif language == "arabic":
                    summary_part = f" ملخص: {summary[:400]}{'...' if len(summary) > 400 else ''}."
                else:
                    summary_part = f" Summary: {summary[:400]}{'...' if len(summary) > 400 else ''}."
            if language == "turkish":
                prob_str = f", olasılık %{int(prob * 100)}" if prob is not None else ""
                assessment_block = (
                    "\n\nÖNEMLİ: Bu kullanıcının son diyabet risk değerlendirmesine SAHİPSİN. "
                    "Değerlendirme, sonuç veya risk sorduğunda AŞAĞIDAKİ VERİYİ KULLANARAK cevap ver. "
                    "'Erişimim yok' veya 'bilgi saklamıyorum' deme.\n"
                    f"Son değerlendirme: risk düzeyi = {risk}{prob_str}.{summary_part} Tarih: {date_str}."
                )
            elif language == "arabic":
                prob_str = f", الاحتمالية {int(prob * 100)}%" if prob is not None else ""
                assessment_block = (
                    "\n\nهام: لديك إمكانية الوصول إلى آخر تقييم لمخاطر السكري الخاص بهذا المستخدم. "
                    "عندما يسألون عن تقييمهم أو نتائجهم أو مخاطرهم، أجب باستخدام البيانات أدناه. "
                    "لا تقل أنه ليس لديك إمكانية الوصول أو لا تحتفظ بالمعلومات.\n"
                    f"التقييم الأخير: مستوى الخطر = {risk}{prob_str}.{summary_part} التاريخ: {date_str}."
                )
            else:
                prob_str = f", probability {prob:.0%}" if prob is not None else ""
                assessment_block = (
                    "\n\nIMPORTANT: You HAVE access to this user's last diabetes risk assessment. "
                    "When they ask about their assessment, results, or risk, ANSWER using the data below. "
                    "Do NOT say you do not have access or do not retain information.\n"
                    f"Last assessment: risk level = {risk}{prob_str}.{summary_part} Date: {date_str}."
                )
        elif context.get("user_has_no_assessment"):
            if language == "turkish":
                assessment_block = "\n\nBu kullanıcının kayıtlı değerlendirmesi yok. Değerlendirme sorarsa Assessment bölümünden bir değerlendirme yapmasını öner."
            elif language == "arabic":
                assessment_block = "\n\nليس لدى هذا المستخدم تقييم مسجل. إذا سأل عن تقييمه، اقترح عليه إكمال واحد في قسم التقييم."
            else:
                assessment_block = "\n\nThe user has no stored assessment on file. If they ask about their assessment, suggest they complete one in the Assessment section."
        if language == "turkish":
            system_content = (
                "Sen Bonus Life AI'ın genel sağlık konularında uzman yapay zeka asistanısın. "
                "Kullanıcının diyabeti olduğunu varsaymadan, sorduğu her sağlık konusuna (kalp, beslenme, "
                "uyku, zihinsel sağlık, genel tıbbi sorular dahil) yardımcı ol. "
                "Tüm yanıtlarını Türkçe, tıbben doğru ve anlaşılır biçimde ver. "
                "Önemli: Yanıtlarında bir yapay zeka asistanı olduğunu belirt.\n\n"
                + _emergency_protocol_for(language)
                + voice_instructions
                + assessment_block
            )
        elif language == "arabic":
            system_content = (
                "أنت Bonus Life AI، مساعد ذكاء اصطناعي عام في المجال الصحي. "
                "لا تفترض أن المستخدم مصاب بالسكري — ساعده في أي موضوع صحي يسأل عنه (القلب، التغذية، "
                "النوم، الصحة النفسية، أو أي سؤال طبي عام). "
                "قدم معلومات دقيقة طبياً ومبنية على الأدلة باللغة العربية. "
                "قدم نصائح عملية ومحددة. "
                "اذكر دائماً أنك مساعد ذكاء اصطناعي.\n\n"
                + _emergency_protocol_for(language)
                + voice_instructions
                + assessment_block
            )
        else:
            system_content = (
                "You are Bonus Life AI, a general medical assistant. "
                "Do not assume the user has diabetes — help with whatever health topic they ask about "
                "(heart health, nutrition, sleep, mental health, or any general medical question). "
                "Provide medically accurate, evidence-based information. "
                "Give specific, actionable advice. "
                "Always state that you are an AI assistant.\n\n"
                + _emergency_protocol_for(language)
                + voice_instructions
                + assessment_block
            )
        messages = [{"role": "system", "content": system_content}]
        if context and "user_id" in context:
            history = self.get_conversation_history(context["user_id"])
            for msg in history[-6:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})
        return messages

    async def generate_diabetes_response(
        self,
        message: str,
        language: str = "english",
        user_id: str = "default",
        is_voice: bool = False,
        assessment_context: Optional[Dict] = None,
        user_has_no_assessment: bool = False,
    ) -> Dict[str, Any]:
        self.add_to_conversation(user_id, "user", message)
        ctx = {"user_id": user_id, "is_voice": is_voice, "user_has_no_assessment": user_has_no_assessment}
        if assessment_context:
            ctx["assessment_context"] = assessment_context
        msgs = self.create_diabetes_prompt(message, language, ctx)

        if self.client:
            try:
                model_name = os.getenv("LLM_MODEL_NAME", DEFAULT_GROQ_MODEL)
                temperature = float(os.getenv("LLM_TEMPERATURE", 0.6))
                max_tokens = 800 if is_voice else 1500
                # This was a bare synchronous SDK call inside an async def — it blocked
                # FastAPI's whole event loop (every other in-flight request, not just
                # this one) for as long as Groq took to respond, with no timeout at all.
                # asyncio.to_thread offloads it; wait_for bounds it.
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.chat.completions.create,
                        model=model_name, messages=msgs, temperature=temperature, max_tokens=max_tokens,
                    ),
                    timeout=GROQ_CHAT_TIMEOUT_S,
                )
                llm_resp = response.choices[0].message.content
                self.add_to_conversation(user_id, "assistant", llm_resp)
                return {"success": True, "response": llm_resp, "model": model_name, "status": "success"}
            except Exception as e:
                logger.error(f"GPT-OSS-20B call failed: {e}")

        gemini_resp = await _try_gemini(msgs)
        if gemini_resp:
            self.add_to_conversation(user_id, "assistant", gemini_resp)
            return {"success": True, "response": gemini_resp, "model": "gemini-fallback", "status": "success"}

        fb = self._get_enhanced_fallback(message, language)
        self.add_to_conversation(user_id, "assistant", fb)
        return {"success": False, "response": fb, "model": "enhanced_fallback", "status": "fallback"}

    def _get_enhanced_fallback(self, message: str, language: str) -> str:
        """Last-resort static reply when both Groq and Gemini are unavailable."""
        if _is_greeting(message, language):
            return GREETING_REPLY.get(language, GREETING_REPLY["english"])
        if language == "turkish":
            return (
                "**Yapay Zeka Diyabet Asistanı**\n\n"
                "Tip 2 diyabetin yaygın belirtileri:\n"
                "- Aşırı susama ve sık idrara çıkma\n"
                "- Aşırı açlık ve nedensiz kilo kaybı\n"
                "- Yorgunluk ve bulanık görme\n\n"
                "Kesin tanı ve tedavi için lütfen bir sağlık kuruluşuna başvurun."
            )
        elif language == "arabic":
            return (
                "**مساعد الذكاء الاصطناعي لمرض السكري**\n\n"
                "الأعراض الشائعة لمرض السكري من النوع 2:\n"
                "- العطش الشديد وكثرة التبول\n"
                "- الجوع الشديد وفقدان الوزن غير المبرر\n"
                "- التعب وتشوش الرؤية\n\n"
                "يرجى استشارة أخصائي رعاية صحية للحصول على نصيحة طبية دقيقة."
            )
        return (
            "**AI Diabetes Specialist**\n\n"
            "Common symptoms of Type 2 Diabetes:\n"
            "- Increased thirst and frequent urination\n"
            "- Extreme hunger and fatigue\n"
            "- Blurred vision and slow-healing sores\n\n"
            "Please consult a healthcare provider for personalized advice."
        )

    def get_conversation_history(self, user_id: str) -> List[Dict]:
        return [{"role": m["role"], "content": m["content"]} for m in self.conversation_memory.get(user_id, [])]

    def add_to_conversation(self, user_id: str, role: str, content: str):
        if user_id not in self.conversation_memory:
            self.conversation_memory[user_id] = []
        self.conversation_memory[user_id].append(
            {"role": role, "content": content, "timestamp": datetime.utcnow().isoformat()}
        )
        if len(self.conversation_memory[user_id]) > 10:
            self.conversation_memory[user_id] = self.conversation_memory[user_id][-10:]
