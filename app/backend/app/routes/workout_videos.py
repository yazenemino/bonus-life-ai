"""
Workout / Sport: YouTube workout videos by goal (beginner, weight loss, 10-min, low-impact, etc.).
Returns curated video IDs; optional YouTube Data API search can be added via YOUTUBE_API_KEY.
Videos are shuffled per user (logged-in: stable order by user id; anonymous: random order).
"""

import asyncio
import os
import random
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user_optional

logger = logging.getLogger(__name__)
router = APIRouter(tags=["workout-videos"])

# How many videos to return per request (subset of pool). Refresh gives a different subset.
DISPLAY_COUNT = 6

# Curated pool per goal (8 videos each). Refresh uses a new seed to pick a different subset of DISPLAY_COUNT.
CURATED = {
    "beginner": [
        {"id": "v7AYKMP6rOE", "title": "Full Body Beginner Workout", "channel": "Fitness Blender"},
        {"id": "9u4Hj7W0p2c", "title": "Yoga for Complete Beginners", "channel": "Yoga with Adriene"},
        {"id": "2ZEqf9d2L1M", "title": "10 Min Beginner Cardio", "channel": "POPSUGAR Fitness"},
        {"id": "j7rKKbwdVBE", "title": "Beginner Strength Training", "channel": "Fitness Blender"},
        {"id": "TUVcZfQe-Kw", "title": "20 Min Beginner HIIT", "channel": "POPSUGAR Fitness"},
        {"id": "KKT4wF4cGqc", "title": "10 Min Full Body Beginner", "channel": "Heather Robertson"},
        {"id": "UBMk30rjy0o", "title": "Beginner Abs", "channel": "Blogilates"},
        {"id": "3jWRQXeD0bM", "title": "Low Impact Beginner", "channel": "Heather Robertson"},
    ],
    "weight_loss": [
        {"id": "TUVcZfQe-Kw", "title": "20 Min HIIT Workout", "channel": "POPSUGAR Fitness"},
        {"id": "ml6cT4AZdqI", "title": "Fat Burning Cardio", "channel": "Fitness Blender"},
        {"id": "KIKNGq8Xb8E", "title": "30 Min Fat Burn", "channel": "Heather Robertson"},
        {"id": "2s2LJvPYCuc", "title": "HIIT for Weight Loss", "channel": "POPSUGAR"},
        {"id": "v7AYKMP6rOE", "title": "Full Body Fat Burn", "channel": "Fitness Blender"},
        {"id": "2ZEqf9d2L1M", "title": "Cardio Weight Loss", "channel": "POPSUGAR Fitness"},
        {"id": "2z8J2U-9x0s", "title": "Lower Body Fat Burn", "channel": "Heather Robertson"},
        {"id": "j7rKKbwdVBE", "title": "Strength & Burn", "channel": "Fitness Blender"},
    ],
    "10_min": [
        {"id": "KKT4wF4cGqc", "title": "10 Min Full Body", "channel": "Heather Robertson"},
        {"id": "2ZEqf9d2L1M", "title": "10 Min Cardio", "channel": "POPSUGAR Fitness"},
        {"id": "UBMk30rjy0o", "title": "10 Min Abs", "channel": "Blogilates"},
        {"id": "j7rKKbwdVBE", "title": "10 Min Toned Arms", "channel": "Fitness Blender"},
        {"id": "v7AYKMP6rOE", "title": "10 Min Quick Workout", "channel": "Fitness Blender"},
        {"id": "9u4Hj7W0p2c", "title": "10 Min Yoga", "channel": "Yoga with Adriene"},
        {"id": "3jWRQXeD0bM", "title": "10 Min HIIT", "channel": "Heather Robertson"},
        {"id": "ml6cT4AZdqI", "title": "10 Min Cardio Burn", "channel": "Fitness Blender"},
    ],
    "low_impact": [
        {"id": "ml6cT4AZdqI", "title": "Low Impact Cardio", "channel": "Fitness Blender"},
        {"id": "9u4Hj7W0p2c", "title": "Gentle Yoga Flow", "channel": "Yoga with Adriene"},
        {"id": "3jWRQXeD0bM", "title": "Low Impact HIIT", "channel": "Heather Robertson"},
        {"id": "2ZEqf9d2L1M", "title": "Low Impact Full Body", "channel": "POPSUGAR"},
        {"id": "v7AYKMP6rOE", "title": "Low Impact Strength", "channel": "Fitness Blender"},
        {"id": "KKT4wF4cGqc", "title": "Low Impact Full Body", "channel": "Heather Robertson"},
        {"id": "UBMk30rjy0o", "title": "Low Impact Core", "channel": "Blogilates"},
        {"id": "j7rKKbwdVBE", "title": "Gentle Cardio", "channel": "Fitness Blender"},
    ],
    "strength": [
        {"id": "j7rKKbwdVBE", "title": "Upper Body Strength", "channel": "Fitness Blender"},
        {"id": "2z8J2U-9x0s", "title": "Lower Body & Glutes", "channel": "Heather Robertson"},
        {"id": "UBMk30rjy0o", "title": "Core Strength", "channel": "Blogilates"},
        {"id": "v7AYKMP6rOE", "title": "Full Body Strength", "channel": "Fitness Blender"},
        {"id": "KKT4wF4cGqc", "title": "Strength Training", "channel": "Heather Robertson"},
        {"id": "TUVcZfQe-Kw", "title": "HIIT Strength", "channel": "POPSUGAR Fitness"},
        {"id": "ml6cT4AZdqI", "title": "Cardio Strength", "channel": "Fitness Blender"},
        {"id": "3jWRQXeD0bM", "title": "Total Body Strength", "channel": "Heather Robertson"},
    ],
}

VALID_GOALS = list(CURATED.keys())


def _shuffle_and_take(videos: list, seed: Optional[str], take: int = DISPLAY_COUNT) -> list:
    """Shuffle a copy with seed and return first `take` items. Different seed => different subset."""
    out = list(videos)
    if seed:
        random.Random(seed).shuffle(out)
    else:
        random.shuffle(out)
    return out[:take]


# YouTube category ID 17 = "Sports" — restricts search away from music/entertainment videos.
_SPORTS_CATEGORY_ID = "17"


def _lang_code(language: Optional[str]) -> str:
    lang = (language or "english").lower()
    if "arabic" in lang or lang == "ar":
        return "ar"
    if "turkish" in lang or lang == "tr":
        return "tr"
    return "en"


@router.get("")
async def get_workout_videos(
    goal: str = Query(default="beginner", description="Workout goal: beginner, weight_loss, 10_min, low_impact, strength"),
    refresh_key: Optional[str] = Query(None, description="Pass a new value (e.g. timestamp) to get a different set of videos"),
    language: str = Query(default="english", description="Preferred video language: english | arabic | turkish"),
    current_user: Optional[object] = Depends(get_current_user_optional),
):
    """
    Return a subset of YouTube workout videos for the chosen goal.
    Uses curated pool or YouTube API. Pass refresh_key to get a different set (e.g. after watching all).
    """
    goal_key = goal.strip().lower().replace(" ", "_") if goal else "beginner"
    if goal_key not in VALID_GOALS:
        goal_key = "beginner"
    lang_code = _lang_code(language)

    user_id = getattr(current_user, "id", None) if current_user else None
    seed = str(user_id) if user_id else None
    if refresh_key:
        seed = f"{seed or 'anon'}_{refresh_key}"

    # Optional: if YOUTUBE_API_KEY is set, could fetch from YouTube Data API here
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if api_key:
        try:
            dynamic = await asyncio.to_thread(_fetch_from_youtube_api, api_key, goal_key, lang_code)
            if dynamic:
                videos = _shuffle_and_take(dynamic, seed)
                return {"goal": goal_key, "videos": videos, "source": "youtube_api"}
        except Exception as e:
            logger.warning("YouTube API fetch failed, using curated: %s", e)

    raw = CURATED.get(goal_key, CURATED["beginner"])
    videos = _shuffle_and_take(raw, seed)
    return {"goal": goal_key, "videos": videos, "source": "curated"}


def _fetch_from_youtube_api(api_key: str, goal_key: str, lang_code: str = "en") -> list | None:
    """Search YouTube Data API for workout videos. Returns list of {id, title, channel} or None."""
    try:
        import httpx
        query_map = {
            "beginner": "beginner workout full body",
            "weight_loss": "weight loss workout HIIT",
            "10_min": "10 minute workout",
            "low_impact": "low impact workout",
            "strength": "strength training workout",
        }
        q = query_map.get(goal_key, "workout")
        # Bias the query itself toward language-matching fitness content — relevanceLanguage
        # alone still lets unrelated (e.g. music) results from that locale through.
        query_suffix = {
            "ar": "تمارين رياضية باللغة العربية",
            "tr": "Türkçe fitness egzersizleri",
        }.get(lang_code)
        if query_suffix:
            q = f"{q} {query_suffix}"
        region_code = {"ar": "SA", "tr": "TR"}.get(lang_code, "US")

        url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": q,
            "type": "video",
            "maxResults": 12,
            "key": api_key,
            "videoEmbeddable": "true",
            "videoSyndicated": "true",
            "videoCategoryId": _SPORTS_CATEGORY_ID,
            "relevanceLanguage": lang_code,
            "regionCode": region_code,
            "safeSearch": "strict",
        }
        with httpx.Client(timeout=10) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
        items = data.get("items", [])
        out = []
        for it in items:
            vid = it.get("id", {}).get("videoId")
            sn = it.get("snippet", {})
            if vid and sn:
                out.append({
                    "id": vid,
                    "title": sn.get("title", "")[:80],
                    "channel": sn.get("channelTitle", ""),
                })
        return out if out else None
    except Exception:
        return None
