import React, { useState, useEffect } from 'react';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Sun, HelpCircle, ChevronDown, ChevronUp, Trash2, ArrowLeft } from 'lucide-react';
import { ROUTES } from '../config/constants';
import {
  localAIGetHealthTip,
  localAIAnswerScenario,
  getMyAssessments,
} from '../services/api';

const TIP_STORAGE_KEY = 'bonuslife_local_ai_tip';
const SCENARIO_HISTORY_KEY = 'bonuslife_local_ai_scenario_history';
const SCENARIO_HISTORY_MAX = 10;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadStoredTip(language) {
  try {
    const raw = localStorage.getItem(TIP_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.date !== getTodayDate() || data.language !== language) return null;
    return data.tip || null;
  } catch { return null; }
}

function saveStoredTip(date, tip, language) {
  try { localStorage.setItem(TIP_STORAGE_KEY, JSON.stringify({ date, tip, language })); } catch (_) {}
}

function loadScenarioHistory() {
  try {
    const raw = localStorage.getItem(SCENARIO_HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, SCENARIO_HISTORY_MAX) : [];
  } catch { return []; }
}

function saveScenarioHistory(list) {
  try { localStorage.setItem(SCENARIO_HISTORY_KEY, JSON.stringify(list.slice(0, SCENARIO_HISTORY_MAX))); } catch (_) {}
}

function stripDisclaimer(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  const disclaimerStart = out.search(/\bDisclaimer\s*:/i);
  if (disclaimerStart !== -1) out = out.slice(0, disclaimerStart);
  out = out.replace(/\n*This is not medical advice\.?\s*$/i, '').trim();
  out = out.replace(/\n*Consult with your healthcare provider[^.]*\.?\s*$/i, '').trim();
  return out.trim();
}

const LocalAI = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const isTr = language === 'turkish';
  const lang = isTr ? 'turkish' : 'english';

  const [tip, setTip] = useState('');
  const [tipLoading, setTipLoading] = useState(false);
  const [scenario, setScenario] = useState('');
  const [scenarioResult, setScenarioResult] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioHistory, setScenarioHistory] = useState([]);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [latestAssessment, setLatestAssessment] = useState(null);

  useEffect(() => {
    getMyAssessments(1).then((list) => { if (Array.isArray(list) && list.length > 0) setLatestAssessment(list[0]); }).catch(() => {});
  }, []);

  useEffect(() => { setScenarioHistory(loadScenarioHistory()); }, []);
  useEffect(() => {
    const stored = loadStoredTip();
    if (stored) setTip(stored);
    else setTip('');
  }, []);

  const isAr = language === 'arabic';

  const t = isAr ? {
    badge: 'ذكاء اصطناعي محلي', title: 'الذكاء الاصطناعي المحلي',
    subtitle: 'احصل على نصيحة صحية يومية واستكشف سيناريوهات "ماذا لو..." المخصصة لك.',
    tipTitle: 'نصيحة اليوم الصحية', getTip: "احصل على نصيحة اليوم", getNewTip: 'احصل على نصيحة جديدة',
    scenarioTitle: 'ماذا لو…؟', scenarioPlaceholder: 'مثال: ماذا لو قمت بخفض الجلوكوز بمقدار 20؟',
    usingAssessment: 'استخدام التقييم الأخير للسياق.',
    askScenario: 'احصل على الإجابة', previousQuestions: 'الأسئلة السابقة',
    backToDashboard: 'العودة إلى لوحة التحكم',
  } : isTr ? {
    badge: 'Yerel Yapay Zeka', title: 'Yerel AI',
    subtitle: 'Günlük sağlık ipucu alın ve size özel "ya… olursa" cevaplarını keşfedin.',
    tipTitle: 'Günün sağlık ipucu', getTip: "Günün ipucunu al", getNewTip: 'Yeni ipucu al',
    scenarioTitle: 'Ya… olursa?', scenarioPlaceholder: 'örn. Kan şekerimi 20 düşürürsem ne olur?',
    usingAssessment: 'Son değerlendirmeniz bağlam için kullanılıyor.',
    askScenario: 'Cevap al', previousQuestions: 'Önceki sorular',
    backToDashboard: 'Dashboard\'a Geri Dön',
  } : {
    badge: 'Local AI', title: 'Local AI',
    subtitle: 'Get a daily health tip and explore "what if" answers tailored to you.',
    tipTitle: 'Health tip of the day', getTip: "Get today's tip", getNewTip: 'Get a new tip',
    scenarioTitle: 'What if…?', scenarioPlaceholder: 'e.g. What if I lower my glucose by 20?',
    usingAssessment: 'Using your last assessment for context.',
    askScenario: 'Get answer', previousQuestions: 'Previous questions',
    backToDashboard: 'Back to Dashboard',
  };

  const onGetTip = async () => {
    const today = getTodayDate();
    const stored = loadStoredTip(lang);
    if (stored) { setTip(stored); return; }
    setTipLoading(true); setTip('');
    try {
      const res = await localAIGetHealthTip(lang);
      const text = res.tip || res.detail || '';
      setTip(text); saveStoredTip(today, text, lang);
    } catch (e) { setTip(e.message || ''); } finally { setTipLoading(false); }
  };

  const onGetNewTip = async () => {
    setTipLoading(true); setTip('');
    try {
      const res = await localAIGetHealthTip(lang);
      const text = res.tip || res.detail || '';
      setTip(text); saveStoredTip(getTodayDate(), text, lang);
    } catch (e) { setTip(e.message || ''); } finally { setTipLoading(false); }
  };

  const onScenario = async () => {
    if (!scenario.trim()) return;
    const question = scenario.trim();
    setScenarioLoading(true); setScenarioResult('');
    try {
      const res = await localAIAnswerScenario(question, latestAssessment || undefined, lang);
      const answer = res.answer || res.detail || '';
      setScenarioResult(answer);
      const next = [{ scenario: question, answer }, ...scenarioHistory];
      setScenarioHistory(next); saveScenarioHistory(next);
    } catch (e) { setScenarioResult(e.message || ''); } finally { setScenarioLoading(false); }
  };

  const showTip = section !== 'scenario';
  const showScenario = section !== 'tip';
  const headerBadge = section === 'tip' ? (isAr ? 'نصيحة' : isTr ? 'İpucu' : 'Tip') : section === 'scenario' ? (isAr ? 'سيناريو' : isTr ? 'Senaryo' : 'Scenario') : t.badge;
  const headerTitle = section === 'tip' ? t.tipTitle : section === 'scenario' ? t.scenarioTitle : t.title;
  const headerSubtitle = section === 'tip' ? (isAr ? 'احصل على نصيحة اليوم الصحية.' : isTr ? 'Günlük sağlık ipucu alın.' : 'Get your daily health tip.') : section === 'scenario' ? (isAr ? 'استكشف سيناريوهات "ماذا لو..." المخصصة لك.' : isTr ? 'Size özel "ya… olursa" cevaplarını keşfedin.' : 'Explore "what if" answers tailored to you.') : t.subtitle;

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  const btnPrimary = {
    background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
    boxShadow: '0 0 20px rgba(124,58,237,0.3)',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-32 pb-16"
      style={{ fontFamily: language === 'arabic' ? "'Tajawal','Figtree','Inter',sans-serif" : "'Figtree','Inter',sans-serif" }} dir={language === 'arabic' ? 'rtl' : 'ltr'}>

      <div className="fixed top-1/3 left-1/3 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.1), transparent 70%)', filter: 'blur(80px)' }} />

      {/* Back to Dashboard */}
      <button onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group relative z-10">
        <ArrowLeft className={`w-4 h-4 transition-transform ${language === 'arabic' ? 'rotate-180 group-hover:translate-x-0.5' : 'group-hover:-translate-x-0.5'}`} />
        {t.backToDashboard}
      </button>

      {/* Header */}
      <div className="text-center mb-12 relative z-10">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{headerTitle}</h1>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">{headerSubtitle}</p>
      </div>

      <div className="space-y-8 relative z-10">

        {/* Health Tip Section */}
        {showTip && (
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-xl font-bold text-white">{t.tipTitle}</h2>
              </div>

              <LiquidMetalButton onClick={tip ? onGetNewTip : onGetTip} disabled={tipLoading} width={180}>
                {tipLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {isTr ? 'Yükleniyor...' : 'Loading...'}</> : <><Sun className="w-4 h-4" /> {tip ? t.getNewTip : t.getTip}</>}
              </LiquidMetalButton>

              {tip && (
                <div className="mt-5 p-4 rounded-xl text-gray-300 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {tip}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scenario Section */}
        {showScenario && (
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <div className="h-px w-full"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.3), transparent)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-xl font-bold text-white">{t.scenarioTitle}</h2>
              </div>

              <textarea
                value={scenario}
                onChange={(e) => { setScenario(e.target.value); setScenarioResult(''); }}
                placeholder={t.scenarioPlaceholder}
                className="w-full min-h-[100px] resize-y mb-4 text-sm text-white placeholder-gray-600 outline-none transition-all duration-200 rounded-xl px-4 py-3"
                style={inputStyle}
                disabled={scenarioLoading}
                rows={3}
                onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }}
              />

              <LiquidMetalButton onClick={onScenario} disabled={scenarioLoading || !scenario.trim()} width={180}>
                {scenarioLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {isTr ? 'Yükleniyor...' : 'Loading...'}</> : <><HelpCircle className="w-4 h-4" /> {t.askScenario}</>}
              </LiquidMetalButton>

              {scenarioResult && (
                <div className="mt-5 p-4 rounded-xl text-gray-300 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)', borderLeft: '3px solid #7C3AED' }}>
                  {stripDisclaimer(scenarioResult)}
                </div>
              )}

              {scenarioHistory.length > 0 && (
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button type="button"
                    onClick={() => setHistoryExpandedId(historyExpandedId ? null : 'history')}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-violet-400 transition-colors">
                    {historyExpandedId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {t.previousQuestions} ({scenarioHistory.length})
                  </button>
                  {historyExpandedId && (
                    <ul className="mt-3 space-y-2">
                      {scenarioHistory.map((item, idx) => (
                        <li key={idx} className="relative p-4 pr-12 rounded-xl text-sm"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="font-semibold mb-1.5" style={{ color: '#C4B5FD' }}>Q: {item.scenario}</p>
                          <p className="text-gray-400 whitespace-pre-wrap">{stripDisclaimer(item.answer)}</p>
                          <button type="button"
                            onClick={() => {
                              const next = scenarioHistory.filter((_, i) => i !== idx);
                              setScenarioHistory(next); saveScenarioHistory(next);
                            }}
                            className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocalAI;
