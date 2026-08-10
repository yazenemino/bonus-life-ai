"""
JARVIS - AI agent with web search and browser control.
No tool calling — Python handles routing, LLM only summarises.
"""
import os
import re
import json
import logging
import asyncio
import httpx
from datetime import date

logger = logging.getLogger(__name__)

# ── Common site lookup ────────────────────────────────────────────────────────
KNOWN_SITES = {
    "youtube": "https://www.youtube.com",
    "youtube music": "https://music.youtube.com",
    "google": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "google maps": "https://www.google.com/maps",
    "maps": "https://www.google.com/maps",
    "google drive": "https://drive.google.com",
    "google docs": "https://docs.google.com",
    "spotify": "https://open.spotify.com",
    "netflix": "https://www.netflix.com",
    "instagram": "https://www.instagram.com",
    "twitter": "https://www.twitter.com",
    "x": "https://www.x.com",
    "facebook": "https://www.facebook.com",
    "whatsapp": "https://web.whatsapp.com",
    "wikipedia": "https://www.wikipedia.org",
    "amazon": "https://www.amazon.com",
    "ebay": "https://www.ebay.com",
    "reddit": "https://www.reddit.com",
    "github": "https://www.github.com",
    "linkedin": "https://www.linkedin.com",
    "twitch": "https://www.twitch.tv",
    "tiktok": "https://www.tiktok.com",
    "discord": "https://discord.com",
    "chatgpt": "https://chat.openai.com",
    "claude": "https://claude.ai",
    "openai": "https://www.openai.com",
    "anthropic": "https://www.anthropic.com",
    "outlook": "https://outlook.live.com",
    "hotmail": "https://outlook.live.com",
    "bing": "https://www.bing.com",
    "duckduckgo": "https://duckduckgo.com",
}

OPEN_PATTERN = re.compile(
    r'^(?:open|go to|launch|start|show me|take me to|navigate to)\s+(.+)$', re.I
)


def _resolve_url(site_name: str) -> str | None:
    """Map a site name to a URL."""
    key = site_name.lower().strip()
    if key in KNOWN_SITES:
        return KNOWN_SITES[key]
    # Try stripping common words
    key2 = re.sub(r'\b(website|site|page|app)\b', '', key).strip()
    if key2 in KNOWN_SITES:
        return KNOWN_SITES[key2]
    return None  # unknown site — let web search handle it


# ── Web search ────────────────────────────────────────────────────────────────
def _sync_search(query: str) -> str:
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=6))
        if not results:
            return ""
        parts = []
        for r in results[:5]:
            title = r.get("title", "")
            body = r.get("body", "")
            if title and body:
                parts.append(f"{title}: {body[:350]}")
        return "\n".join(parts)
    except Exception as e:
        logger.warning("DDG search error: %s", e)
        return ""


async def _search_web(query: str) -> str:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_sync_search, query),
            timeout=3.0,  # never block more than 3s
        )
    except Exception:
        return ""


# ── LLM summariser ────────────────────────────────────────────────────────────
_SYSTEM = (
    "You are an AI Assistant — highly intelligent, direct, and conversational. "
    "Answer in 1-2 natural spoken sentences. No bullet points, no markdown, no hedging. "
    "Use the search results when provided. Fall back to your training knowledge when results are unclear. "
    "Remember the full conversation — handle follow-ups like 'tell me more', 'what about X', 'is that true' by referring back to what was just said. "
    "Never say you can't access real-time data. Never suggest the user 'check a website'. Just answer confidently. "
    "You CAN open YouTube, Spotify, Maps, websites, and any browser tab — the system handles it. "
    "NEVER say 'I cannot open links', 'I cannot access websites', 'I don't have the ability to open', or any similar disclaimer. "
    "If asked to play a song, just confirm it naturally ('Playing God's Plan by Drake on YouTube'). "
    "If asked for directions, give a short helpful answer — the system will offer Maps automatically. "
    "Sound like a knowledgeable friend having a conversation."
)


def _summarise_gemini(question: str, context: str, history: list, gemini_key: str) -> str:
    """Use Gemini 2.5 Flash — smarter, better reasoning."""
    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel(
            model_name=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            system_instruction=_SYSTEM,
        )
        # Build conversation history
        chat_history = []
        for h in (history or [])[-6:]:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role == "assistant":
                role = "model"
            if role in ("user", "model") and content:
                chat_history.append({"role": role, "parts": [content]})

        chat = model.start_chat(history=chat_history)
        user_content = f"Search results:\n{context}\n\nQuestion: {question}" if context else question
        resp = chat.send_message(user_content, generation_config={"max_output_tokens": 150, "temperature": 0.4})
        reply = (resp.text or "").strip()
        return reply or "I couldn't find an answer to that."
    except Exception as e:
        logger.warning("Gemini summarise error: %s", e)
        return ""


def _summarise_groq(question: str, context: str, history: list, api_key: str) -> str:
    """Groq fallback."""
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        user_content = f"Search results:\n{context}\n\nQuestion: {question}" if context else question
        messages = [{"role": "system", "content": _SYSTEM}]
        for h in (history or [])[-6:]:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_content})
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=100,
            temperature=0.3,
        )
        reply = (resp.choices[0].message.content or "").strip()
        reply = re.sub(r'<function[^>]*>[\s\S]*?</function>', '', reply).strip()
        return reply or "I couldn't find an answer to that."
    except Exception as e:
        logger.warning("Groq summarise error: %s", e)
        return "I couldn't get an answer right now."


def _summarise(question: str, context: str, api_key: str, history: list = None) -> str:
    return _summarise_groq(question, context, history or [], api_key)


# ── Main entry ────────────────────────────────────────────────────────────────
async def run_jarvis(text: str, history: list = None) -> dict:
    """
    Run JARVIS. Returns {"reply": str, "actions": list}.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return {"reply": "JARVIS requires a GROQ_API_KEY.", "actions": []}

    text = text.strip()

    # ── Route 1: "open X" ──────────────────────────────────────────────────
    m = OPEN_PATTERN.match(text)
    if m:
        site_name = m.group(1).strip().rstrip('.')
        url = _resolve_url(site_name)
        if not url:
            # Unknown site — search DDG for the real URL
            results = await _search_web(f"{site_name} official website")
            url_match = re.search(r'https?://[^\s"\'<>]+', results)
            if url_match:
                url = url_match.group(0).rstrip('.,)')
        if url:
            label = site_name.title()
            reply = await asyncio.to_thread(
                _summarise,
                f"In one short natural sentence, confirm you opened {label}.",
                "",
                api_key,
                history,
            )
            return {
                "reply": reply,
                "actions": [{"action": "open_tab", "url": url, "label": label}],
            }

    # ── Route 2: search only for real-time queries, else LLM direct ──────────
    SEARCH_KEYWORDS = {
        "weather", "news", "today", "latest", "current", "now", "score",
        "price", "live", "forecast", "breaking", "update", "stock", "rate",
        "won", "winner", "champion", "result", "beat", "final", "match",
        "election", "president", "minister", "died", "born", "released",
    }
    needs_search = any(w in text.lower() for w in SEARCH_KEYWORDS)

    context = ""
    if needs_search:
        today = date.today().strftime("%B %d, %Y")
        search_query = f"{text} {today}"
        context = await _search_web(search_query)

    reply = await asyncio.to_thread(_summarise, text, context, api_key, history)
    return {"reply": reply, "actions": []}
