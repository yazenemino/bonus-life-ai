import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import {
  Camera, Upload, Loader2, Image as ImageIcon, Apple,
  CheckCircle, History, AlertCircle, X, Trash2, ArrowLeft,
} from 'lucide-react';
import { ROUTES } from '../config/constants';
import { analyzeMealPhoto, getMealLog, clearMealLog, getStoredToken } from '../services/api';

function resizeAndGetBase64(file, maxSize = 1200) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = w > maxSize || h > maxSize ? maxSize / Math.max(w, h) : 1;
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({ base64, dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export default function MealPhotoAnalyzer({ language }) {
  const navigate = useNavigate();
  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [clearLogLoading, setClearLogLoading] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraMode, setCameraMode] = useState(false);
  const hasToken = !!getStoredToken();

  const reset = () => { setImageDataUrl(null); setImageBase64(null); setResult(null); setError(''); };
  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setCameraMode(false);
  };
  useEffect(() => { return () => stopCamera(); }, []);

  const loadLog = async () => {
    if (!hasToken) return;
    setLogLoading(true);
    try { const data = await getMealLog(50); setLog(Array.isArray(data) ? data : []); }
    catch { setLog([]); }
    finally { setLogLoading(false); }
  };
  useEffect(() => { loadLog(); }, [hasToken]);

  const handleFileSelect = async (e) => {
    const file = e.target?.files?.[0]; if (!file) return;
    e.target.value = ''; setError('');
    try { const { base64, dataUrl } = await resizeAndGetBase64(file); setImageBase64(base64); setImageDataUrl(dataUrl); setResult(null); }
    catch (err) { setError(err.message || (isAr ? 'فشل تحميل الصورة' : isTr ? 'Görsel yüklenemedi' : 'Failed to load image')); }
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraMode(true);
    } catch (err) { setError(err.message || (isTr ? 'Kamera erişilemedi' : 'Camera access denied')); }
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    stopCamera(); setImageBase64(base64); setImageDataUrl(dataUrl); setResult(null);
  };

  const analyze = async (saveToLog = false) => {
    if (!imageBase64) { setError(isAr ? 'يرجى إضافة أو التقاط صورة أولاً.' : isTr ? 'Önce bir fotoğraf ekleyin veya çekin.' : 'Please add or take a photo first.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await analyzeMealPhoto(imageBase64, saveToLog, language || 'english');
      setResult(data);
      if (saveToLog && data.saved_to_log) loadLog();
    } catch (err) { setError(err.message || (isAr ? 'فشل التحليل.' : isTr ? 'Analiz başarısız.' : 'Analysis failed.')); }
    finally { setLoading(false); }
  };

  const carbColor = (level) => {
    if (level === 'low') return '#34D399';
    if (level === 'high') return '#FBBF24';
    return '#67E8F9';
  };

  const carbLabel = (level) => {
    const l = (level || '').toLowerCase();
    if (l === 'low') return isAr ? 'منخفض' : isTr ? 'Düşük' : 'Low';
    if (l === 'high') return isAr ? 'مرتفع' : isTr ? 'Yüksek' : 'High';
    return isAr ? 'متوسط' : isTr ? 'Orta' : 'Medium';
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
  };

  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Figtree','Inter',sans-serif" }}>
      <div className="fixed top-1/3 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08), transparent 70%)', filter: 'blur(80px)' }} />

      <div className="relative z-10 min-h-screen pt-24 pb-12 px-4 sm:px-6 flex flex-col items-center">
        {/* Back to Dashboard */}
        <div className="w-full max-w-4xl mt-6">
          <button onClick={() => navigate(ROUTES.DASHBOARD)}
            className="flex items-center gap-2 mb-4 text-sm text-white/70 hover:text-white transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>
        </div>
        <div className="w-full max-w-4xl flex flex-col sm:flex-row items-stretch sm:items-start gap-6">

          {/* Main analyzer card */}
          <div className="flex-1 min-w-0 rounded-2xl overflow-hidden" style={cardStyle}>
            <div className="h-px w-full"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.3), transparent)' }} />
            <div className="p-8 sm:p-10">
              <div className="flex items-center gap-4 mb-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                  {isAr ? 'محلل الوجبات' : isTr ? 'Öğün Analizi' : 'Meal Analyzer'}
                </h1>
              </div>
              <p className="text-gray-500 text-sm mb-8 max-w-xl">
                {isAr ? 'قم بتحميل أو التقاط صورة لوجبة للحصول على اسمها، ومستوى الكربوهيدرات، واقتراحات بديلة صحية.' : isTr ? 'Yemek fotoğrafı yükleyin veya çekin; öğün adı, karbonhidrat seviyesi ve daha sağlıklı alternatifler gösterilir.' : 'Upload or take a meal photo to get meal name, carb level, and healthier swap suggestions.'}
              </p>

              {/* Capture / Upload */}
              {!cameraMode && !imageDataUrl && (
                <div className="flex gap-4 mb-6 justify-center flex-wrap">
                  <LiquidMetalButton onClick={startCamera} width={190}>
                    <Camera className="w-4 h-4" /> {isAr ? 'التقاط صورة' : isTr ? 'Fotoğraf çek' : 'Take photo'}
                  </LiquidMetalButton>
                  <LiquidMetalButton onClick={() => fileInputRef.current?.click()} width={190}>
                    <Upload className="w-4 h-4" /> {isAr ? 'تحميل' : isTr ? 'Yükle' : 'Upload'}
                  </LiquidMetalButton>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </div>
              )}

              {/* Camera */}
              {cameraMode && (
                <div className="mb-6">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black aspect-video object-cover" />
                  <div className="flex gap-2 mt-3">
                    <LiquidMetalButton onClick={captureFromCamera} width={120}>
                      {isAr ? 'التقاط' : isTr ? 'Çek' : 'Capture'}
                    </LiquidMetalButton>
                    <button type="button" onClick={stopCamera}
                      className="py-3 px-5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {isAr ? 'إلغاء' : isTr ? 'İptal' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* Image preview + actions */}
              {imageDataUrl && !cameraMode && (
                <div className="mb-6">
                  <img src={imageDataUrl} alt="Meal" className="w-full rounded-xl object-cover max-h-56 bg-black/40" />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <LiquidMetalButton onClick={() => analyze(false)} disabled={loading} width={140}>
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {isAr ? 'جارِ التحليل...' : isTr ? 'Analiz...' : 'Analyzing...'}</> : <><ImageIcon className="w-4 h-4" /> {isAr ? 'تحليل' : isTr ? 'Analiz et' : 'Analyze'}</>}
                    </LiquidMetalButton>
                    {hasToken && (
                      <button type="button" onClick={() => analyze(true)} disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#D1D5DB' }}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {isAr ? 'تحليل وحفظ في السجل' : isTr ? 'Analiz et ve kaydet' : 'Analyze & save to log'}
                      </button>
                    )}
                    <button type="button" onClick={reset}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-red-400 transition-colors"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <X className="w-4 h-4" />
                      {isAr ? 'مسح' : isTr ? 'Temizle' : 'Clear'}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 flex items-center gap-2 p-3 rounded-xl text-red-400 text-sm"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="p-5 rounded-xl space-y-3"
                  style={{ background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                      {isAr ? 'الوجبة' : isTr ? 'Öğün' : 'Meal'}
                    </p>
                    <span className="font-bold text-white text-sm">{result.meal_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                      {isAr ? 'مستوى الكربوهيدرات' : isTr ? 'Karbonhidrat' : 'Carb level'}
                    </p>
                    <span className="text-sm font-bold" style={{ color: carbColor(result.carb_level) }}>
                      {carbLabel(result.carb_level)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">
                      {isAr ? 'بدائل صحية أكثر' : isTr ? 'Daha sağlıklı alternatifler' : 'Healthier swaps'}
                    </p>
                    <p className="text-sm text-gray-300">{result.healthier_swaps}</p>
                  </div>
                  {result.saved_to_log && (
                    <p className="text-xs flex items-center gap-1.5 pt-1" style={{ color: '#34D399' }}>
                      <CheckCircle className="w-3.5 h-3.5" />
                      {isAr ? 'تم الحفظ في سجلك.' : isTr ? 'Günlüğe kaydedildi.' : 'Saved to your log.'}
                    </p>
                  )}
                  <p className="text-xs text-gray-600 pt-1">
                    {isAr ? 'انقر على مسح لتحليل وجبة أخرى.' : isTr ? 'Başka öğün analiz etmek için Temizle\'ye tıklayın.' : 'Click Clear to analyze another meal.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Meal history */}
          {hasToken && (
            <div className="w-full sm:w-80 shrink-0 rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="h-px w-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)' }} />
              <div className="p-6">
                <div className="flex items-center justify-between gap-2 mb-5">
                  <h2 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <History className="w-4 h-4 text-violet-400" />
                    {isAr ? 'سجل الوجبات' : isTr ? 'Öğün geçmişi' : 'Meal history'}
                  </h2>
                  {log.length > 0 && (
                    <button type="button"
                      onClick={async () => {
                        setClearLogLoading(true);
                        try { await clearMealLog(); await loadLog(); }
                        catch (e) { setError(e.message || (isAr ? 'تعذر مسح السجل.' : isTr ? 'Geçmiş silinemedi.' : 'Could not clear history.')); }
                        finally { setClearLogLoading(false); }
                      }}
                      disabled={clearLogLoading}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {clearLogLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {logLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isAr ? 'جارِ التحميل...' : isTr ? 'Yükleniyor...' : 'Loading...'}
                  </div>
                ) : log.length === 0 ? (
                  <p className="text-sm text-gray-600">{isAr ? 'لم يتم حفظ وجبات بعد.' : isTr ? 'Henüz kayıtlı öğün yok.' : 'No meals saved yet.'}</p>
                ) : (
                  <ul className="space-y-3 max-h-80 overflow-y-auto">
                    {log.map((entry) => (
                      <li key={entry.id} className="p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-sm font-semibold text-white">{entry.meal_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span style={{ color: carbColor(entry.carb_level) }}>{carbLabel(entry.carb_level)}</span>
                          {' '}carb · {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                        </p>
                        {entry.healthier_swaps && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entry.healthier_swaps}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
