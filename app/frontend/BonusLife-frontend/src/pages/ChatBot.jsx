import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bot, User, Trash2, RefreshCw, AlertTriangle,
  Wifi, WifiOff, Paperclip, Command, SendIcon, XIcon, LoaderIcon,
  Stethoscope, Apple, Dumbbell, Brain, Activity, HeartPulse, ArrowLeft,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { API_BASE_URL, ROUTES } from '../config/constants';
import { getStoredToken } from '../services/api';

/* ── Auto-resize textarea ── */
function useAutoResizeTextarea({ minHeight, maxHeight }) {
  const textareaRef = useRef(null);
  const adjustHeight = useCallback((reset) => {
    const el = textareaRef.current;
    if (!el) return;
    if (reset) { el.style.height = `${minHeight}px`; return; }
    el.style.height = `${minHeight}px`;
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight ?? Infinity))}px`;
  }, [minHeight, maxHeight]);
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);
  return { textareaRef, adjustHeight };
}

/* ── Typing dots ── */
function TypingDots() {
  return (
    <div className="flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#A78BFA' }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ── Message bubble ── */
function MessageBubble({ msg, t, connected, onQuick }) {
  return (
    <motion.div
      className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1"
        style={msg.sender === 'user' ? {
          background: 'linear-gradient(135deg,#7C3AED,#06B6D4)',
          boxShadow: '0 0 12px rgba(124,58,237,0.35)',
        } : msg.isError ? {
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
        } : {
          background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
        }}>
        {msg.sender === 'user'
          ? <User className="w-3.5 h-3.5 text-white" />
          : <Bot className="w-3.5 h-3.5" style={{ color: msg.isError ? '#F87171' : '#A78BFA' }} />}
      </div>
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${msg.sender === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        style={msg.sender === 'user' ? {
          background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.18)',
        } : msg.isError ? {
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
        } : {
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
        <div className="text-sm text-gray-200 leading-relaxed">
          <ReactMarkdown components={{
            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li className="ml-1">{children}</li>,
          }}>{msg.text}</ReactMarkdown>
        </div>
        {msg.suggestions?.length > 0 && (
          <div className="mt-2.5 pt-2.5 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {msg.suggestions.map((s, i) => (
              <button key={i} onClick={() => onQuick(s)} disabled={!connected}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)', color: '#C4B5FD' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'rgba(156,163,175,0.5)' }}>
            {msg.sender === 'user' ? t.you : msg.isError ? t.error : t.ai}
            {msg.isLLMResponse && <span className="ml-1" style={{ color: '#A78BFA' }}>• {t.live}</span>}
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(156,163,175,0.4)' }}>
            {msg.timestamp.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════
   Main ChatBot Component
══════════════════════════════════════════ */
const ChatBot = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [llmProvider, setLlmProvider] = useState('Groq');
  const [retryCount, setRetryCount] = useState(0);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [activeCmd, setActiveCmd] = useState(-1);
  const [attachments, setAttachments] = useState([]);
  const [chatStarted, setChatStarted] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesRef = useRef(null);
  const cmdPaletteRef = useRef(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 56, maxHeight: 180 });

  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const t = {
    heading: isAr ? 'كيف يمكنني مساعدتك اليوم؟' : isTr ? 'Size nasıl yardımcı olabilirim?' : 'How can I help today?',
    subheading: isAr ? 'اسأل سؤالاً حول السكري أو صحتك' : isTr ? 'Diyabet veya sağlık hakkında bir soru sorun' : 'Ask a question about diabetes or your health',
    placeholder: isAr ? 'اسأل سؤالاً...' : isTr ? 'Bir soru sorun...' : 'Ask a question...',
    placeholderOff: isAr ? 'في انتظار الاتصال...' : isTr ? 'Bağlantı bekleniyor...' : 'Waiting for connection...',
    thinking: isAr ? 'يفكر' : isTr ? 'Düşünüyor' : 'Thinking',
    you: isAr ? 'أنت' : isTr ? 'Siz' : 'You',
    ai: 'AI', error: isAr ? 'خطأ' : isTr ? 'Hata' : 'Error', live: 'Live',
    close: isAr ? 'إغلاق' : isTr ? 'Kapat' : 'Close',
    online: `Online — ${llmProvider}`,
    offline: isAr ? 'غير متصل' : isTr ? 'Çevrimdışı' : 'Offline',
    connecting: isAr ? 'جارِ الاتصال...' : isTr ? 'Bağlanıyor...' : 'Connecting...',
    unavailable: isAr ? 'الذكاء الاصطناعي غير متاح. يرجى المحاولة مرة أخرى لاحقاً.' : isTr ? 'Yapay zeka şu an kullanılamıyor.' : 'AI unavailable. Please try again later.',
    requestTimeout: isAr ? 'انتهت مهلة الطلب' : isTr ? 'Zaman aşımı' : 'Request timeout',
    connectionError: isAr ? 'خطأ في الاتصال.' : isTr ? 'Bağlantı hatası.' : 'Connection error.',
    send: isAr ? 'إرسال' : isTr ? 'Gönder' : 'Send',
    sending: isAr ? 'جارِ الإرسال' : isTr ? 'Gönderiliyor' : 'Sending',
    cmdNavigate: isAr ? '↑↓ تنقّل' : isTr ? '↑↓ gezin' : '↑↓ navigate',
    cmdSelect: isAr ? '↵ اختر' : isTr ? '↵ seç' : '↵ select',
    cmdClose: isAr ? 'Esc إغلاق' : isTr ? 'Esc kapat' : 'Esc close',
    quickCommands: isAr ? 'أوامر سريعة' : isTr ? 'Hızlı Komutlar' : 'Quick Commands',
  };

  const commands = [
    { icon: <Stethoscope className="w-4 h-4" />, label: isAr ? 'الأعراض' : isTr ? 'Semptomlar' : 'Symptoms', desc: isAr ? 'أعراض السكري' : isTr ? 'Diyabet belirtileri' : 'Diabetes symptoms', prefix: '/symptoms' },
    { icon: <Apple className="w-4 h-4" />, label: isAr ? 'النظام الغذائي' : isTr ? 'Diyet' : 'Diet', desc: isAr ? 'نصائح التغذية' : isTr ? 'Beslenme önerileri' : 'Nutrition tips', prefix: '/diet' },
    { icon: <Dumbbell className="w-4 h-4" />, label: isAr ? 'التمرين' : isTr ? 'Egzersiz' : 'Exercise', desc: isAr ? 'النشاط البدني' : isTr ? 'Fiziksel aktivite' : 'Physical activity', prefix: '/exercise' },
    { icon: <Brain className="w-4 h-4" />, label: isAr ? 'الوقاية' : isTr ? 'Önleme' : 'Prevention', desc: isAr ? 'تقليل المخاطر' : isTr ? 'Risk azaltma' : 'Risk reduction', prefix: '/prevention' },
    { icon: <Activity className="w-4 h-4" />, label: isAr ? 'العلاج' : isTr ? 'Tedavi' : 'Treatment', desc: isAr ? 'خيارات العلاج' : isTr ? 'Tedavi seçenekleri' : 'Treatment options', prefix: '/treatment' },
    { icon: <HeartPulse className="w-4 h-4" />, label: isAr ? 'المضاعفات' : isTr ? 'Komplikasyonlar' : 'Complications', desc: isAr ? 'الآثار طويلة المدى' : isTr ? 'Uzun vadeli etkiler' : 'Long-term effects', prefix: '/complications' },
  ];

  const connected = backendStatus === 'connected';

  /* ── Effects ── */
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/v1/users/me/assessments?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length > 0) setLatestAssessment(d[0]); }
      } catch {}
    })();
  }, []);

  useEffect(() => { initConversation(); checkConnection(); }, [language]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const h = e => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  useEffect(() => {
    const h = e => {
      const btn = document.querySelector('[data-cmd-btn]');
      if (cmdPaletteRef.current && !cmdPaletteRef.current.contains(e.target) && !btn?.contains(e.target))
        setShowCmdPalette(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ')) {
      setShowCmdPalette(true);
      const i = commands.findIndex(c => c.prefix.startsWith(input));
      setActiveCmd(i >= 0 ? i : -1);
    } else {
      setShowCmdPalette(false);
    }
  }, [input]);

  /* ── API ── */
  const checkConnection = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/health`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setBackendStatus('connected'); setError('');
      if (d?.services?.llm_provider) setLlmProvider(d.services.llm_provider);
    } catch { setBackendStatus('disconnected'); }
  };

  const initConversation = () => {
    setConversationId(`conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    setMessages([]);
    setChatStarted(false);
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { text, sender: 'user', timestamp: new Date(), id: Date.now() };
    setMessages(p => [...p, userMsg]);
    setChatStarted(true);
    setInput(''); adjustHeight(true);
    setLoading(true); setError('');

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(`${API_BASE_URL}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, language, conversation_context: 'diabetes_medical_advice',
          conversation_id: conversationId, require_llm: true,
          timestamp: new Date().toISOString(), message_type: 'user_query',
          ...(latestAssessment ? { user_context: `Risk: ${latestAssessment.risk_level}, Prob: ${(latestAssessment.probability * 100).toFixed(0)}%` } : {}),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) { let m = `HTTP ${res.status}`; try { const d = await res.json(); m = d.detail || m; } catch {} throw new Error(m); }
      const data = await res.json();
      const reply = data.response || data.message || '';
      if (!reply) throw new Error('Empty response');
      setMessages(p => [...p, {
        text: reply, sender: 'bot', timestamp: new Date(), id: Date.now() + 1,
        isLLMResponse: true, suggestions: data.suggestions || genSuggestions(language, reply),
      }]);
      setBackendStatus('connected'); setRetryCount(0);
    } catch (err) {
      const msg = err.name === 'AbortError' ? t.requestTimeout : err.message;
      setError(msg); setBackendStatus('disconnected'); setRetryCount(r => r + 1);
      const display = (msg || '').toLowerCase().includes('unavailable') ? t.unavailable : `${t.connectionError} ${msg}`;
      setMessages(p => [...p, { text: display, sender: 'bot', timestamp: new Date(), id: Date.now() + 1, isError: true }]);
    } finally { setLoading(false); }
  };

  const genSuggestions = (lang, r) => {
    const l = (r || '').toLowerCase();
    if (lang === 'arabic') {
      if (l.includes('سكر الدم') || l.includes('الجلوكوز') || l.includes('الغلوكوز')) return ['ما هي النطاقات الطبيعية؟', 'أطعمة تساعد في التحكم بسكر الدم'];
      if (l.includes('خطر') || l.includes('الوقاية')) return ['تغييرات نمط الحياة؟', 'علامات التحذير المبكرة'];
      return ['اشرح أكثر', 'ما هي خيارات العلاج؟'];
    }
    if (lang === 'turkish') {
      if (l.includes('kan şekeri') || l.includes('glukoz')) return ['Normal aralıklar?', 'Kan şekerini kontrol eden besinler'];
      if (l.includes('risk') || l.includes('önle')) return ['Yaşam tarzı değişiklikleri?', 'Erken belirtiler'];
      return ['Daha fazla açıkla', 'Tedavi seçenekleri?'];
    }
    if (l.includes('blood sugar') || l.includes('glucose')) return ['Normal ranges?', 'Foods for blood sugar control'];
    if (l.includes('risk') || l.includes('prevent')) return ['Lifestyle changes?', 'Early warning signs'];
    return ['Explain more', 'Treatment options?'];
  };

  const selectCmd = (i) => {
    const c = commands[i];
    setInput(c.prefix + ' ');
    setShowCmdPalette(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e) => {
    if (showCmdPalette) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveCmd(p => (p + 1) % commands.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveCmd(p => p <= 0 ? commands.length - 1 : p - 1); }
      else if ((e.key === 'Tab' || e.key === 'Enter') && activeCmd >= 0) { e.preventDefault(); selectCmd(activeCmd); }
      else if (e.key === 'Escape') { e.preventDefault(); setShowCmdPalette(false); }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && connected) sendMessage(input);
    }
  };

  const hasInput = input.trim().length > 0;

  /* ── Render ── */
  return (
    <div className="min-h-screen flex flex-col pt-20" style={{ fontFamily: "'Figtree','Inter',sans-serif", background: '#050508' }}>

      {/* Back to Dashboard */}
      <div className="px-4 sm:px-6 pt-4 max-w-4xl mx-auto w-full">
        <button onClick={() => navigate(ROUTES.DASHBOARD)}
          className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          {isAr ? 'العودة للوحة التحكم' : isTr ? 'Panele Dön' : 'Back to Dashboard'}
        </button>
      </div>

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full" style={{ background: 'rgba(124,58,237,0.06)', filter: 'blur(120px)', animation: 'pulse 4s ease-in-out infinite' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full" style={{ background: 'rgba(6,182,212,0.05)', filter: 'blur(100px)', animation: 'pulse 5s ease-in-out infinite 1.5s' }} />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full" style={{ background: 'rgba(168,85,247,0.04)', filter: 'blur(80px)', animation: 'pulse 6s ease-in-out infinite 3s' }} />
      </div>

      {/* Mouse glow when typing */}
      <AnimatePresence>
        {inputFocused && (
          <motion.div
            className="fixed w-[600px] h-[600px] rounded-full pointer-events-none z-0"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 65%)', filter: 'blur(40px)' }}
            animate={{ x: mousePos.x - 300, y: mousePos.y - 300 }}
            transition={{ type: 'spring', damping: 30, stiffness: 120, mass: 0.8 }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-2xl mx-auto px-4 pb-8">

        {/* ── Hero heading (hides when chat starts) ── */}
        <AnimatePresence>
          {!chatStarted && (
            <motion.div
              className="text-center pt-16 pb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ duration: 0.4 }}
            >
              <motion.h1
                className="text-4xl sm:text-5xl font-semibold tracking-tight mb-3"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {t.heading}
              </motion.h1>
              <motion.div
                className="h-px w-64 mx-auto mb-3"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 256, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              />
              <motion.p
                className="text-sm"
                style={{ color: 'rgba(255,255,255,0.38)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                {t.subheading}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat history (appears when conversation starts) ── */}
        <AnimatePresence>
          {chatStarted && (
            <motion.div
              ref={messagesRef}
              className="flex-1 overflow-y-auto space-y-4 pb-4 pt-6"
              style={{ maxHeight: 'calc(100vh - 320px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} t={t} connected={connected} onQuick={sendMessage} />
              ))}
              <AnimatePresence>
                {loading && (
                  <motion.div className="flex gap-3"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center mt-1"
                      style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' }}>
                      <Bot className="w-3.5 h-3.5" style={{ color: '#A78BFA' }} />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-sm" style={{ color: 'rgba(156,163,175,0.7)' }}>{t.thinking}</span>
                      <TypingDots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Input card ── */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          {/* Command palette */}
          <AnimatePresence>
            {showCmdPalette && (
              <motion.div
                ref={cmdPaletteRef}
                className="absolute left-0 right-0 bottom-full mb-2 z-50 rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(6,4,16,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(24px)',
                  boxShadow: '0 -24px 60px rgba(0,0,0,0.6)',
                }}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
              >
                <div className="p-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest px-3 pt-2 pb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {t.quickCommands}
                  </p>
                  {commands.map((cmd, i) => (
                    <motion.div
                      key={cmd.prefix}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{
                        background: activeCmd === i ? 'rgba(124,58,237,0.12)' : 'transparent',
                        border: activeCmd === i ? '1px solid rgba(124,58,237,0.2)' : '1px solid transparent',
                      }}
                      onClick={() => selectCmd(i)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      onMouseEnter={() => setActiveCmd(i)}
                    >
                      <span style={{ color: activeCmd === i ? '#A78BFA' : 'rgba(255,255,255,0.3)' }}>{cmd.icon}</span>
                      <span className="text-sm font-medium" style={{ color: activeCmd === i ? 'white' : 'rgba(255,255,255,0.65)' }}>{cmd.label}</span>
                      <span className="text-xs font-mono" style={{ color: 'rgba(167,139,250,0.5)' }}>{cmd.prefix}</span>
                      <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{cmd.desc}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="px-4 py-2 flex gap-4 text-[10px]" style={{ color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span>{t.cmdNavigate}</span><span>{t.cmdSelect}</span><span>{t.cmdClose}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main input card */}
          <div className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}>

            {/* Attachments */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div className="px-4 pt-3 flex gap-2 flex-wrap"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {attachments.map((f, i) => (
                    <motion.span key={i}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)', color: '#C4B5FD' }}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                      {f}
                      <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))}
                        className="opacity-50 hover:opacity-100 transition-opacity">
                        <XIcon className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="px-4 pt-4 pb-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); adjustHeight(); }}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                disabled={loading || !connected}
                placeholder={connected ? t.placeholder : t.placeholderOff}
                className="w-full resize-none bg-transparent text-sm outline-none disabled:opacity-40"
                style={{
                  minHeight: '56px',
                  color: 'rgba(255,255,255,0.88)',
                  caretColor: '#A78BFA',
                  lineHeight: '1.6',
                }}
              />
            </div>

            {/* Toolbar */}
            <div className="px-3 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* Attach */}
                <motion.button type="button" whileTap={{ scale: 0.9 }}
                  onClick={() => setAttachments(p => [...p, `file-${Math.floor(Math.random()*999)}.pdf`])}
                  className="p-2 rounded-xl transition-all"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#A78BFA'; e.currentTarget.style.background = 'rgba(124,58,237,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}>
                  <Paperclip className="w-4 h-4" />
                </motion.button>

                {/* Command */}
                <motion.button type="button" whileTap={{ scale: 0.9 }}
                  data-cmd-btn
                  onClick={e => { e.stopPropagation(); setShowCmdPalette(p => !p); }}
                  className="p-2 rounded-xl transition-all"
                  style={{
                    color: showCmdPalette ? '#A78BFA' : 'rgba(255,255,255,0.3)',
                    background: showCmdPalette ? 'rgba(124,58,237,0.12)' : 'transparent',
                  }}>
                  <Command className="w-4 h-4" />
                </motion.button>

                {/* Conversation controls */}
                {chatStarted && (
                  <>
                    <motion.button type="button" whileTap={{ scale: 0.9 }}
                      onClick={checkConnection}
                      className="p-2 rounded-xl transition-all"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#A78BFA'; e.currentTarget.style.background = 'rgba(124,58,237,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}>
                      <RefreshCw className="w-4 h-4" />
                    </motion.button>
                    <motion.button type="button" whileTap={{ scale: 0.9 }}
                      onClick={() => { initConversation(); setError(''); }}
                      className="p-2 rounded-xl transition-all"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent'; }}>
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </>
                )}
              </div>

              {/* Send */}
              <motion.button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!hasInput || loading || !connected}
                whileHover={hasInput && !loading ? { scale: 1.03, y: -1 } : {}}
                whileTap={hasInput && !loading ? { scale: 0.96 } : {}}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
                style={hasInput && !loading ? {
                  background: 'white',
                  color: '#09090b',
                  boxShadow: '0 4px 20px rgba(255,255,255,0.15)',
                } : {
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                {loading
                  ? <><LoaderIcon className="w-4 h-4 animate-spin" /><span>{t.sending}</span></>
                  : <><SendIcon className="w-4 h-4" /><span>{t.send}</span></>
                }
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ── Quick action buttons (below input, like the reference) ── */}
        <AnimatePresence>
          {!chatStarted && (
            <motion.div
              className="flex flex-wrap items-center justify-center gap-2 mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.35, duration: 0.35 }}
            >
              {commands.slice(0, 4).map((cmd, i) => (
                <motion.button
                  key={cmd.prefix}
                  onClick={() => selectCmd(i)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all relative overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.55)',
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(124,58,237,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)';
                    e.currentTarget.style.color = '#C4B5FD';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  }}
                >
                  <span style={{ opacity: 0.7 }}>{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connection status */}
        <motion.div
          className="flex items-center justify-center gap-2 mt-4 text-xs"
          style={{ color: connected ? 'rgba(167,139,250,0.6)' : 'rgba(245,158,11,0.7)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{connected ? t.online : t.connecting}</span>
        </motion.div>
      </div>

      {/* ── Thinking pill (bottom) ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full"
            style={{
              background: 'rgba(6,4,16,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)', color: 'white' }}>
              AI
            </div>
            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{t.thinking}</span>
            <TypingDots />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error toast ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <div className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background: 'rgba(12,6,20,0.96)', border: '1px solid rgba(239,68,68,0.2)', backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300 flex-1">{error}</p>
              <button onClick={() => setError('')} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">{t.close}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatBot;
