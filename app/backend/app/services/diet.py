"""Diet plan generation – Groq only.

Authors: Muhammed Jalahej, Yazen Emino
"""

import os
import time
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Goal labels mirrored 1:1 from the frontend's goalOptions/goalDisplay (DietPlan.jsx) so the
# saved plan title always matches what the goal dropdown showed the user, in every language.
_GOAL_LABELS = {
    "diabetes_prevention": {"english": "Diabetes Prevention", "arabic": "الوقاية من السكري", "turkish": "Diyabet Önleme"},
    "blood_sugar_control": {"english": "Blood Sugar Control", "arabic": "التحكم في سكر الدم", "turkish": "Kan Şekeri Kontrolü"},
    "weight_loss": {"english": "Weight Loss", "arabic": "خسارة الوزن", "turkish": "Kilo Verme"},
    "weight_gain": {"english": "Weight Gain", "arabic": "زيادة الوزن", "turkish": "Kilo Alma"},
    "maintenance": {"english": "Maintenance", "arabic": "المحافظة على الوزن", "turkish": "Koruma"},
    "gestational_diabetes": {"english": "Gestational Diabetes", "arabic": "سكري الحمل", "turkish": "Gestasyonel Diyabet"},
}


def build_plan_name(goal: str, language: str = "english") -> str:
    """Build the saved-plan display title in the target language.

    Deliberately NOT delegated to the LLM: the title is user-facing chrome shown in
    lists ("My Saved Plans"), so it must be correct even if the model call fails or
    degrades to a template. Driven entirely by the goal the user picked from the
    dropdown, which is already known server-side.
    """
    lang = language if language in ("arabic", "turkish") else "english"
    label = (_GOAL_LABELS.get(goal) or {}).get(lang) or (goal or "Diet").replace("_", " ").strip().title()
    if lang == "arabic":
        return f"خطة {label}"
    if lang == "turkish":
        return f"{label} Planı"
    return f"{label} Plan"


class GroqLLMService:
    """LLM for diet-plan generation: Groq only."""

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        # NOTE: "llama-3.1-8b-instant" (the old default) is no longer served on this
        # Groq account — every call to it 404s, which silently fell back to the
        # English-only template regardless of requested language. Confirmed against
        # GET /openai/v1/models that "openai/gpt-oss-20b" is actually available and
        # produces fully-localized JSON output. If LLM_MODEL_NAME is set in the
        # environment it still wins — this is only the fallback default.
        self.model_name = os.getenv("LLM_MODEL_NAME", "openai/gpt-oss-20b")
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.6))
        self.available = bool(self.api_key and self.api_key.startswith("gsk_"))
        if self.available:
            logger.info("[OK] Groq LLM (diet) initialized with model: %s", self.model_name)
        else:
            logger.warning("[WARN] Groq LLM (diet) not available - using templates")

    async def generate_response(self, prompt: str, system_prompt: str = "") -> str:
        if not self.available:
            raise Exception("LLM not configured (set GROQ_API_KEY)")
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            messages = []
            if system_prompt:
                # A dedicated system message is a much stronger instruction-following
                # signal than the same text buried mid-way through a long user prompt —
                # this is where the hard language constraint lives.
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            payload = {
                "messages": messages,
                "model": self.model_name,
                "temperature": self.temperature,
                # Reasoning models (e.g. openai/gpt-oss-20b, the default) spend part of
                # this budget on a hidden reasoning chain before the actual JSON — 1500
                # was too tight and could exhaust the budget mid-reasoning, which Groq's
                # JSON mode then rejects outright with a 400 ("max completion tokens
                # reached before generating a valid document"). 4000 leaves real headroom.
                "max_tokens": 4000,
                "top_p": 1,
                # Force strict JSON so language compliance can't hide behind a
                # parser that only recognizes English section headers.
                "response_format": {"type": "json_object"},
            }
            if "gpt-oss" in self.model_name:
                # Cuts the hidden reasoning chain way down (seen live: ~9 reasoning
                # tokens vs. several hundred), which is faster and leaves more of the
                # max_tokens budget for the actual JSON content. Only gpt-oss models
                # use this low/medium/high scale — other Groq model families define
                # `reasoning_effort` differently (e.g. Qwen only accepts none/default
                # and 400s on "low"), so this must stay gated to gpt-oss specifically
                # rather than sent unconditionally for whatever model is configured.
                payload["reasoning_effort"] = "low"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if response.status_code == 429:
                    # A transient rate-limit hit here used to fall straight through to
                    # the English-only template — i.e. an Arabic/Turkish request could
                    # silently come back in English for a reason that had nothing to do
                    # with the language prompt at all. One short, bounded retry recovers
                    # the common case (Groq's error body includes the actual wait time).
                    wait_s = 2.0
                    try:
                        detail = response.json().get("error", {}).get("message", "")
                        m = re.search(r"try again in ([\d.]+)s", detail)
                        if m:
                            wait_s = min(float(m.group(1)) + 0.5, 8.0)
                    except Exception:
                        pass
                    logger.warning("Groq 429 rate limited, retrying once in %.1fs", wait_s)
                    await asyncio.sleep(wait_s)
                    response = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                if response.status_code != 200:
                    raise Exception(f"API error {response.status_code}: {response.text[:300]}")
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error("LLM API error: %s", e)
            raise


class ProductionMealPlanningService:
    """Generate personalised diabetes-friendly meal plans."""

    def __init__(self, llm_service: GroqLLMService):
        self.llm_service = llm_service
        logger.info("[DIET] Production Meal Planning Service initialized")

    async def generate_plan(self, request) -> Dict[str, Any]:
        start_time = time.time()
        try:
            nutrition = self._calculate_nutrition(request)
            llm_used, plan_content = await self._generate_plan_content(request, nutrition)
            return self._build_response(plan_content, request, nutrition, start_time, llm_used)
        except Exception as e:
            logger.error(f"[ERROR] Plan generation failed: {e}")
            return self._get_fallback_response(request, start_time)

    # -- nutrition --------------------------------------------------------
    def _calculate_nutrition(self, request) -> Dict[str, Any]:
        if request.gender.lower() == "male":
            bmr = 88.362 + (13.397 * request.weight) + (4.799 * request.height) - (5.677 * request.age)
        else:
            bmr = 447.593 + (9.247 * request.weight) + (3.098 * request.height) - (4.330 * request.age)
        activity_map = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}
        tdee = bmr * activity_map.get(request.activityLevel, 1.55)
        goal_adj = {
            "weight_loss": -500, "diabetes_prevention": -300, "blood_sugar_control": -400,
            "weight_gain": 500, "maintenance": 0, "gestational_diabetes": -200,
        }
        adjustment = goal_adj.get(request.goals, -300)
        if "kidney" in request.healthConditions.lower():
            adjustment -= 200
        if "pcos" in request.healthConditions.lower():
            adjustment -= 150
        calories = max(tdee + adjustment, 1200)
        return {
            "daily_calories": int(calories),
            "protein_grams": int((calories * 0.25) / 4),
            "carbs_grams": int((calories * 0.45) / 4),
            "fat_grams": int((calories * 0.30) / 9),
            "fiber_grams": 25,
            "sugar_limit": "less than 25g",
            "water_intake": "2-3 liters daily",
        }

    # -- content generation -----------------------------------------------
    async def _generate_plan_content(self, request, nutrition):
        language = getattr(request, "language", "english") or "english"
        if self.llm_service.available:
            try:
                # 20s, not 10s: the old 10s budget was tight enough that a slightly
                # slow Groq response would get cancelled here and silently replaced
                # with the English-only template below — which looks exactly like
                # "the language instruction was ignored" from the user's side, even
                # though the LLM call never actually failed.
                llm_content = await asyncio.wait_for(self._generate_with_llm(request, nutrition), timeout=20.0)
                if llm_content and llm_content.get("overview"):
                    return True, llm_content
            except Exception as e:
                logger.warning(f"LLM failed, using template (language={language}): {e}")
        elif language != "english":
            logger.warning(
                "Diet plan: LLM not available, falling back to English-only template for a %s request", language
            )
        return False, self._get_enhanced_template(request, nutrition)

    async def _generate_with_llm(self, request, nutrition):
        language = getattr(request, "language", "english") or "english"
        system_prompt = self._build_system_prompt(language)
        prompt = self._create_prompt(request, nutrition, language)
        response = await self.llm_service.generate_response(prompt, system_prompt=system_prompt)
        return self._parse_llm_response(response, language)

    def _build_system_prompt(self, language: str) -> str:
        lang_name = {"arabic": "Arabic", "turkish": "Turkish"}.get(language, "English")
        return (
            "You are a diabetes-focused meal planning assistant. You always respond with a single "
            "valid JSON object and nothing else — no markdown, no code fences, no text before or "
            "after the JSON.\n\n"
            "CRITICAL INSTRUCTION: You MUST generate ALL string values in the JSON output in the "
            f"requested language ({lang_name.upper()}). While the JSON keys must remain in English "
            "for parsing, the actual content (meal descriptions, grocery items, notes, overview) "
            "MUST be written in the user's language. This is a hard requirement, not a preference — "
            f"a response where any value is in English when {lang_name} was requested is a failed "
            "response."
        )

    def _create_prompt(self, request, nutrition, language: str):
        exclusions = (request.allergies or "").strip()
        exclusion_block = ""
        if exclusions:
            exclusion_block = (
                f"\nHARD DIETARY EXCLUSIONS — the user cannot have: {exclusions}\n"
                "These are NOT suggestions to mention in passing — they are hard constraints. Every meal in "
                "daily_plan and every item in grocery_list must be built WITHOUT these ingredients from the "
                "start; substitute a sensible alternative instead of just omitting the dish. Do not copy this "
                "constraint list verbatim into important_notes as if that satisfies the requirement — the "
                "meals themselves must already be free of these ingredients.\n"
            )

        lang_name = {"arabic": "Arabic", "turkish": "Turkish"}.get(language, "English")

        return (
            "Create a personalized diabetes-friendly meal plan.\n\n"
            f"{exclusion_block}"
            f"USER PROFILE:\n"
            f"- {request.age} years old, {request.gender}\n"
            f"- {request.weight}kg, {request.height}cm\n"
            f"- Goal: {request.goals}\n"
            f"- Diet: {request.dietaryPreference}\n"
            f"- Health Conditions: {request.healthConditions}\n"
            f"- Allergies / exclusions: {request.allergies}\n"
            f"- Activity Level: {request.activityLevel}\n"
            f"- Daily Routine: {request.typicalDay}\n\n"
            f"NUTRITIONAL TARGETS:\n"
            f"- Calories: {nutrition['daily_calories']} per day\n"
            f"- Protein: {nutrition['protein_grams']}g\n"
            f"- Carbs: {nutrition['carbs_grams']}g\n"
            f"- Fat: {nutrition['fat_grams']}g\n\n"
            "Respond with ONLY a valid JSON object in exactly this format (keys in English, "
            "values in the requested language):\n"
            "{\n"
            '  "overview": "2-3 sentence personalized overview focusing on diabetes management",\n'
            '  "daily_plan": "Specific meal ideas for breakfast, lunch, dinner, and snacks",\n'
            '  "grocery_list": "8-10 essential grocery items",\n'
            '  "important_notes": "3-4 key recommendations"\n'
            "}\n\n"
            f"REMINDER: every value above (overview, daily_plan, grocery_list, important_notes) "
            f"must be written entirely in {lang_name}. Only the JSON keys stay in English."
        )

    def _stringify_field(self, value: Any) -> str:
        """Coerce a JSON field to display text; the model sometimes returns a list
        instead of one string — join those naturally rather than failing to parse."""
        if value is None:
            return ""
        if isinstance(value, (list, tuple)):
            return "\n".join(self._stringify_field(v) for v in value if v)
        if isinstance(value, dict):
            return "\n".join(f"{k}: {self._stringify_field(v)}" for k, v in value.items())
        return str(value).strip()

    def _extract_json_object(self, raw: str) -> Dict[str, Any]:
        import json as _json
        import re as _re
        text = (raw or "").strip()
        if not text:
            return {}
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end < start:
            return {}
        candidate = text[start : end + 1]
        try:
            return _json.loads(candidate)
        except (ValueError, TypeError):
            pass
        try:
            return _json.loads(_re.sub(r",\s*([}\]])", r"\1", candidate))
        except (ValueError, TypeError):
            return {}

    def _parse_llm_response(self, response: str, language: str = "english") -> Dict[str, Any]:
        # Primary path: strict JSON (forced via response_format=json_object).
        data = self._extract_json_object(response)
        if data:
            sections = {
                "overview": self._stringify_field(data.get("overview")),
                "daily_plan": self._stringify_field(data.get("daily_plan")),
                "grocery_list": self._stringify_field(data.get("grocery_list")),
                "important_notes": self._stringify_field(data.get("important_notes")),
            }
            if any(sections.values()):
                return sections
            logger.warning("Diet plan JSON parsed but all fields empty; falling back to text parser")

        # Fallback: some responses may not be valid JSON (older model behavior, or a
        # provider that ignores response_format) — recover with the old line-based
        # section-header parser instead of failing the whole request.
        try:
            sections = {"overview": "", "daily_plan": "", "grocery_list": "", "important_notes": ""}
            current = "overview"
            for line in response.split("\n"):
                line = line.strip()
                if not line:
                    continue
                lower = line.lower()
                header = None
                if "overview" in lower:
                    header = "overview"
                elif any(w in lower for w in ("daily", "plan", "breakfast")):
                    header = "daily_plan"
                elif any(w in lower for w in ("grocery", "shopping")):
                    header = "grocery_list"
                elif any(w in lower for w in ("note", "important")):
                    header = "important_notes"

                if header:
                    current = header
                    # A header line commonly carries its content on the same line
                    # ("OVERVIEW: ...") — keep that text instead of discarding it.
                    inline = line.split(":", 1)[1].strip() if ":" in line else ""
                    if inline:
                        if sections[current]:
                            sections[current] += "\n"
                        sections[current] += inline
                    continue

                if sections[current]:
                    sections[current] += "\n"
                sections[current] += line
            return sections
        except Exception:
            return {}

    # -- templates --------------------------------------------------------
    def _get_enhanced_template(self, request, nutrition):
        base = {
            "overview": (
                f"Personalized {request.dietaryPreference} diabetes meal plan for a "
                f"{request.age}-year-old {request.gender}. Designed for optimal blood sugar "
                f"control with {nutrition['daily_calories']} daily calories."
            ),
            "daily_plan": self._get_daily_plan_template(request),
            "grocery_list": self._get_grocery_list_template(request),
            "important_notes": self._get_important_notes_template(request),
        }
        if request.typicalDay:
            base["important_notes"] += f"\n- Adjust meal timing based on your routine: {request.typicalDay}"
        return base

    def _get_daily_plan_template(self, request):
        plan = (
            "BREAKFAST (7-8 AM): High-fiber cereal with nuts and berries\n"
            "LUNCH (12-1 PM): Grilled protein with vegetables and whole grains\n"
            "DINNER (6-7 PM): Light protein with non-starchy vegetables\n"
            "SNACKS: Fresh fruits, nuts, yogurt between meals"
        )
        if request.dietaryPreference == "vegetarian":
            plan = plan.replace("Grilled protein", "Plant-based protein").replace("Light protein", "Legume-based dish")
        elif request.dietaryPreference == "vegan":
            plan = plan.replace("Grilled protein", "Tofu or tempeh").replace("Light protein", "Plant-based protein").replace("yogurt", "plant-based yogurt")
        elif request.dietaryPreference == "low_carb":
            plan = plan.replace("cereal with nuts and berries", "eggs with avocado").replace("whole grains", "extra vegetables")
        if "kidney" in request.healthConditions.lower():
            plan += "\n\nSPECIAL: Lower protein intake recommended for kidney health"
        if "pcos" in request.healthConditions.lower():
            plan += "\n\nSPECIAL: Focus on low-glycemic foods and regular meal timing"
        return plan

    def _get_grocery_list_template(self, request):
        lst = (
            "- Whole grains (oats, brown rice, quinoa)\n"
            "- Lean proteins (chicken, fish, legumes)\n"
            "- Fresh vegetables (leafy greens, broccoli, carrots)\n"
            "- Low-sugar fruits (berries, apples, oranges)\n"
            "- Healthy fats (avocado, nuts, olive oil)\n"
            "- Low-fat dairy (Greek yogurt, milk)\n"
            "- Herbs and spices (turmeric, cinnamon, garlic)"
        )
        if request.dietaryPreference == "vegetarian":
            lst = lst.replace("chicken, fish", "tofu, tempeh, lentils")
        elif request.dietaryPreference == "vegan":
            lst = lst.replace("chicken, fish", "tofu, tempeh, legumes").replace("Low-fat dairy", "Plant-based alternatives")
        elif request.dietaryPreference == "low_carb":
            lst = lst.replace("Whole grains", "Cauliflower rice").replace("Low-sugar fruits", "Berries in moderation")
        if "gluten" in request.allergies.lower():
            lst += "\n- Gluten-free alternatives (quinoa, buckwheat)"
        if "dairy" in request.allergies.lower():
            lst = lst.replace("Low-fat dairy", "Dairy-free alternatives")
        return lst

    def _get_important_notes_template(self, request):
        notes = (
            "- Monitor blood sugar levels regularly\n"
            "- Stay hydrated with 8+ glasses of water daily\n"
            "- Exercise for 30 minutes most days\n"
            "- Consult healthcare provider before major changes"
        )
        if "kidney" in request.healthConditions.lower():
            notes += "\n- Limit protein intake as advised by your doctor\n- Monitor potassium and phosphorus levels"
        if "pcos" in request.healthConditions.lower():
            notes += "\n- Maintain consistent meal timing\n- Focus on anti-inflammatory foods"
        if request.allergies:
            notes += f"\n- Strictly avoid foods containing: {request.allergies}"
        if request.goals == "weight_loss":
            notes += "\n- Create a moderate calorie deficit for sustainable weight loss"
        elif request.goals == "blood_sugar_control":
            notes += "\n- Test blood sugar before and after meals to understand food impacts"
        return notes

    # -- response builder -------------------------------------------------
    def _build_response(self, plan_content, request, nutrition, start_time, llm_used):
        language = getattr(request, "language", "english") or "english"
        return {
            "plan_name": build_plan_name(request.goals, language),
            "overview": plan_content.get("overview", "Personalized diabetes meal plan for optimal health."),
            "daily_plan": plan_content.get("daily_plan", "Balanced daily meal schedule."),
            "grocery_list": plan_content.get("grocery_list", "Essential diabetes-friendly groceries."),
            "important_notes": plan_content.get("important_notes", "Important health recommendations."),
            "nutritional_info": nutrition,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "success",
            "generation_time": round(time.time() - start_time, 2),
        }

    def _get_fallback_response(self, request, start_time):
        nutrition = self._calculate_nutrition(request)
        template = self._get_enhanced_template(request, nutrition)
        resp = self._build_response(template, request, nutrition, start_time, False)
        resp["status"] = "fallback"
        return resp
