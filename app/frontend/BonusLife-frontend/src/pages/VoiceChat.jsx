import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import {
  Mic, MicOff, Globe, Keyboard, AlertTriangle,
  Clock, X, Send, RotateCcw, ArrowLeft,
} from 'lucide-react';
import { ROUTES } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/api';

const SpeechRecognitionAPI = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

const PROCESSING_TEXT = 'Generating';

const aiLoaderStyles = `
  @keyframes loaderCircle {
    0%   { transform: rotate(90deg);  box-shadow: 0 6px 12px 0 #38bdf8 inset, 0 12px 18px 0 #005dff inset, 0 36px 36px 0 #1e40af inset, 0 0 3px 1.2px rgba(56,189,248,0.3), 0 0 6px 1.8px rgba(0,93,255,0.2); }
    50%  { transform: rotate(270deg); box-shadow: 0 6px 12px 0 #60a5fa inset, 0 12px 6px  0 #0284c7 inset, 0 24px 36px 0 #005dff inset, 0 0 3px 1.2px rgba(56,189,248,0.3), 0 0 6px 1.8px rgba(0,93,255,0.2); }
    100% { transform: rotate(450deg); box-shadow: 0 6px 12px 0 #4dc8fd inset, 0 12px 18px 0 #005dff inset, 0 36px 36px 0 #1e40af inset, 0 0 3px 1.2px rgba(56,189,248,0.3), 0 0 6px 1.8px rgba(0,93,255,0.2); }
  }
  @keyframes loaderLetter {
    0%, 100% { opacity: 0.35; transform: translateY(0);  }
    20%       { opacity: 1;    transform: scale(1.18);    }
    40%       { opacity: 0.65; transform: translateY(0);  }
  }
  @keyframes recordPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3), 0 6px 12px 0 #7f1d1d inset, 0 24px 36px 0 #450a0a inset; }
    50%       { box-shadow: 0 0 0 16px rgba(239,68,68,0), 0 6px 12px 0 #991b1b inset, 0 24px 36px 0 #7f1d1d inset; }
  }
  .ai-loader-circle  { animation: loaderCircle 5s linear infinite; }
  .ai-loader-letter  { animation: loaderLetter 3s infinite; display: inline-block; color: #60a5fa; opacity: 0.35; }
  @keyframes waveBar {
    0%, 100% { transform: scaleY(0.5); }
    50%       { transform: scaleY(1.6); }
  }
  .wave-bar { animation: waveBar 0.7s ease-in-out infinite; transform-origin: bottom; }
`;

const VoiceChat = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const voiceUserId = user?.id ? String(user.id) : 'voice-user';
  const textUserId  = user?.id ? String(user.id) : 'text-user';
  const [isRecording, setIsRecording]       = useState(false);
  const [isProcessing, setIsProcessing]     = useState(false);
  const [result, setResult]                 = useState(null);
  const [error, setError]                   = useState('');
  const [textInput, setTextInput]           = useState('');
  const [showTextDialog, setShowTextDialog] = useState(false);
  const mediaRecorder       = useRef(null);
  const audioChunks         = useRef([]);
  const speechRecognitionRef = useRef(null);
  const speechTranscriptRef  = useRef('');

  const t = language === 'turkish' ? {
    title: 'Sesli Asistan', sub: 'Diyabet hakkında kendi dilinizde doğal bir şekilde konuşun',
    start: 'Kayıt Başlat', stop: 'Durdur', processing: 'İşleniyor',
    question: 'Sorunuz', response: 'Yapay Zeka Yanıtı', retry: 'Tekrar Dene',
    type: 'Yazıyla Sor', enter: 'Sorunuzu buraya yazın', submit: 'Gönder', cancel: 'İptal',
    errNoSpeech: 'Konuşma algılanmadı. Tekrar deneyin veya sorunuzu yazın.',
    errNoUnderstand: 'Anlaşılamadı. Lütfen tekrar konuşun veya sorunuzu yazın.',
    errEmpty: 'Bir soru girin',
    back: 'Kontrol Paneline Dön',
    idleHint: 'Başlamak için mikrofona tıklayın', speakingHint: 'Şimdi konuşun…'
  } : language === 'arabic' ? {
    title: 'المساعد الصوتي', sub: 'تحدث براحتك عن صحتك بلهجتك الطبيعية',
    start: 'بدء التسجيل', stop: 'إيقاف', processing: 'جاري المعالجة',
    question: 'سؤالك', response: 'رد الذكاء الاصطناعي', retry: 'المحاولة مرة أخرى',
    type: 'اكتب سؤالك', enter: 'اكتب سؤالك هنا', submit: 'إرسال', cancel: 'إلغاء',
    errNoSpeech: 'لم يتم التقاط أي صوت. جرب مرة أخرى أو اكتب سؤالك.',
    errNoUnderstand: 'لم أفهم ذلك. جرب كتابة سؤالك أو تحدث مرة أخرى.',
    errEmpty: 'أدخل سؤالاً',
    back: 'العودة للوحة التحكم',
    idleHint: 'اضغط على الميكروفون للبدء', speakingHint: 'تحدث الآن…'
  } : {
    title: 'Voice Assistant', sub: 'Speak naturally about diabetes in your preferred language',
    start: 'Start Recording', stop: 'Stop', processing: 'Generating',
    question: 'Your Question', response: 'AI Response', retry: 'Try Again',
    type: 'Type Instead', enter: 'Type your question here', submit: 'Submit', cancel: 'Cancel',
    errNoSpeech: 'No speech detected. Try again or type your question.',
    errNoUnderstand: 'Could not understand. Try typing your question or speak again.',
    errEmpty: 'Enter a question',
    back: 'Back to Dashboard',
    idleHint: 'Click the microphone to begin', speakingHint: 'Speak now…'
  };

  const startRecording = async () => {
    try {
      setError(''); setResult(null); audioChunks.current = []; speechTranscriptRef.current = '';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mediaRecorder.current.onstop = processRecording;
      mediaRecorder.current.start(1000);
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true; recognition.interimResults = true;
        recognition.lang = language === 'arabic' ? 'ar-SA' : language === 'turkish' ? 'tr-TR' : 'en-US';
        recognition.onresult = (e) => {
          const full = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
          if (full) speechTranscriptRef.current = full;
        };
        recognition.start();
        speechRecognitionRef.current = recognition;
      }
      setIsRecording(true);
    } catch { setError('Microphone access denied.'); }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      if (speechRecognitionRef.current) { speechRecognitionRef.current.stop(); speechRecognitionRef.current = null; }
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    }
  };

  const processRecording = async () => {
    const transcript = (speechTranscriptRef.current || '').trim();
    if (!transcript && !audioChunks.current.length) { setError(t.errNoSpeech); return; }
    setIsProcessing(true);
    try {
      if (transcript) {
        const data = await apiService.voiceChat(transcript, language, voiceUserId, true);
        setResult(data);
      } else { setError(t.errNoUnderstand); }
    } catch (err) { setError(err.message); } finally { setIsProcessing(false); }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) { setError(t.errEmpty); return; }
    setIsProcessing(true); setShowTextDialog(false);
    try {
      const data = await apiService.voiceChat(textInput, language, textUserId, true);
      setResult(data); setTextInput('');
    } catch (err) { setError(err.message); } finally { setIsProcessing(false); }
  };

  const letters = t.processing.split('');

  return (
    <>
      <style>{aiLoaderStyles}</style>

      {/* Background — matches app dark theme with subtle blue tint */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(160deg, #060e18 0%, #060a12 50%, #04080f 100%)', zIndex: 0 }} />
      <div className="fixed pointer-events-none"
        style={{ top: '15%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,33,80,0.25), transparent 70%)', filter: 'blur(80px)', zIndex: 0 }} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-32 pb-16 relative z-10"
        style={{ fontFamily: "'Figtree','Inter',sans-serif" }}>

        {/* Back */}
        <button onClick={() => navigate(ROUTES.DASHBOARD)}
          className="flex items-center gap-2 mb-8 text-sm transition-colors group"
          style={{ color: 'rgba(147,197,253,0.6)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#93c5fd'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,0.6)'}>
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          {t.back}
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{t.title}</h1>
          <p style={{ color: 'rgba(147,197,253,0.5)' }} className="max-w-md mx-auto text-sm">{t.sub}</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 mb-8 rounded-xl text-red-300 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        <div className="p-10 sm:p-14">

            {/* ── Idle / Recording ── */}
            {!result && !isProcessing && (
              <div className="flex flex-col items-center gap-10">
                {/* Circle */}
                <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
                  {/* Animated ring */}
                  <div className="absolute inset-0 rounded-full"
                    style={isRecording ? {} : { animation: 'loaderCircle 5s linear infinite' }} />

                  {/* Mic button */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                    className="relative z-10 flex items-center justify-center transition-all duration-500"
                    style={{
                      width: 144, height: 144, borderRadius: '50%',
                      ...(isRecording
                        ? { animation: 'recordPulse 1.4s ease-in-out infinite' }
                        : { animation: 'loaderCircle 5s linear infinite' }),
                    }}
                    onMouseEnter={e => { if (!isRecording) e.currentTarget.style.transform = 'scale(1.07)'; }}
                    onMouseLeave={e => { if (!isRecording) e.currentTarget.style.transform = 'scale(1)'; }}>
                    </button>
                </div>

                <div className="text-center">
                  <p className="text-xl font-bold text-white">{isRecording ? t.stop : t.start}</p>
                  <p className="text-sm mt-1.5" style={{ color: 'rgba(147,197,253,0.5)' }}>
                    {isRecording ? t.speakingHint : t.idleHint}
                  </p>
                </div>

                {/* Wave bars while recording */}
                {isRecording && (
                  <div className="flex items-end gap-1.5" style={{ height: 36 }}>
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="wave-bar w-1.5 rounded-full"
                        style={{
                          height: `${14 + Math.sin(i * 0.9) * 14 + 6}px`,
                          background: 'linear-gradient(to top, #0d2137, #1e3a5f)',
                          animationDelay: `${i * 70}ms`,
                        }} />
                    ))}
                  </div>
                )}

                <button onClick={() => setShowTextDialog(true)}
                  className="flex items-center gap-2 text-sm font-semibold transition-colors px-4 py-2 rounded-xl"
                  style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)', color: 'rgba(147,197,253,0.6)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#93c5fd'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,0.6)'}>
                  <Keyboard className="w-4 h-4" /> {t.type}
                </button>
              </div>
            )}

            {/* ── Processing ── */}
            {isProcessing && (
              <div className="flex flex-col items-center py-16">
                <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
                  <div className="absolute inset-0 rounded-full ai-loader-circle" />
                  <div
                    className="relative z-10 flex items-center justify-center"
                    style={{ width: 144, height: 144, borderRadius: '50%', animation: 'loaderCircle 5s linear infinite' }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
                      {t.processing}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Results ── */}
            {result && (
              <div className="space-y-5">
                {/* Question */}
                <div className="p-5 rounded-xl"
                  style={{ background: 'rgba(0,93,255,0.07)', border: '1px solid rgba(56,189,248,0.15)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3"
                    style={{ color: 'rgba(147,197,253,0.5)' }}>{t.question}</p>
                  <p className="text-sm text-gray-300 italic leading-relaxed">"{result.text_input}"</p>
                  <span className="inline-flex items-center gap-1.5 mt-4 text-[11px] font-bold px-3 py-1 rounded-full"
                    style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#93c5fd' }}>
                    {(result.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>

                {/* Response */}
                <div className="p-5 rounded-xl"
                  style={{ background: 'rgba(0,93,255,0.05)', border: '1px solid rgba(56,189,248,0.12)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-3"
                    style={{ color: '#38bdf8' }}>{t.response}</p>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {result.ai_response?.replace(/\*\*/g, '')}
                  </p>
                  <div className="flex gap-2 mt-4">
                    {[
                      { icon: <Globe className="w-3 h-3" />, label: result.language },
                      { icon: <Clock className="w-3 h-3" />, label: new Date(result.timestamp).toLocaleTimeString() },
                    ].map(({ icon, label }) => (
                      <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full"
                        style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.1)', color: 'rgba(147,197,253,0.6)' }}>
                        {icon} {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="text-center pt-2">
                  <LiquidMetalButton onClick={() => { setResult(null); setError(''); audioChunks.current = []; }} width={140}>
                    <RotateCcw className="w-4 h-4" /> {t.retry}
                  </LiquidMetalButton>
                </div>
              </div>
            )}
        {/* Text modal */}
        {showTextDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{ background: 'rgba(8,14,26,0.95)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(24px)' }}>
              <div className="h-px w-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(30,58,95,0.8) 40%, rgba(14,33,80,0.6) 60%, transparent)' }} />
              <div className="p-7 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-lg">{t.type}</h3>
                  <button onClick={() => setShowTextDialog(false)}
                    className="p-1.5 rounded-xl transition-colors"
                    style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)', color: 'rgba(147,197,253,0.5)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#93c5fd'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(147,197,253,0.5)'}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <textarea autoFocus value={textInput} onChange={(e) => setTextInput(e.target.value)}
                  placeholder={t.enter} rows={4}
                  className="w-full resize-none text-sm text-white outline-none transition-all duration-200 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(0,93,255,0.05)', border: '1px solid rgba(56,189,248,0.12)', color: 'white' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(56,189,248,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(56,189,248,0.12)'}
                />
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowTextDialog(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)', color: 'rgba(147,197,253,0.6)' }}>
                    {t.cancel}
                  </button>
                  <LiquidMetalButton onClick={handleTextSubmit} width={120}>
                    <Send className="w-4 h-4" /> {t.submit}
                  </LiquidMetalButton>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
};

export default VoiceChat;
