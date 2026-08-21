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

# Curated pool per goal — Arabic-language home workouts with modest, family-friendly
# presentation (loose/covered activewear, no shirtless trainers, no music-video or
# otherwise unrelated content). Every id below was verified live via YouTube's oEmbed
# endpoint (returns 200 + real title/author only for a video that actually exists and
# is embeddable) and its thumbnail was visually checked before being added here — the
# previous pool had 8/12 dead ids (404) and one, TUVcZfQe-Kw, that was actually Dua
# Lipa's "Levitating" music video mislabeled as a workout. Sourced mainly from Doha
# Dergham (ضحي درغام, @dohadergham — 879K subscribers, established home-workout
# channel), plus one from Al Araby TV's fitness segment for variety.
CURATED = {
    "beginner": [
        {"id": "aSVl4RKB-MU", "title": "كارديو لحرق الدهون - مناسب للمبتدئين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "obtzDPwAt6c", "title": "تمارين منزلية بسيطة للمبتدئين", "channel": "العربي"},
        {"id": "cOnhIcvqIsI", "title": "كارديو HIIT بدون قفز - حرق دهون", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yF1wf_rgkMM", "title": "بيلاتس للجزء العلوي والذراعين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "3YM5IL2hRN8", "title": "تمرين لنحت البطن والخصر", "channel": "Doha Dergham ضحي درغام"},
        {"id": "bZqIBoTpFKI", "title": "كارديو-هييت لكامل الجسم - 10 دقائق", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pvmjZWj9BfU", "title": "HIIT للبطن بدون قفز", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pBdEusLdofQ", "title": "تمارين مقاومة لكامل الجسم بدون أوزان", "channel": "Doha Dergham ضحي درغام"},
    ],
    "weight_loss": [
        {"id": "cOnhIcvqIsI", "title": "كارديو HIIT بدون قفز - حرق دهون", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yYcfch1CS4s", "title": "25 دقيقة هييت كارديو لكامل الجسم", "channel": "Doha Dergham ضحي درغام"},
        {"id": "bZqIBoTpFKI", "title": "كارديو-هييت لكامل الجسم - 10 دقائق", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pvmjZWj9BfU", "title": "HIIT للبطن بدون قفز", "channel": "Doha Dergham ضحي درغام"},
        {"id": "aSVl4RKB-MU", "title": "كارديو لحرق الدهون - مناسب للمبتدئين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "3YM5IL2hRN8", "title": "تمرين لنحت البطن والخصر", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pBdEusLdofQ", "title": "تمارين مقاومة لكامل الجسم بدون أوزان", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yF1wf_rgkMM", "title": "بيلاتس للجزء العلوي والذراعين", "channel": "Doha Dergham ضحي درغام"},
    ],
    "10_min": [
        {"id": "bZqIBoTpFKI", "title": "كارديو-هييت لكامل الجسم - 10 دقائق", "channel": "Doha Dergham ضحي درغام"},
        {"id": "cOnhIcvqIsI", "title": "كارديو HIIT بدون قفز - حرق دهون", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pvmjZWj9BfU", "title": "HIIT للبطن بدون قفز", "channel": "Doha Dergham ضحي درغام"},
        {"id": "aSVl4RKB-MU", "title": "كارديو لحرق الدهون - مناسب للمبتدئين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "3YM5IL2hRN8", "title": "تمرين لنحت البطن والخصر", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yF1wf_rgkMM", "title": "بيلاتس للجزء العلوي والذراعين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "obtzDPwAt6c", "title": "تمارين منزلية بسيطة للمبتدئين", "channel": "العربي"},
    ],
    "low_impact": [
        {"id": "yF1wf_rgkMM", "title": "بيلاتس للجزء العلوي والذراعين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "cOnhIcvqIsI", "title": "كارديو HIIT بدون قفز - حرق دهون", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pvmjZWj9BfU", "title": "HIIT للبطن بدون قفز", "channel": "Doha Dergham ضحي درغام"},
        {"id": "aSVl4RKB-MU", "title": "كارديو لحرق الدهون - مناسب للمبتدئين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "3YM5IL2hRN8", "title": "تمرين لنحت البطن والخصر", "channel": "Doha Dergham ضحي درغام"},
        {"id": "obtzDPwAt6c", "title": "تمارين منزلية بسيطة للمبتدئين", "channel": "العربي"},
        {"id": "pBdEusLdofQ", "title": "تمارين مقاومة لكامل الجسم بدون أوزان", "channel": "Doha Dergham ضحي درغام"},
        {"id": "bZqIBoTpFKI", "title": "كارديو-هييت لكامل الجسم - 10 دقائق", "channel": "Doha Dergham ضحي درغام"},
    ],
    "strength": [
        {"id": "pBdEusLdofQ", "title": "تمارين مقاومة لكامل الجسم بدون أوزان", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yF1wf_rgkMM", "title": "بيلاتس للجزء العلوي والذراعين", "channel": "Doha Dergham ضحي درغام"},
        {"id": "3YM5IL2hRN8", "title": "تمرين لنحت البطن والخصر", "channel": "Doha Dergham ضحي درغام"},
        {"id": "cOnhIcvqIsI", "title": "كارديو HIIT بدون قفز - حرق دهون", "channel": "Doha Dergham ضحي درغام"},
        {"id": "bZqIBoTpFKI", "title": "كارديو-هييت لكامل الجسم - 10 دقائق", "channel": "Doha Dergham ضحي درغام"},
        {"id": "yYcfch1CS4s", "title": "25 دقيقة هييت كارديو لكامل الجسم", "channel": "Doha Dergham ضحي درغام"},
        {"id": "pvmjZWj9BfU", "title": "HIIT للبطن بدون قفز", "channel": "Doha Dergham ضحي درغام"},
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


_QUERY_MAP_EN = {
    "beginner": "beginner workout full body",
    "weight_loss": "weight loss workout HIIT",
    "10_min": "10 minute workout",
    "low_impact": "low impact workout",
    "strength": "strength training workout",
}
# Native Arabic queries, not an English base + an Arabic word tacked on — relying on
# relevanceLanguage alone still let unrelated (e.g. music) results from that locale
# through, which is how a Dua Lipa video ended up mislabeled as a workout before.
# Phrased to bias toward modest, family-friendly home workouts led by Arabic trainers.
_QUERY_MAP_AR = {
    "beginner": "تمارين رياضية منزلية للمبتدئين عربي",
    "weight_loss": "تمارين حرق دهون كارديو منزلي مدرب لياقة بدنية عربي",
    "10_min": "تمرين رياضي منزلي عشر دقائق مدرب عربي",
    "low_impact": "كارديو بدون قفز بدون موسيقى مدربة عربية",
    "strength": "تمارين مقاومة لياقة بدنية منزلية مدرب عربي",
}
_QUERY_MAP_TR = {
    "beginner": "başlangıç seviyesi ev egzersizi",
    "weight_loss": "kilo verme kardiyo egzersizi",
    "10_min": "10 dakika egzersiz",
    "low_impact": "düşük tempolu egzersiz",
    "strength": "güç antrenmanı egzersizi",
}


def _fetch_from_youtube_api(api_key: str, goal_key: str, lang_code: str = "en") -> list | None:
    """Search YouTube Data API for workout videos. Returns list of {id, title, channel} or None."""
    try:
        import httpx
        query_map = {"ar": _QUERY_MAP_AR, "tr": _QUERY_MAP_TR}.get(lang_code, _QUERY_MAP_EN)
        q = query_map.get(goal_key) or query_map["beginner"]
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
