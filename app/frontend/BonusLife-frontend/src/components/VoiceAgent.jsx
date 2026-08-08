/**
 * Voice Agent - control the app by voice (navigate, fill fields, print, help, logout, etc.).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, MessageCircle, X, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/constants';
import { LiquidMetalButton } from './ui/LiquidMetalButton';
import { ShineBorder } from './ui/ShineBorder';

// Backend URL for voice/TTS. Dev only: guess same host as page (localhost vs 127.0.0.1) to avoid
// CORS issues when VITE_API_URL is left blank for the Vite proxy. In production, VITE_API_URL is
// always set to the Railway backend's HTTPS URL — never guess a localhost/port there.
function getVoiceApiBase() {
  if (API_BASE_URL && API_BASE_URL.startsWith('http')) return API_BASE_URL.replace(/\/$/, '');
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8001`;
  }
  return '';
}

const VOICE_FILL_EVENT = 'bonuslife-voice-fill';
const VOICE_CLEAR_FIELD_EVENT = 'bonuslife-voice-clear-field';
const VOICE_FORM_NEXT_EVENT = 'bonuslife-voice-form-next';
const VOICE_FORM_BACK_EVENT = 'bonuslife-voice-form-back';
/** Dispatch this on /hospitals page to trigger "find nearest hospital" (geolocation + fetch). */
export const VOICE_FIND_NEAREST_HOSPITAL = 'bonuslife-voice-find-nearest-hospital';

// Site map for instant tab opens (mirrors backend KNOWN_SITES — no async needed)
const KNOWN_SITES = {
  youtube: 'https://www.youtube.com',
  'youtube music': 'https://music.youtube.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
  'google maps': 'https://www.google.com/maps',
  maps: 'https://www.google.com/maps',
  'google drive': 'https://drive.google.com',
  spotify: 'https://open.spotify.com',
  netflix: 'https://www.netflix.com',
  instagram: 'https://www.instagram.com',
  twitter: 'https://www.twitter.com',
  x: 'https://www.x.com',
  facebook: 'https://www.facebook.com',
  whatsapp: 'https://web.whatsapp.com',
  wikipedia: 'https://www.wikipedia.org',
  amazon: 'https://www.amazon.com',
  reddit: 'https://www.reddit.com',
  github: 'https://www.github.com',
  linkedin: 'https://www.linkedin.com',
  twitch: 'https://www.twitch.tv',
  tiktok: 'https://www.tiktok.com',
  discord: 'https://discord.com',
  chatgpt: 'https://chat.openai.com',
  claude: 'https://claude.ai',
  openai: 'https://www.openai.com',
  outlook: 'https://outlook.live.com',
  hotmail: 'https://outlook.live.com',
  bing: 'https://www.bing.com',
};
const OPEN_SITE_RE = /^(?:open|go to|launch|start|show me|take me to|navigate to)\s+(.+)$/i;

// Alexa-style smart patterns — search/play/navigate/maps
const SMART_PATTERNS = [
  // YouTube: "play X on youtube" / "search X on youtube" / "youtube X"
  { re: /^(?:play|search for|find|search)\s+(.+?)\s+on\s+(?:youtube|yt)$/i,
    url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, label: q => `YouTube: ${q}` },
  { re: /^(?:youtube|yt)\s+(.+)$/i,
    url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, label: q => `YouTube: ${q}` },
  // Google: "google X" / "search X" / "search X on google"
  { re: /^(?:google|search for|search)\s+(.+?)\s+on\s+google$/i,
    url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: q => `Google: ${q}` },
  { re: /^(?:google|search for|search)\s+(.+)$/i,
    url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: q => `Google: ${q}` },
  // Maps: "directions to X" / "navigate to X" / "show X on maps" / "find X on maps"
  { re: /^(?:directions to|get directions to|navigate to|take me to)\s+(.+)$/i,
    url: q => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`, label: q => `Maps: ${q}` },
  { re: /^(?:show|find|search for?)\s+(.+?)\s+on\s+(?:maps?|google maps?)$/i,
    url: q => `https://www.google.com/maps/search/${encodeURIComponent(q)}`, label: q => `Maps: ${q}` },
  { re: /^(?:open maps for|maps to|where is)\s+(.+)$/i,
    url: q => `https://www.google.com/maps/search/${encodeURIComponent(q)}`, label: q => `Maps: ${q}` },
  // Amazon: "search X on amazon" / "buy X on amazon"
  { re: /^(?:search|buy|find)\s+(.+?)\s+on\s+amazon$/i,
    url: q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, label: q => `Amazon: ${q}` },
  // Spotify: "play X on spotify"
  { re: /^(?:play|search)\s+(.+?)\s+on\s+spotify$/i,
    url: q => `https://open.spotify.com/search/${encodeURIComponent(q)}`, label: q => `Spotify: ${q}` },
  // New tab: "open new tab" / "new tab"
  { re: /^(?:open\s+)?new\s+tab$/i,
    url: () => 'about:blank', label: () => 'New Tab' },
];

function tryOpenSite(text) {
  const t = text.trim();
  const lower = t.toLowerCase();

  // "play X" → YouTube (unless explicit other platform)
  if (lower.startsWith('play ')) {
    const OTHER_PLATFORMS = ['on spotify', 'on apple music', 'on netflix', 'on amazon', 'on tidal', 'on deezer'];
    const isOtherPlatform = OTHER_PLATFORMS.some(p => lower.includes(p));
    if (!isOtherPlatform) {
      const query = t.slice(5).trim().replace(/[.,!?]$/, '');
      if (query) return {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        label: `YouTube: ${query}`,
      };
    }
  }

  // Check smart Alexa-style patterns first
  for (const { re, url, label } of SMART_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const query = (m[1] || '').trim().replace(/[.,!?]$/, '');
      return { url: url(query), label: label(query) };
    }
  }
  // Fallback: "open X" → known site only (no guessing — unknown sites go to AI agent)
  const m = t.match(OPEN_SITE_RE);
  if (!m) return null;
  const raw = m[1].trim().replace(/[.,!?]$/, '');
  const name = raw.toLowerCase().replace(/\b(website|site|page|app)\b/g, '').trim();
  const url = KNOWN_SITES[name] || KNOWN_SITES[raw.toLowerCase()];
  if (url) return { url, label: raw };
  return null; // unknown site → let AI agent search for it
}

const FILLER_WORDS = new Set(['um', 'uh', 'the', 'a', 'an', 'and', 'oh', 'so', 'like', 'yeah', 'hmm']);
const MIN_UTTERANCE_LENGTH = 3;

const WAKE_PHRASES = [
  'hey bonus life', 'bonus life', 'ok bonus life', 'okay bonus life',
  'hi bonus life', 'hello bonus life', 'yo bonus life',
  'hey bonus live', 'bonus live',
];
function matchWakePhrase(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,!?]/g, ' ');
  const normalized = t
    .replace(/\s+/g, ' ')
    .replace(/\bbonus live\b/g, 'bonus life')
    .replace(/\bbonuslife\b/g, 'bonus life')
    .trim();
  const hasBonusLife = normalized.includes('bonus life');
  const withHey = /(hey|hi|hello|ok(ay)?|yo)\s+bonus life/.test(normalized);
  if (hasBonusLife && (normalized.includes('hey ') || normalized.startsWith('bonus life') || withHey)) return true;
  return WAKE_PHRASES.some((phrase) => {
    const p = phrase.replace(/\s+/g, ' ');
    return normalized === p || normalized.endsWith(' ' + p) || normalized.includes(p);
  });
}

const STOP_PHRASES = [
  'thank you', 'thanks', 'thank ya', 'thankyou', 'thank u', 'thx',
  'goodbye', 'bye', 'good bye', 'bye bye', 'good night',
  'stop listening', 'stop', "that's all", 'that is all', 'done', 'never mind', 'nevermind',
];
function matchStopPhrase(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const tNoSpaces = t.replace(/\s+/g, '');
  if (/\b(thank|thanks|bye|goodbye|done|stop)\b/.test(t)) return true;
  return STOP_PHRASES.some((phrase) => {
    const p = phrase.replace(/\s+/g, '');
    return t === phrase || t.endsWith(' ' + phrase) || t.includes(phrase)
      || tNoSpaces.includes(p) || tNoSpaces === p;
  });
}

// Hardcoded commands: match first, run immediately (no backend call) for lower latency and offline nav
const HARDCODED_NAV = [
  { phrases: ['home', 'main page', 'go home', 'open home'], action: 'navigate', payload: { path: '/' }, reply: 'Opening home.' },
  { phrases: ['login', 'sign in', 'log in', 'open login'], action: 'navigate', payload: { path: '/login' }, reply: 'Opening login.' },
  { phrases: ['register', 'sign up', 'open register'], action: 'navigate', payload: { path: '/register' }, reply: 'Opening register.' },
  { phrases: ['test', 'risk assessment', 'risk test', 'diabetes test', 'open test', 'go to test', 'assessment', 'open assessment'], action: 'navigate', payload: { path: '/test' }, reply: 'Opening diabetes test.' },
  { phrases: ['heart test', 'heart risk', 'heart assessment', 'open heart test'], action: 'navigate', payload: { path: '/heart-test' }, reply: 'Opening heart test.' },
  { phrases: ['chat', 'chatbot', 'open chat', 'go to chat'], action: 'navigate', payload: { path: '/chat' }, reply: 'Opening chat.' },
  { phrases: ['voice chat', 'voice', 'open voice chat'], action: 'navigate', payload: { path: '/voice-chat' }, reply: 'Opening voice chat.' },
  { phrases: ['diet', 'diet plan', 'meal plan', 'open diet'], action: 'navigate', payload: { path: '/diet-plan' }, reply: 'Opening diet plan.' },
  { phrases: ['symptom checker', 'symptoms', 'symptom check', 'open symptom checker'], action: 'navigate', payload: { path: '/symptom-checker' }, reply: 'Opening symptom checker.' },
  { phrases: ['hospitals', 'hospital', 'open hospitals', 'open hospital'], action: 'navigate', payload: { path: '/hospitals' }, reply: 'Opening hospitals.' },
  { phrases: ['find nearest hospital', 'nearest hospital', 'search for nearest hospital', 'find hospital near me', 'hospital near me', 'nearest hospitals'], action: 'find_nearest_hospital', payload: {}, reply: 'Finding your nearest hospitals.' },
  { phrases: ['dashboard', 'my assessments', 'past results', 'assessments', 'open dashboard'], action: 'navigate', payload: { path: '/dashboard' }, reply: 'Opening dashboard.' },
  { phrases: ['admin', 'admin panel', 'open admin'], action: 'navigate', payload: { path: '/admin' }, reply: 'Opening admin.' },
  { phrases: ['studio', 'micro interaction', 'open studio'], action: 'navigate', payload: { path: '/studio' }, reply: 'Opening studio.' },
  { phrases: ['verify', 'verify report', 'report verification', 'open verify'], action: 'navigate', payload: { path: '/verify' }, reply: 'Opening verify report.' },
  { phrases: ['meal photo', 'meal analyzer', 'photo analyzer', 'analyze meal', 'open meal photo'], action: 'navigate', payload: { path: '/meal-photo' }, reply: 'Opening meal photo analyzer.' },
  { phrases: ['sport', 'workout', 'workout videos', 'exercise', 'open sport', 'open workout'], action: 'navigate', payload: { path: '/sport' }, reply: 'Opening workout videos.' },
  { phrases: ['what if', 'open what if', 'what if scenario', 'open the what if', 'scenario'], action: 'navigate', payload: { path: '/local-ai?section=scenario' }, reply: 'Opening what if.' },
  { phrases: ['local ai', 'local ai tip', 'health tip', 'open local ai'], action: 'navigate', payload: { path: '/local-ai' }, reply: 'Opening local AI.' },
  { phrases: ['pricing', 'plans', 'subscription', 'open pricing'], action: 'navigate', payload: { path: '/pricing' }, reply: 'Opening pricing.' },
];
const HARDCODED_ACTIONS = [
  { phrases: ['refresh', 'reload'], action: 'refresh', payload: {}, reply: 'Refreshing.' },
  { phrases: ['scroll down'], action: 'scroll_down', payload: {}, reply: '' },
  { phrases: ['scroll up'], action: 'scroll_up', payload: {}, reply: '' },
  { phrases: ['help', 'what can you do', 'commands'], action: 'help', payload: { message: 'You can say: Open home, Open test, Open chat, Open diet, Open hospitals, Find nearest hospital, Fill age 35, Continue or Back, Print, Refresh, Log out, or Thank you to stop.' }, reply: null },
  { phrases: ['log out', 'logout', 'sign out'], action: 'logout', payload: {}, reply: 'Are you sure you want to log out?' },
  { phrases: ['print'], action: 'print', payload: {}, reply: 'Printing.' },
  { phrases: ['continue', 'next', 'next step'], action: 'form_next', payload: {}, reply: 'Continuing.' },
  { phrases: ['back', 'previous', 'go back'], action: 'form_back', payload: {}, reply: 'Going back.' },
];
// Fill patterns: (regex, field name for payload). Match anywhere in phrase.
// Diabetes: age, weight, glucose, blood_pressure, pregnancies, height, insulin, skin_thickness
// Heart: age, trestbps, chol, thalach, oldpeak, ca
const FILL_PATTERNS = [
  [/(?:fill|set)\s+age\s+(\d+(?:\.\d+)?)/i, 'age'],
  [/(?:fill|set)\s+weight\s+(\d+(?:\.\d+)?)/i, 'weight'],
  [/(?:fill|set)\s+glucose\s+(\d+(?:\.\d+)?)/i, 'glucose'],
  [/(?:fill|set)\s+blood\s*pressure\s+(\d+)/i, 'blood_pressure'],
  [/(?:fill|set)\s+pregnancies\s+(\d+)/i, 'pregnancies'],
  [/(?:fill|set)\s+height\s+(\d+(?:\.\d+)?)/i, 'height'],
  [/(?:fill|set)\s+insulin\s+(\d+)/i, 'insulin'],
  [/(?:fill|set)\s+skin\s*thickness\s+(\d+)/i, 'skin_thickness'],
  [/(?:fill|set)\s+(?:resting\s*)?(?:bp|pressure|blood\s*pressure)\s+(\d+)/i, 'trestbps'],
  [/(?:fill|set)\s+(?:resting\s*)?trestbps\s+(\d+)/i, 'trestbps'],
  [/(?:fill|set)\s+cholesterol\s+(\d+)/i, 'chol'],
  [/(?:fill|set)\s+chol\s+(\d+)/i, 'chol'],
  [/(?:fill|set)\s+(?:max\s*)?(?:heart\s*rate|thalach)\s+(\d+)/i, 'thalach'],
  [/(?:fill|set)\s+oldpeak\s+(\d+(?:\.\d+)?)/i, 'oldpeak'],
  [/(?:fill|set)\s+(?:st\s*depression|depression)\s+(\d+(?:\.\d+)?)/i, 'oldpeak'],
  [/(?:fill|set)\s+(?:vessels|major\s*vessels|ca)\s+(\d+)/i, 'ca'],
];

// Detect navigation/directions queries and extract the destination
function _extractNavDestination(text) {
  const t = text.trim();
  const SKIP = /^(sleep|work|school|home|there|here|bed|it|this|that|him|her|them)$/i;
  const patterns = [
    /^how (?:do i |can i )?go to\s+(.+?)(?:\?|$)/i,
    /^how (?:do i |can i )?get to\s+(.+?)(?:\?|$)/i,
    /^how to (?:go to|get to|reach)\s+(.+?)(?:\?|$)/i,
    /^(?:directions? to|route to|best route to)\s+(.+?)(?:\?|$)/i,
    /^best (?:way|route) to (?:get to |go to |reach )?(.+?)(?:\?|$)/i,
  ];
  for (const pat of patterns) {
    const m = t.match(pat);
    if (m) {
      const dest = m[1].trim().replace(/[.,!?]$/, '');
      if (dest && !SKIP.test(dest)) return dest;
    }
  }
  return null;
}

function tryHardcodedCommand(transcript) {
  const t = (transcript || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  for (const entry of HARDCODED_NAV) {
    if (entry.phrases.some((p) => t === p || t.includes(p) || t.includes(p.replace(/\s+/g, ' ')))) {
      return { action: entry.action, payload: entry.payload, reply: entry.reply };
    }
  }
  for (const entry of HARDCODED_ACTIONS) {
    if (entry.phrases.some((p) => t === p || t.includes(p))) {
      return { action: entry.action, payload: entry.payload, reply: entry.reply };
    }
  }
  for (const [regex, field] of FILL_PATTERNS) {
    const m = t.match(regex);
    if (m) return { action: 'fill_field', payload: { field, value: m[1] }, reply: 'Done.' };
  }
  return null;
}

let preferredVoiceCache = null;
function getPreferredVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  if (voices.length === 0) return preferredVoiceCache;
  const en = voices.filter((v) => v.lang.startsWith('en'));
  if (en.length === 0) return null;
  if (preferredVoiceCache && en.some((v) => v.voiceURI === preferredVoiceCache?.voiceURI)) return preferredVoiceCache;
  const preferred = en.find((v) => v.lang.startsWith('en-US')) || en.find((v) => v.lang.startsWith('en-GB')) || en[0];
  preferredVoiceCache = preferred;
  return preferred;
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { preferredVoiceCache = null; getPreferredVoice(); };
}

const getTtsUrl = () => `${getVoiceApiBase()}/api/v1/tts`;

// Module-level: always readable/writable from any closure, never stale
let _aiSpeaking = false;
let _conversationHistory = []; // [{role, content}]
let _aiSpeakingClearTimer = null;
let _setSpeakingState = null; // set by component — drives the waveform UI
let _currentAudio = null; // live Audio object so we can stop mid-sentence
let _ttsAbortController = null; // AbortController for in-flight TTS fetch

function _setAiSpeaking(val) {
  _aiSpeaking = val;
  if (_aiSpeakingClearTimer) { clearTimeout(_aiSpeakingClearTimer); _aiSpeakingClearTimer = null; }
  if (_setSpeakingState) _setSpeakingState(val);
}

function stopCurrentSpeech() {
  // Abort TTS fetch if still in flight
  if (_ttsAbortController) { try { _ttsAbortController.abort(); } catch (_) {} _ttsAbortController = null; }
  // Stop playing audio — null handlers FIRST so onerror doesn't trigger _browserSpeak
  if (_currentAudio) {
    const a = _currentAudio;
    _currentAudio = null;
    a.onended = null; a.onerror = null;
    try { a.pause(); } catch (_) {}
  }
  // Stop browser speech synthesis
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  _setAiSpeaking(false);
}

function _browserSpeak(str, onStart) {
  if (!window.speechSynthesis) return;
  try { window.speechSynthesis.cancel(); } catch (_) {}
  if (window.speechSynthesis.paused) { try { window.speechSynthesis.resume(); } catch (_) {} }
  const u = new SpeechSynthesisUtterance(str);
  u.lang = 'en-US';
  u.rate = 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;
  try { const v = getPreferredVoice(); if (v) u.voice = v; } catch (_) {}
  u.onstart = () => { _setAiSpeaking(true); if (onStart) onStart(); };
  u.onend = () => { _aiSpeakingClearTimer = setTimeout(() => _setAiSpeaking(false), 700); };
  u.onerror = () => { _setAiSpeaking(false); if (onStart) onStart(); };
  setTimeout(() => { try { window.speechSynthesis.speak(u); } catch (_) {} }, 80);
}

function speak(text, onStart) {
  if (!text || typeof text !== 'string') return;
  const str = String(text).trim();
  if (!str) return;
  // Cancel any previous TTS in flight
  if (_ttsAbortController) { try { _ttsAbortController.abort(); } catch (_) {} }
  _ttsAbortController = new AbortController();
  const signal = _ttsAbortController.signal;
  fetch(getTtsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: str }),
    signal,
  })
    .then(res => {
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      return res.blob();
    })
    .then(blob => {
      if (signal.aborted) return; // user interrupted during fetch
      _ttsAbortController = null;
      _setAiSpeaking(true);
      if (onStart) onStart(); // reveal text the moment audio is ready to play
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended = () => { _currentAudio = null; URL.revokeObjectURL(url); _aiSpeakingClearTimer = setTimeout(() => _setAiSpeaking(false), 700); };
      audio.onerror = () => { _currentAudio = null; URL.revokeObjectURL(url); _setAiSpeaking(false); _browserSpeak(str); };
      audio.play().catch(() => { _currentAudio = null; _setAiSpeaking(false); _browserSpeak(str); });
    })
    .catch(err => {
      if (err?.name === 'AbortError') { if (onStart) onStart(); return; } // still reveal text on abort
      _browserSpeak(str, onStart);
    });
}

function playBeep(kind = 'start') {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('voiceBeepEnabled') === '0') return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = kind === 'start' ? 400 : 600;
    o.type = 'sine';
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.08);
  } catch (_) {}
}

function VoiceAgent({ language }) {
  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();
  const [listeningState, setListeningState] = useState(false);
  const setListening = useCallback((value) => {
    listeningRef.current = !!value;
    setListeningState(!!value);
  }, []);
  const listening = listeningState;
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingLinks, setPendingLinks] = useState([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const isStoppingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const clearBubbleTimeoutRef = useRef(null);
  const pendingConfirmRef = useRef(null);
  const ariaLiveRef = useRef(null);
  const wakeWordEnabledRef = useRef(true);
  const stopListeningRef = useRef(null);
  const startingRef = useRef(false);
  const listeningRef = useRef(false);
  const justActivatedByWakeRef = useRef(false);
  const ttsWaitingRef = useRef(false);
  // _conversationHistory lives at module level — always current inside any closure

  const announce = useCallback((text) => {
    if (ariaLiveRef.current) {
      ariaLiveRef.current.textContent = text || '';
    }
  }, []);

  const executeCommand = useCallback(async (action, payload) => {
    if (action === 'navigate' && payload?.path) {
      const path = payload.path.startsWith('/') ? payload.path : `/${payload.path}`;
      navigate(path);
    } else if (action === 'fill_field' && payload?.field && payload?.value != null) {
      window.dispatchEvent(new CustomEvent(VOICE_FILL_EVENT, {
        detail: { field: payload.field, value: String(payload.value) },
      }));
    } else if (action === 'clear_field' && payload?.field) {
      window.dispatchEvent(new CustomEvent(VOICE_CLEAR_FIELD_EVENT, {
        detail: { field: payload.field },
      }));
    } else if (action === 'print') {
      window.print();
    } else if (action === 'form_next') {
      window.dispatchEvent(new CustomEvent(VOICE_FORM_NEXT_EVENT));
    } else if (action === 'form_back') {
      window.dispatchEvent(new CustomEvent(VOICE_FORM_BACK_EVENT));
    } else if (action === 'help') {
      const msg = payload?.message || (isAr ? 'يمكنك قول أشياء مثل: اذهب للرئيسية، افتح التقييم، املأ العمر 35، متابعة أو رجوع، طباعة، تسجيل الخروج، أو قل شكراً للتوقف.' : isTr ? 'Şunları söyleyebilirsiniz: Ana sayfa, Test aç, Yaş 35 doldur, İleri veya Geri, Yazdır, Çıkış yap, veya durdurmak için Teşekkürler deyin.' : 'You can say things like: Go home, Open assessment, Fill age 35, Continue or Back, Print, Log out, or say Thank you to stop.');
      speak(msg);
      announce(msg);
    } else if (action === 'logout') {
      authLogout();
      navigate('/');
    } else if (action === 'refresh') {
      if (typeof window !== 'undefined') window.location.reload();
    } else if (action === 'scroll_down') {
      if (typeof window !== 'undefined') window.scrollBy({ top: 300, behavior: 'smooth' });
    } else if (action === 'scroll_up') {
      if (typeof window !== 'undefined') window.scrollBy({ top: -300, behavior: 'smooth' });
    } else if (action === 'find_nearest_hospital') {
      navigate('/hospitals');
      if (typeof window !== 'undefined') {
        setTimeout(() => window.dispatchEvent(new CustomEvent(VOICE_FIND_NEAREST_HOSPITAL)), 100);
      }
    } else if (action === 'open_tab' && payload?.url) {
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    }
  }, [navigate, authLogout, announce]);

  const processTranscript = useCallback(async (text) => {
    const raw = (text || '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (raw.length < MIN_UTTERANCE_LENGTH) return;
    if (FILLER_WORDS.has(lower)) return;

    if (clearBubbleTimeoutRef.current) {
      clearTimeout(clearBubbleTimeoutRef.current);
      clearBubbleTimeoutRef.current = null;
    }

    const pending = pendingConfirmRef.current;
    if (pending) {
      if (/\b(yes|confirm|yeah|sure|ok|okay|yep|yup)\b/.test(lower)) {
        pendingConfirmRef.current = null;
        if (pending.reply) speak(pending.reply);
        await executeCommand(pending.action, pending.payload || {});
        playBeep('command');
        setLoading(false);
        return;
      } else if (/\b(no|cancel|nevermind|never mind|nope|nah)\b/.test(lower)) {
        pendingConfirmRef.current = null;
        speak(isAr ? 'لا مشكلة، تم الإلغاء.' : isTr ? 'Tamam, iptal edildi.' : 'No problem, cancelled.');
        setLoading(false);
        return;
      } else {
        // Not a yes/no — clear pending and process the command normally
        pendingConfirmRef.current = null;
      }
    }

    // Early open-site check — BEFORE any await so window.open isn't blocked
    const openSite = tryOpenSite(raw);
    if (openSite) {
      window.open(openSite.url, '_blank', 'noopener,noreferrer');
      const label = openSite.label;
      const confirmation = `Opening ${label}.`;
      // No agent call — speak a direct confirmation so the LLM can't contradict
      setLoading(true);
      speak(confirmation, () => {
        setTranscript(confirmation);
        setLoading(false);
        _conversationHistory = [
          ..._conversationHistory.slice(-8),
          { role: 'user', content: raw },
          { role: 'assistant', content: confirmation },
        ];
      });
      clearBubbleTimeoutRef.current = setTimeout(() => {
        setTranscript(''); setError(''); setPendingLinks([]);
        clearBubbleTimeoutRef.current = null;
      }, 8000);
      return;
    }

    const hardcoded = tryHardcodedCommand(raw);
    if (hardcoded) {
      setTranscript(raw);
      if (hardcoded.action === 'logout') {
        pendingConfirmRef.current = { action: 'logout', payload: {}, reply: isAr ? 'تسجيل الخروج.' : isTr ? 'Çıkış yapılıyor.' : 'Logging out.' };
        speak(isAr ? 'هل أنت متأكد أنك تريد تسجيل الخروج؟' : isTr ? 'Çıkış yapmak istediğinizden emin misiniz?' : 'Are you sure you want to log out?');
        announce(isAr ? 'هل أنت متأكد أنك تريد تسجيل الخروج؟' : isTr ? 'Çıkış yapmak istediğinizden emin misiniz?' : 'Are you sure you want to log out?');
        return;
      }
      if (hardcoded.reply && hardcoded.action === 'help') {
        speak(hardcoded.reply);
        announce(hardcoded.reply);
      }
      executeCommand(hardcoded.action, hardcoded.payload || {}).then(() => playBeep('command'));
      setTimeout(() => { setTranscript(''); setError(''); }, 1800);
      return;
    }

    // Go straight to AI agent — no intermediate voice-command hop
    setTranscript(raw);
    setLoading(true);
    setError('');
    setPermissionDenied(false);
    try {
      const res = await fetch(`${getVoiceApiBase()}/api/v1/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw, history: _conversationHistory.slice(-6) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || `Backend ${res.status}`);
        speak(isAr ? 'لم أتمكن من الوصول إلى الخادم.' : isTr ? 'Sunucuya ulaşılamadı.' : "I couldn't reach the server.");
        return;
      }
      if (data.reply) {
        _conversationHistory = [
          ..._conversationHistory.slice(-8),
          { role: 'user', content: raw },
          { role: 'assistant', content: data.reply },
        ];

        // Navigation query → answer then ask if user wants Maps
        const destination = _extractNavDestination(raw);
        if (destination) {
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
          const question = 'Want me to open that on Google Maps?';
          const fullReply = `${data.reply} ... ${question}`;
          ttsWaitingRef.current = true;
          speak(fullReply, () => {
            ttsWaitingRef.current = false;
            setTranscript(fullReply);
            announce(fullReply);
            setLoading(false);
          });
          pendingConfirmRef.current = {
            action: 'open_tab',
            payload: { url: mapsUrl },
            reply: `Opening ${destination} on Maps.`,
          };
        } else {
          const links = (data.actions || []).filter(a => a.action === 'open_tab' && a.url);
          for (const act of links) await executeCommand(act.action, act);
          if (links.length > 0) setPendingLinks(links);
          ttsWaitingRef.current = true;
          speak(data.reply, () => {
            ttsWaitingRef.current = false;
            setTranscript(data.reply);
            announce(data.reply);
            setLoading(false);
          });
        }
        playBeep('command');
      }
      clearBubbleTimeoutRef.current = setTimeout(() => {
        setTranscript(''); setError(''); setPendingLinks([]);
        clearBubbleTimeoutRef.current = null;
      }, 12000);
    } catch (err) {
      setError(err.message || 'Network error.');
      speak(isAr ? 'خطأ في الاتصال.' : isTr ? 'Bağlantı hatası.' : "Connection error.");
    } finally {
      if (!ttsWaitingRef.current) setLoading(false);
    }
  }, [executeCommand, announce]);

  // Wake word disabled by default — click the button and speak directly, no "Hey Bonus Life" needed
  const wakeWordEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('voiceWakeWordEnabled') === '1';
  wakeWordEnabledRef.current = wakeWordEnabled;

  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en';
    recognition.maxAlternatives = 3;

    recognition.onresult = (e) => {
      // Ignore mic while AI is speaking — prevents AI hearing itself
      if (_aiSpeaking) return;

      const lastResult = e.results[e.results.length - 1];
      const t = lastResult?.[0]?.transcript?.trim();

      // When listening for wake word, build full transcript from all results (API often splits "Hey Bonus Life" into separate finals)
      if (!sessionActiveRef.current && wakeWordEnabledRef.current) {
        let full = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0]?.transcript?.trim();
          if (!text) continue;
          if (r.isFinal) full += text + ' ';
          else if (i === e.results.length - 1) full += text + ' ';
        }
        full = full.trim();
        // Also check last 4 segments in case result list is very long (e.g. after many utterances)
        let recent = '';
        const start = Math.max(0, e.results.length - 4);
        for (let i = start; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0]?.transcript?.trim();
          if (text) recent += text + ' ';
        }
        recent = recent.trim();
        const toMatch = recent.length >= 10 ? recent : full;
        if (toMatch && matchWakePhrase(toMatch)) {
          sessionActiveRef.current = true;
          justActivatedByWakeRef.current = true;
          setTimeout(() => setListening(true), 0);
          playBeep('start');
          announce('Listening. Say a command or say thank you to stop.');
        }
        return;
      }

      if (!lastResult || !lastResult.isFinal || !t) return;
      // When wake word is disabled (default), treat as always active while mic is on
      if (!sessionActiveRef.current && !wakeWordEnabledRef.current) {
        sessionActiveRef.current = true;
      }
      if (sessionActiveRef.current) {
        if (matchStopPhrase(t)) {
          stopCurrentSpeech();
          speak("You're welcome.");
          announce('You\'re welcome.');
          stopListeningRef.current?.();
          return;
        }
        if (justActivatedByWakeRef.current && matchWakePhrase(t)) {
          justActivatedByWakeRef.current = false;
          return;
        }
        justActivatedByWakeRef.current = false;
        processTranscript(t);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        isStoppingRef.current = true;
        recognitionRef.current = null;
        sessionActiveRef.current = false;
        setListening(false);
        setPermissionDenied(true);
        setError(isAr ? 'تم رفض الوصول إلى الميكروفون.' : isTr ? 'Mikrofon erişimi reddedildi.' : 'Microphone access denied.');
        speak(isAr ? "تم رفض الوصول للميكروفون. يمكنك السماح به من إعدادات المتصفح، أو انقر على إعادة المحاولة لمنح الوصول." : isTr ? "Mikrofon erişimi reddedildi. Tarayıcı ayarlarından izin verebilirsiniz." : "Microphone access was denied. You can allow it in your browser settings, or click Try again to grant access.");
      } else if (e.error === 'audio-capture' || e.error === 'no-speech') {
        if (e.error === 'no-speech') return;
        recognitionRef.current = null;
        setListening(false);
        setError(e.error === 'audio-capture' ? (isAr ? 'لم يتم العثور على ميكروفون.' : isTr ? 'Mikrofon bulunamadı.' : 'No microphone found.') : '');
      } else if (e.error !== 'aborted') {
        recognitionRef.current = null;
        setListening(false);
        const SR_ERRORS = {
          network: isAr ? 'خطأ في شبكة التحدث — تحقق من الإنترنت.' : isTr ? 'Ağ hatası — bağlantı kontrol edin.' : 'Speech network error — check internet.',
          'service-not-allowed': isAr ? 'خدمة التحدث غير مسموح بها.' : isTr ? 'Konuşma servisi izin vermedi.' : 'Speech service not allowed.',
          'bad-grammar': isAr ? 'خطأ لغوي.' : isTr ? 'Dil hatası.' : 'Grammar error.',
        };
        const errMsg = SR_ERRORS[e.error] || e.error || (isAr ? 'خطأ في الاستماع' : isTr ? 'Dinleme hatası' : 'Listening error');
        setError(errMsg);
        // Auto-dismiss non-critical errors after 4 seconds
        setTimeout(() => setError(''), 4000);
      }
    };

    recognition.onend = () => {
      if (!isStoppingRef.current && wakeWordEnabledRef.current) {
        // Short delay before restart so browser is ready; keeps wake word listening alive
        setTimeout(() => {
          try {
            if (recognitionRef.current === recognition) recognition.start();
          } catch (_) {
            recognitionRef.current = null;
            setListening(false);
          }
        }, 150);
      } else {
        setListening(false);
        sessionActiveRef.current = false;
        if (!wakeWordEnabledRef.current) recognitionRef.current = null;
        isStoppingRef.current = false;
      }
    };

    return recognition;
  }, [processTranscript, announce]);

  const startListening = useCallback(() => {
    if (listeningRef.current && recognitionRef.current) return;
    if (startingRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(isAr ? 'الصوت غير مدعوم في هذا المتصفح. جرب Chrome.' : isTr ? 'Bu tarayıcıda ses desteklenmiyor. Chrome deneyin.' : 'Voice not supported in this browser. Try Chrome.');
      startingRef.current = false;
      return;
    }

    startingRef.current = true;
    setError('');
    setTranscript('');
    flushSync(() => {
      setListeningState(true);
      listeningRef.current = true;
    });

    isStoppingRef.current = false;

    setTimeout(() => {
      try {
        let recognition = recognitionRef.current;
        if (recognition) {
          sessionActiveRef.current = true;
          justActivatedByWakeRef.current = false;
          setTimeout(() => playBeep('start'), 200);
          return;
        }

        recognition = createRecognition();
        if (!recognition) {
          setError(isAr ? 'الصوت غير مدعوم في هذا المتصفح. جرب Chrome.' : isTr ? 'Bu tarayıcıda ses desteklenmiyor. Chrome deneyin.' : 'Voice not supported in this browser. Try Chrome.');
          setListening(false);
          return;
        }
        recognitionRef.current = recognition;
        sessionActiveRef.current = true;
        try {
          recognition.start();
        } catch (err) {
          recognitionRef.current = null;
          setListening(false);
          setError(err?.message || (isAr ? 'تعذر تشغيل الميكروفون. اسمح بالوصول وحاول مجدداً.' : isTr ? 'Mikrofon başlatılamadı. Mikrofon erişimine izin verin.' : 'Could not start microphone. Allow mic access and try again.'));
          return;
        }
        justActivatedByWakeRef.current = false;
        setTimeout(() => playBeep('start'), 200);
      } finally {
        startingRef.current = false;
      }
    }, 0);
  }, [createRecognition]);

  // Wake-word: recognition starts only when user clicks the button (no auto-start on load).

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      sessionActiveRef.current = false;
      return;
    }
    sessionActiveRef.current = false;
    setListening(false);
    if (wakeWordEnabled) {
      // Keep recognition running so wake word "Hey Bonus Life" can be heard again
      isStoppingRef.current = false;
    } else {
      isStoppingRef.current = true;
      try {
        recognition.stop();
      } catch (_) {}
    }
  }, [wakeWordEnabled]);

  stopListeningRef.current = stopListening;
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  const handleToggle = useCallback(() => {
    // Check if audio is active BEFORE stopping (module-level vars are always fresh)
    const wasActive = _aiSpeaking || !!_ttsAbortController || isSpeaking;
    // Always clean up any ongoing speech / fetch
    stopCurrentSpeech();
    ttsWaitingRef.current = false;
    setLoading(false);
    // If we just interrupted speech, don't also toggle the mic
    if (wasActive) return;
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening, isSpeaking]);

  useEffect(() => {
    const handler = () => startListeningRef.current();
    window.addEventListener('bonuslife-open-voice-agent', handler);
    return () => window.removeEventListener('bonuslife-open-voice-agent', handler);
  }, []);

  useEffect(() => {
    _setSpeakingState = setIsSpeaking;
    return () => { _setSpeakingState = null; };
  }, []);

  return (
    <>
      <div ref={ariaLiveRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      {listening && (
        <div
          className="voice-listening-glow fixed inset-0 pointer-events-none z-40"
          aria-hidden
        />
      )}
      {permissionDenied && (
        <div className={`fixed bottom-24 ${isAr ? 'left-6' : 'right-6'} z-50 rounded-2xl bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-red-500/50 px-4 py-3 shadow-xl max-w-xs voice-agent-card`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-red-600 dark:text-red-300 mb-2">{isAr ? 'تم رفض الوصول إلى الميكروفون.' : isTr ? 'Mikrofon erişimi reddedildi.' : 'Microphone access denied.'}</p>
              <button type="button" onClick={() => { setPermissionDenied(false); setError(''); startListening(); }} className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline">{isTr ? 'Tekrar dene' : 'Try again'}</button>
            </div>
            <button
              type="button"
              onClick={() => { setPermissionDenied(false); setError(''); }}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className={`fixed bottom-6 ${isAr ? 'left-6' : 'right-6'} z-[10002] flex flex-col ${isAr ? 'items-start' : 'items-end'} gap-2 pointer-events-none`}>
        <style>{`
          @keyframes va-bar { 0%,100%{transform:scaleY(0.35)} 50%{transform:scaleY(1)} }
          @keyframes va-dot { 0%,80%,100%{transform:translateY(0);opacity:.35} 40%{transform:translateY(-5px);opacity:1} }
          @keyframes va-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* Voice reply bubble */}
        {(transcript || error || pendingLinks.length > 0 || loading) && (
          <div
            className="pointer-events-auto w-80 rounded-2xl overflow-hidden"
            style={{
              animation: 'va-fadein 0.2s ease-out',
              background: 'linear-gradient(145deg,rgba(8,8,20,0.97) 0%,rgba(18,8,40,0.97) 100%)',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 0 0 1px rgba(124,58,237,0.3),0 0 48px rgba(124,58,237,0.1),0 24px 64px rgba(0,0,0,0.65)',
            }}
          >
            {/* Top gradient accent bar */}
            <div style={{ height: 2, background: 'linear-gradient(90deg,#6d28d9,#a78bfa,#7c3aed)' }} />

            <div className="px-4 pt-3 pb-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="relative w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)' }}>
                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                    {isSpeaking && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-400"
                        style={{ animation: 'va-bar 0.8s ease-in-out infinite' }} />
                    )}
                  </div>
                  <span className="text-[10px] font-bold tracking-[0.15em] text-violet-400 uppercase">AI Assistant</span>
                  {isSpeaking && (
                    <div className="flex items-end gap-0.5 h-3 ml-0.5">
                      {[0, 0.12, 0.24, 0.12, 0].map((d, i) => (
                        <div key={i} className="w-0.5 rounded-full bg-violet-400 origin-bottom"
                          style={{ height: 10, animation: `va-bar 0.65s ease-in-out ${d}s infinite` }} />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setError(''); setTranscript(''); setPendingLinks([]); pendingConfirmRef.current = null; }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Loading dots — shown before first reply */}
              {loading && !transcript && !error && (
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 0.18, 0.36].map((d, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400"
                      style={{ animation: `va-dot 1.1s ease-in-out ${d}s infinite` }} />
                  ))}
                </div>
              )}

              {/* Reply text */}
              {error && <p className="text-sm text-red-400 leading-relaxed">{error}</p>}
              {transcript && !error && (
                <p className="text-sm leading-relaxed font-light" style={{ color: 'rgba(240,235,255,0.92)' }}>
                  {transcript}
                </p>
              )}

              {/* Still loading after first text arrived */}
              {loading && transcript && (
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-1 h-1 rounded-full bg-violet-400/50 animate-pulse" />
                  <span className="text-[10px] tracking-wide text-violet-400/50">Processing…</span>
                </div>
              )}

              {/* Pending action links */}
              {pendingLinks.map((lnk, i) => (
                <a
                  key={i}
                  href={lnk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPendingLinks([])}
                  className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:brightness-110 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
                >
                  <span className="truncate">{lnk.label || lnk.url}</span>
                  <span className="shrink-0 text-violet-300">↗</span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="pointer-events-auto">
          {listening ? (
            <ShineBorder
              borderRadius={18}
              borderWidth={2}
              duration={6}
              color={['#7C3AED', '#A78BFA', '#C4B5FD', '#6D28D9']}
              className="voice-agent-bar"
              style={{ background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(124,58,237,0.25)' }}
            >
              <div className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-semibold text-white">AI Assistant</span>
                  <span className="text-xs text-gray-400">{isAr ? 'جارِ الاستماع...' : isTr ? 'Sizi dinliyorum…' : 'Listening…'}</span>
                </div>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: 'radial-gradient(circle, #a78bfa, #7c3aed)' }} aria-hidden />
                <button
                  type="button"
                  onClick={stopListening}
                  aria-label={isAr ? 'إغلاق' : isTr ? 'Kapat' : 'Close'}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </ShineBorder>
          ) : (
            <LiquidMetalButton onClick={handleToggle} width={200} className="voice-agent-trigger">
              <MessageCircle className="w-4 h-4 shrink-0" />
              {isAr ? 'مساعد الذكاء الاصطناعي' : isTr ? 'AI Asistan' : 'AI Assistant'}
            </LiquidMetalButton>
          )}
        </div>
      </div>
    </>
  );
}

export default React.memo(VoiceAgent);
export { VOICE_FILL_EVENT, VOICE_CLEAR_FIELD_EVENT, VOICE_FORM_NEXT_EVENT, VOICE_FORM_BACK_EVENT };
