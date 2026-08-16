import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { Loader2, Play, Sparkles, RefreshCw, ArrowLeft } from 'lucide-react';
import { ROUTES } from '../config/constants';
import { getWorkoutVideos } from '../services/api';

const GOALS = [
  { key: 'beginner', labelEn: 'Beginner', labelTr: 'Başlangıç', labelAr: 'مبتدئ' },
  { key: 'weight_loss', labelEn: 'Weight Loss', labelTr: 'Kilo Verme', labelAr: 'خسارة الوزن' },
  { key: '10_min', labelEn: '10 Min', labelTr: '10 Dakika', labelAr: '10 دقائق' },
  { key: 'low_impact', labelEn: 'Low Impact', labelTr: 'Düşük Etki', labelAr: 'تأثير منخفض' },
  { key: 'strength', labelEn: 'Strength', labelTr: 'Güç', labelAr: 'قوة' },
];

const WorkoutVideos = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const [goal, setGoal] = useState('beginner');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isTr = language === 'turkish';
  const isAr = language === 'arabic';

  const fetchVideos = useCallback((refresh = null) => {
    setLoading(true);
    setError('');
    getWorkoutVideos(goal, refresh, language)
      .then((res) => setVideos(Array.isArray(res?.videos) ? res.videos : []))
      .catch((err) => setError(err.message || (isAr ? 'تعذر تحميل الفيديوهات.' : isTr ? 'Videolar yüklenemedi.' : 'Failed to load videos.')))
      .finally(() => setLoading(false));
  }, [goal, language, isTr, isAr]);

  useEffect(() => { fetchVideos(); }, [goal]);

  const handleRefresh = () => fetchVideos(Date.now());

  const t = isAr ? {
    badge: 'رياضة',
    title: 'فيديوهات التمارين الرياضية',
    subtitle: 'فيديوهات تمارين رياضية من YouTube تناسب هدفك. مبتدئ، خسارة الوزن، 10 دقائق، أو تمارين خفيفة.',
    chooseGoal: 'اختر هدفاً',
    refresh: 'فيديوهات جديدة',
    noVideos: 'لم يتم العثور على فيديوهات لهذا الهدف.',
    by: 'القناة',
    backToDashboard: 'العودة إلى لوحة التحكم',
  } : isTr ? {
    badge: 'Spor',
    title: 'Antrenman Videoları',
    subtitle: 'Hedefinize uygun YouTube antrenman videoları. Başlangıç, kilo verme, 10 dakika veya düşük etkili seçenekler.',
    chooseGoal: 'Hedef seçin',
    refresh: 'Yeni videolar',
    noVideos: 'Bu hedef için video bulunamadı.',
    by: 'Kanal',
    backToDashboard: 'Dashboard\'a Geri Dön',
  } : {
    badge: 'Sport',
    title: 'Workout Videos',
    subtitle: 'YouTube workout videos for your goal. Beginner, weight loss, 10‑min, or low‑impact options.',
    chooseGoal: 'Choose a goal',
    refresh: 'New videos',
    noVideos: 'No videos found for this goal.',
    by: 'Channel',
    backToDashboard: 'Back to Dashboard',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-32 pb-16"
      style={{ fontFamily: language === 'arabic' ? "'Tajawal','Figtree','Inter',sans-serif" : "'Figtree','Inter',sans-serif" }} dir={language === 'arabic' ? 'rtl' : 'ltr'}>

      {/* Background blob */}
      <div className="fixed top-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08), transparent 70%)', filter: 'blur(80px)' }} />

      {/* Back to Dashboard */}
      <button onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group relative z-10">
        <ArrowLeft className={`w-4 h-4 transition-transform ${language === 'arabic' ? 'rotate-180 group-hover:translate-x-0.5' : 'group-hover:-translate-x-0.5'}`} />
        {t.backToDashboard}
      </button>

      {/* Header */}
      <div className="text-center mb-12 relative z-10">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{t.title}</h1>
        <p className="text-gray-500 text-lg max-w-2xl mx-auto">{t.subtitle}</p>
      </div>

      {/* Goal filter */}
      <div className="mb-8 relative z-10">
        <p className="text-sm font-semibold text-gray-500 mb-3">{t.chooseGoal}</p>
        <div className="flex flex-wrap items-center gap-2">
          {GOALS.map((g) => (
            <button key={g.key} type="button" onClick={() => setGoal(g.key)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={goal === g.key ? {
                background: 'rgba(124,58,237,0.2)',
                border: '1px solid rgba(124,58,237,0.4)',
                color: '#C4B5FD',
              } : {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#6B7280',
              }}>
              {language === 'arabic' ? g.labelAr : isTr ? g.labelTr : g.labelEn}
            </button>
          ))}
          <LiquidMetalButton onClick={handleRefresh} disabled={loading} width={130}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </LiquidMetalButton>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl text-red-400 text-sm relative z-10"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(124,58,237,0.2)', borderTopColor: '#7C3AED' }} />
            <div className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ background: 'rgba(124,58,237,0.3)' }} />
          </div>
        </div>
      ) : videos.length === 0 ? (
        <p className="text-gray-500 text-center py-12 relative z-10">{t.noVideos}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
          {videos.map((video) => (
            <div key={video.id}
              className="rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(124,58,237,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}>
              <div className="aspect-video bg-black/40 relative">
                <iframe
                  src={`https://www.youtube.com/embed/${video.id}`}
                  title={video.title || 'Workout video'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.7)', color: '#A78BFA', backdropFilter: 'blur(8px)' }}>
                  <Play className="w-3 h-3" />
                  YouTube
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white line-clamp-2 mb-1 text-sm">{video.title}</h3>
                {video.channel && (
                  <p className="text-xs text-gray-500">{t.by}: {video.channel}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkoutVideos;
