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


class GroqLLMService:
    """LLM for diet-plan generation: Groq only."""

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.model_name = os.getenv("LLM_MODEL_NAME", "llama-3.1-8b-instant")
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.6))
        self.available = bool(self.api_key and self.api_key.startswith("gsk_"))
        if self.available:
            logger.info("[OK] Groq LLM (diet) initialized with model: %s", self.model_name)
        else:
            logger.warning("[WARN] Groq LLM (diet) not available - using templates")

    async def generate_response(self, prompt: str) -> str:
        if not self.available:
            raise Exception("LLM not configured (set GROQ_API_KEY)")
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "messages": [{"role": "user", "content": prompt}],
                "model": self.model_name,
                "temperature": self.temperature,
                "max_tokens": 1500,
                "top_p": 1,
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if response.status_code != 200:
                    raise Exception(f"API error {response.status_code}")
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
        if self.llm_service.available:
            try:
                llm_content = await asyncio.wait_for(self._generate_with_llm(request, nutrition), timeout=10.0)
                if llm_content and llm_content.get("overview"):
                    return True, llm_content
            except Exception as e:
                logger.warning(f"LLM failed, using template: {e}")
        return False, self._get_enhanced_template(request, nutrition)

    async def _generate_with_llm(self, request, nutrition):
        prompt = self._create_prompt(request, nutrition)
        response = await self.llm_service.generate_response(prompt)
        return self._parse_llm_response(response)

    def _create_prompt(self, request, nutrition):
        language = getattr(request, "language", "english") or "english"
        lang_instruction = {
            "arabic": (
                "CRITICAL LANGUAGE RULE: Write the ENTIRE response — overview, every meal in the daily plan, "
                "every grocery item, and every note — in Arabic (فصحى بسيطة وواضحة). Do not leave any part "
                "in English. Section headers (OVERVIEW, DAILY_PLAN, GROCERY_LIST, IMPORTANT_NOTES) must stay "
                "in English exactly as given so the response can be parsed, but everything else must be Arabic."
            ),
            "turkish": (
                "CRITICAL LANGUAGE RULE: Write the ENTIRE response — overview, every meal in the daily plan, "
                "every grocery item, and every note — in Turkish. Do not leave any part in English. Section "
                "headers (OVERVIEW, DAILY_PLAN, GROCERY_LIST, IMPORTANT_NOTES) must stay in English exactly "
                "as given so the response can be parsed, but everything else must be Turkish."
            ),
        }.get(language, "Write the entire response in English.")

        exclusions = (request.allergies or "").strip()
        exclusion_block = ""
        if exclusions:
            exclusion_block = (
                f"\nHARD DIETARY EXCLUSIONS — the user cannot have: {exclusions}\n"
                "These are NOT suggestions to mention in passing — they are hard constraints. Every meal in "
                "DAILY_PLAN and every item in GROCERY_LIST must be built WITHOUT these ingredients from the "
                "start; substitute a sensible alternative instead of just omitting the dish. Do not copy this "
                "constraint list verbatim into IMPORTANT_NOTES as if that satisfies the requirement — the "
                "meals themselves must already be free of these ingredients.\n"
            )

        return (
            "Create a personalized diabetes-friendly meal plan.\n\n"
            f"{lang_instruction}\n"
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
            "Create a response with these 4 sections (keep these exact English section headers):\n"
            "OVERVIEW: 2-3 sentence personalized overview focusing on diabetes management\n"
            "DAILY_PLAN: Specific meal ideas for breakfast, lunch, dinner, and snacks\n"
            "GROCERY_LIST: 8-10 essential grocery items\n"
            "IMPORTANT_NOTES: 3-4 key recommendations\n"
        )

    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        try:
            sections = {"overview": "", "daily_plan": "", "grocery_list": "", "important_notes": ""}
            current = "overview"
            for line in response.split("\n"):
                line = line.strip()
                if not line:
                    continue
                lower = line.lower()
                if "overview" in lower:
                    current = "overview"
                elif any(w in lower for w in ("daily", "plan", "breakfast")):
                    current = "daily_plan"
                elif any(w in lower for w in ("grocery", "shopping")):
                    current = "grocery_list"
                elif any(w in lower for w in ("note", "important")):
                    current = "important_notes"
                else:
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
        return {
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
