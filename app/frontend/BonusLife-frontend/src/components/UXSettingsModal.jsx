import React, { useEffect, useState } from 'react';
import { X, Palette, Move, Type, Zap, Volume2, Mic, Monitor, Sun, Moon, ChevronRight } from 'lucide-react';
import { AnimatedSelect } from '../components/ui/AnimatedSelect';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useUXSettings } from '../context/UXSettingsContext';
import { API_BASE_URL } from '../config/constants';

const TTS_VOICE_STORAGE_KEY = 'bonuslife_tts_voice_id';

function getVoiceApiBase() {
  if (API_BASE_URL && API_BASE_URL.startsWith('http')) return API_BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) return `http://${window.location.hostname}:8001`;
  return 'http://127.0.0.1:8001';
}

/* ── Toggle switch ── */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
        checked ? 'bg-violet-600' : 'bg-white/[0.1]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

/* ── Pill radio group ── */
function PillGroup({ value, onChange, options }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
            value === opt.value
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
              : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{label}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

/* ── Setting row ── */
function SettingRow({ icon: Icon, iconColor = 'text-gray-500', label, description, control, accent }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors ${
      accent ? 'bg-white/[0.03] border border-white/[0.05]' : ''
    }`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        accent ? 'bg-violet-500/10' : 'bg-white/[0.05]'
      }`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export default function UXSettingsModal({ isOpen, onClose, language = 'english' }) {
  const isAr = language === 'arabic';
  const isTr = language === 'turkish';
  const t = {
    preferences: isAr ? 'التفضيلات' : isTr ? 'Tercihler' : 'Preferences',
    customizeExperience: isAr ? 'خصّص تجربتك' : isTr ? 'Deneyiminizi özelleştirin' : 'Customize your experience',
    close: isAr ? 'إغلاق' : isTr ? 'Kapat' : 'Close',
    appearance: isAr ? 'المظهر' : isTr ? 'Görünüm' : 'Appearance',
    theme: isAr ? 'السمة' : isTr ? 'Tema' : 'Theme',
    chooseColorScheme: isAr ? 'اختر نظام الألوان' : isTr ? 'Renk şemanızı seçin' : 'Choose your color scheme',
    default: isAr ? '☀ افتراضي' : isTr ? '☀ Varsayılan' : '☀ Default',
    system: isAr ? '⬛ النظام' : isTr ? '⬛ Sistem' : '⬛ System',
    textSize: isAr ? 'حجم النص' : isTr ? 'Metin boyutu' : 'Text size',
    baseFontSize: isAr ? 'حجم الخط الأساسي في التطبيق' : isTr ? 'Uygulama genelinde temel yazı tipi boyutu' : 'Base font size across the app',
    normal: isAr ? 'عادي' : isTr ? 'Normal' : 'Normal',
    large: isAr ? 'كبير' : isTr ? 'Büyük' : 'Large',
    accessibility: isAr ? 'إمكانية الوصول' : isTr ? 'Erişilebilirlik' : 'Accessibility',
    highContrast: isAr ? 'تباين عالٍ' : isTr ? 'Yüksek kontrast' : 'High contrast',
    highContrastDesc: isAr ? 'زيادة تباين النص والحدود' : isTr ? 'Metin ve kenarlık kontrastını artırın' : 'Increase text and border contrast',
    motionInteraction: isAr ? 'الحركة والتفاعل' : isTr ? 'Hareket ve Etkileşim' : 'Motion & Interaction',
    motion: isAr ? 'الحركة' : isTr ? 'Hareket' : 'Motion',
    motionDesc: isAr ? 'يتحكم في الرسوم المتحركة والانتقالات' : isTr ? 'Animasyonları ve geçişleri kontrol eder' : 'Controls animations and transitions',
    auto: isAr ? 'تلقائي' : isTr ? 'Otomatik' : 'Auto',
    reduced: isAr ? 'مخفّض' : isTr ? 'Azaltılmış' : 'Reduced',
    full: isAr ? 'كامل' : isTr ? 'Tam' : 'Full',
    hapticFeedback: isAr ? 'الاستجابة اللمسية' : isTr ? 'Dokunsal geri bildirim' : 'Haptic feedback',
    hapticDesc: isAr ? 'اهتزاز على الأجهزة المحمولة' : isTr ? 'Mobil cihazlarda titreşim' : 'Vibration on mobile devices',
    soundVoice: isAr ? 'الصوت' : isTr ? 'Ses' : 'Sound & Voice',
    chartSounds: isAr ? 'أصوات الرسوم البيانية' : isTr ? 'Grafik sesleri' : 'Chart sounds',
    chartSoundsDesc: isAr ? 'استمع إلى البيانات كنغمات عند تمرير المؤشر فوق الرسوم البيانية' : isTr ? 'Grafiklerin üzerine gelindiğinde verileri ton olarak duyun' : 'Hear data as tones when hovering charts',
    voiceAssistant: isAr ? 'المساعد الصوتي' : isTr ? 'Sesli asistan' : 'Voice assistant',
    voiceAssistantDesc: isAr ? 'صوت ElevenLabs لوكيل الذكاء الاصطناعي' : isTr ? 'Yapay zeka ajanı için ElevenLabs sesi' : 'ElevenLabs voice for the AI agent',
    loadingVoices: isAr ? 'جارِ تحميل الأصوات…' : isTr ? 'Sesler yükleniyor…' : 'Loading voices…',
    defaultBackend: isAr ? 'افتراضي (الخادم)' : isTr ? 'Varsayılan (sunucu)' : 'Default (backend)',
  };
  const containerRef = useFocusTrap(isOpen, onClose);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsVoiceLoading, setTtsVoiceLoading] = useState(false);
  const [ttsVoiceId, setTtsVoiceIdState] = useState(() => {
    try { return localStorage.getItem(TTS_VOICE_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const {
    theme, motion, contrast, textSize, haptics, sound,
    setTheme, setMotion, setContrast, setTextSize, setHaptics, setSound,
  } = useUXSettings();

  useEffect(() => {
    function handleKeyDown(e) { if (e.key === 'Escape') onClose(); }
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    try { setTtsVoiceIdState(localStorage.getItem(TTS_VOICE_STORAGE_KEY) || ''); } catch {}
    setTtsVoiceLoading(true);
    const base = getVoiceApiBase();
    fetch(`${base}/api/v1/voices`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setTtsVoices(data.voices || []))
      .catch(() => setTtsVoices([]))
      .finally(() => setTtsVoiceLoading(false));
  }, [isOpen]);

  const setTtsVoiceId = (voiceId) => {
    try { localStorage.setItem(TTS_VOICE_STORAGE_KEY, voiceId || ''); } catch {}
    setTtsVoiceIdState(voiceId || '');
  };

  if (!isOpen) return null;

  const themeIcons = { default: Sun, system: Monitor };
  const ThemeIcon = themeIcons[theme] || Sun;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10001]"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ux-settings-title"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-[420px]"
        style={{ maxHeight: '85vh' }}
      >
        <div
          className="mx-4 overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, #16162a 0%, #12121f 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.05)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)' }}>
                <Palette className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 id="ux-settings-title" className="text-sm font-bold text-white leading-tight">{t.preferences}</h2>
                <p className="text-[11px] text-gray-500">{t.customizeExperience}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-white/[0.07] hover:text-white transition focus:outline-none"
              aria-label={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 'calc(85vh - 80px)', scrollbarWidth: 'none' }}>

            {/* ── Appearance ── */}
            <SectionHeader label={t.appearance} />

            {/* Theme pill selector */}
            <div className="px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                  <ThemeIcon className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white leading-tight">{t.theme}</p>
                  <p className="text-xs text-gray-500">{t.chooseColorScheme}</p>
                </div>
              </div>
              <PillGroup
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'default', label: t.default },
                  { value: 'system', label: t.system },
                ]}
              />
            </div>

            {/* Text size */}
            <div className="px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                  <Type className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white leading-tight">{t.textSize}</p>
                  <p className="text-xs text-gray-500">{t.baseFontSize}</p>
                </div>
              </div>
              <PillGroup
                value={textSize}
                onChange={setTextSize}
                options={[
                  { value: 'normal', label: t.normal },
                  { value: 'lg', label: t.large },
                ]}
              />
            </div>

            {/* ── Accessibility ── */}
            <SectionHeader label={t.accessibility} />

            <SettingRow
              icon={() => <span className="text-sm text-gray-400" aria-hidden>◐</span>}
              label={t.highContrast}
              description={t.highContrastDesc}
              control={
                <Toggle
                  checked={contrast === 'on'}
                  onChange={v => setContrast(v ? 'on' : 'off')}
                />
              }
            />

            {/* ── Motion & Interaction ── */}
            <SectionHeader label={t.motionInteraction} />

            <div className="px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                  <Move className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white leading-tight">{t.motion}</p>
                  <p className="text-xs text-gray-500">{t.motionDesc}</p>
                </div>
              </div>
              <PillGroup
                value={motion}
                onChange={setMotion}
                options={[
                  { value: 'auto', label: t.auto },
                  { value: 'reduced', label: t.reduced },
                  { value: 'full', label: t.full },
                ]}
              />
            </div>

            <SettingRow
              icon={Zap}
              label={t.hapticFeedback}
              description={t.hapticDesc}
              control={
                <Toggle
                  checked={haptics === 'on'}
                  onChange={v => setHaptics(v ? 'on' : 'off')}
                />
              }
            />

            {/* ── Sound & Voice ── */}
            <SectionHeader label={t.soundVoice} />

            <SettingRow
              icon={Volume2}
              label={t.chartSounds}
              description={t.chartSoundsDesc}
              control={
                <Toggle
                  checked={sound === 'on'}
                  onChange={v => setSound(v ? 'on' : 'off')}
                />
              }
            />

            {/* TTS Voice */}
            <div className="px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white leading-tight">{t.voiceAssistant}</p>
                  <p className="text-xs text-gray-500">{t.voiceAssistantDesc}</p>
                </div>
              </div>
              <AnimatedSelect
                value={ttsVoiceId}
                onChange={e => setTtsVoiceId(e.target.value)}
                disabled={ttsVoiceLoading}
                options={[
                  { value: '', label: ttsVoiceLoading ? t.loadingVoices : t.defaultBackend },
                  ...ttsVoices.map(v => ({ value: v.voice_id, label: v.name || v.voice_id })),
                ]}
              />
            </div>

            {/* Bottom padding */}
            <div className="h-1" />
          </div>
        </div>
      </div>
    </>
  );
}
