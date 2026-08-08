import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { Upload, X, Loader2, AlertTriangle, CheckCircle2, ChevronLeft, Brain, Activity, ChevronDown, ChevronUp, Download, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildAndDownloadSignedMriPDF } from '../utils/assessmentPdf';
import { API_BASE_URL, ROUTES } from '../config/constants';
import apiService, { getStoredToken } from '../services/api';

const TUMOR_COLORS = {
  'no tumor':   { bg: 'rgba(16,185,129,0.05)',  border: 'rgba(16,185,129,0.14)',  text: '#6ee7b7', bar: 'linear-gradient(90deg,#059669,#10B981)' },
  'glioma':     { bg: 'rgba(239,68,68,0.05)',   border: 'rgba(239,68,68,0.14)',   text: '#fca5a5', bar: 'linear-gradient(90deg,#b91c1c,#EF4444)' },
  'meningioma': { bg: 'rgba(180,120,30,0.07)',  border: 'rgba(180,120,30,0.18)',  text: '#c49a3c', bar: 'linear-gradient(90deg,#92400e,#d97706)' },
  'pituitary':  { bg: 'rgba(109,40,217,0.06)',  border: 'rgba(109,40,217,0.18)', text: '#c4b5fd', bar: 'linear-gradient(90deg,#5b21b6,#7C3AED)' },
};
const DEFAULT_COLORS = { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#6B7280', bar: 'rgba(107,114,128,0.4)' };

function TumorProbBar({ label, value, active }) {
  const pct = Math.round((value || 0) * 100);
  const c = TUMOR_COLORS[label] || DEFAULT_COLORS;
  return (
    <div className="rounded-xl px-4 py-3 mb-2 transition-all"
      style={{ background: active ? c.bg : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.06)'}` }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold capitalize" style={{ color: active ? c.text : '#6B7280' }}>{label}</span>
        <span className="text-sm font-bold" style={{ color: active ? c.text : '#4B5563' }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: active ? c.bar : 'rgba(255,255,255,0.1)' }} />
      </div>
    </div>
  );
}

export default function BrainMRI({ language }) {
  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (location.state?.assessment) {
      const a = location.state.assessment;
      const normalized = {
        ...a, model_available: true,
        risk_analysis: {
          tumor_class: a.tumor_class || a.risk_analysis?.tumor_class || '',
          confidence: a.confidence ?? a.risk_analysis?.confidence,
          severity: a.severity || a.risk_analysis?.severity || '',
          tumor_description: a.tumor_description || a.risk_analysis?.tumor_description || '',
          all_probabilities: a.all_probabilities || a.risk_analysis?.all_probabilities || {},
        },
        recommendations: a.recommendations || {},
        executive_summary: a.executive_summary || '',
      };
      setResult(normalized);
    }
  }, [location.state]);

  const isViewMode = Boolean(location.state?.assessment);

  const handleExportPDF = async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      const { default: apiService } = await import('../services/api');
      await buildAndDownloadSignedMriPDF(result, user, false, apiService);
    } catch (err) { setError(err.message || 'Failed to export PDF'); }
    finally { setIsExporting(false); }
  };

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please upload an image file (JPG, PNG).'); return; }
    setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const submit = async () => {
    if (!file) { setError('Please upload a brain MRI image.'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const form = new FormData();
      form.append('image', file); form.append('language', 'english');
      const token = await getStoredToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/brain-mri-analysis`, { method: 'POST', body: form, headers });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Server error ${res.status}`); }
      setResult(await res.json());
    } catch (e) { setError(e.message || 'Analysis failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const riskAnalysis = result?.risk_analysis || {};
  const tumorClass = riskAnalysis.tumor_class || '';
  const confidence = riskAnalysis.confidence;
  const allProbs = riskAnalysis.all_probabilities || {};
  const description = riskAnalysis.tumor_description || '';
  const recommendations = result?.recommendations || {};
  const tumorColors = TUMOR_COLORS[tumorClass] || DEFAULT_COLORS;
  const isNoTumor = tumorClass === 'no tumor';
  const confidencePct = confidence != null ? Math.round(confidence * 100) : null;

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
  };

  return (
    <div className="min-h-screen pt-32 pb-16 px-4" style={{ fontFamily: "'Figtree','Inter',sans-serif" }}>
      <div className="fixed top-1/3 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08), transparent 70%)', filter: 'blur(80px)' }} />

      <div className="max-w-2xl mx-auto relative z-10">
        {/* Back to Dashboard */}
        {!isViewMode && (
          <button onClick={() => navigate(ROUTES.DASHBOARD)}
            className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group">
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            {isAr ? 'العودة للوحة التحكم' : isTr ? 'Panele Dön' : 'Back to Dashboard'}
          </button>
        )}

        {/* Back link - view mode */}
        {isViewMode && (
          <div className="mb-6">
            <Link to={ROUTES.DASHBOARD}
              className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-violet-400"
              style={{ color: '#A78BFA' }}>
              <ChevronLeft className="w-5 h-5" />
              {isAr ? '← العودة للوحة التحكم' : isTr ? '← Panele Dön' : '← Back to Dashboard'}
            </Link>
          </div>
        )}

        {/* Header */}
        {!isViewMode && (
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
              {isAr ? 'تحليل الرنين المغناطيسي للدماغ' : isTr ? 'Beyin MR Analizi' : 'Brain MRI Analysis'}
            </h1>
            <p className="text-gray-500 text-sm max-w-lg mx-auto leading-relaxed">
              {isAr ? 'قم برفع صورة رنين مغناطيسي للدماغ لتصنيف الأورام بمساعدة الذكاء الاصطناعي. يكتشف الورم الدبقي، السحائي، النخامي، أو الأنسجة السليمة.' : isTr ? 'Yapay zeka destekli tümör sınıflandırması için beyin MR taramasını yükleyin. Gliyom, menenjiyom, hipofiz tümörleri veya sağlıklı dokuyu tanımlar.' : 'Upload a brain MRI scan for AI-assisted tumor classification. Identifies glioma, meningioma, pituitary tumors, or healthy brain tissue.'}
            </p>
          </div>
        )}

        {!isViewMode && (
          <>
            {/* Tumor class legend */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {Object.entries(TUMOR_COLORS).map(([label, c]) => (
                <div key={label} className="rounded-xl px-4 py-3"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                  <p className="text-xs font-bold uppercase tracking-wider capitalize" style={{ color: c.text }}>
                    {isAr ? (label === 'no tumor' ? 'سليم' : label === 'glioma' ? 'ورم دبقي' : label === 'meningioma' ? 'ورم سحائي' : 'ورم نخامي') : isTr ? (label === 'no tumor' ? 'Tümör Yok' : label === 'glioma' ? 'Gliyom' : label === 'meningioma' ? 'Menenjiyom' : 'Hipofiz') : label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isAr ? (label === 'no tumor' ? 'أنسجة سليمة' : label === 'glioma' ? 'ورم الخلايا الدبقية' : label === 'meningioma' ? 'ورم الأغشية' : 'ورم الغدة النخامية') : isTr ? (label === 'no tumor' ? 'Sağlıklı doku' : label === 'glioma' ? 'Glial hücre tümörü' : label === 'meningioma' ? 'Zar tümörü' : 'Hipofiz bezi') : (label === 'no tumor' ? 'Healthy tissue' : label === 'glioma' ? 'Glial cell tumor' : label === 'meningioma' ? 'Membrane tumor' : 'Pituitary gland')}
                  </p>
                </div>
              ))}
            </div>

            {/* Upload card */}
            <div className="rounded-2xl overflow-hidden mb-6" style={cardStyle}>
              <div className="h-px w-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.3), transparent)' }} />
              <div className="p-6">
                <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-violet-400" /> {isAr ? 'رفع صورة الرنين' : isTr ? 'MR Taramasını Yükle' : 'Upload MRI Scan'}
                </h2>
                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200"
                  style={{ borderColor: dragging ? '#7C3AED' : 'rgba(255,255,255,0.1)', background: dragging ? 'rgba(124,58,237,0.05)' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)'}
                  onMouseLeave={e => { if (!dragging) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  {preview ? (
                    <div className="relative inline-block">
                      <img src={preview} alt="MRI preview" className="max-h-52 rounded-xl object-contain mx-auto" />
                      <button
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.12)' }}
                        onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); setResult(null); }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                        style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                        <Brain className="w-7 h-7 text-violet-400" />
                      </div>
                      <p className="text-white font-semibold mb-1">{isAr ? 'اسحب صورة الرنين إلى هنا' : isTr ? 'MR görüntüsünü buraya sürükleyin' : 'Drop MRI image here'}</p>
                      <p className="text-gray-500 text-sm">{isAr ? 'JPG أو PNG، حتى 10 ميجابايت' : isTr ? 'JPG veya PNG, 10 MB\'a kadar' : 'JPG or PNG, up to 10 MB'}</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleFile(e.target.files?.[0])} />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="flex justify-center mb-8">
              <LiquidMetalButton onClick={submit} disabled={loading || !file} width={200}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {isAr ? 'جاري التحليل...' : isTr ? 'Analiz ediliyor...' : 'Analyzing...'}</> : <><Activity className="w-4 h-4" /> {isAr ? 'تحليل الصورة' : isTr ? 'MR Analizi Yap' : 'Analyze MRI Scan'}</>}
              </LiquidMetalButton>
            </div>
          </>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-violet-400" /> {isAr ? 'نتائج التصنيف' : isTr ? 'Sınıflandırma Sonuçları' : 'Classification Results'}
            </h2>

            {/* Primary result */}
            {!result.model_available ? (
              <div className="rounded-2xl p-5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p className="font-bold" style={{ color: '#FCD34D' }}>{isAr ? 'النموذج غير متاح' : isTr ? 'Model Kullanılamıyor' : 'Model Unavailable'}</p>
                <p className="text-gray-400 text-sm mt-1">{description}</p>
              </div>
            ) : (
              <div className="rounded-2xl p-6"
                style={{ background: tumorColors.bg, border: `1px solid ${tumorColors.border}` }}>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{isAr ? 'التصنيف' : isTr ? 'Sınıflandırma' : 'Classification'}</p>
                <p className="text-3xl font-black capitalize mb-2" style={{ color: tumorColors.text }}>{tumorClass}</p>
                {confidencePct != null && (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${confidencePct}%`, background: tumorColors.bar }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: tumorColors.text }}>{confidencePct}%</span>
                  </div>
                )}
                {description && <p className="text-gray-400 text-sm mt-3 leading-relaxed">{description}</p>}
              </div>
            )}

            {/* All class probabilities */}
            {Object.keys(allProbs).length > 0 && (
              <div className="rounded-2xl p-5" style={cardStyle}>
                <p className="text-white font-bold mb-4">{isAr ? 'احتمالات جميع الفئات' : isTr ? 'Tüm Sınıf Olasılıkları' : 'All Class Probabilities'}</p>
                {Object.entries(allProbs).map(([label, val]) => (
                  <TumorProbBar key={label} label={label} value={val} active={label === tumorClass} />
                ))}
              </div>
            )}

            {/* Executive Summary */}
            {result.executive_summary && (
              <div className="rounded-2xl overflow-hidden" style={cardStyle}>
                <button onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="w-full flex items-center justify-between p-5 text-left transition-colors"
                  style={{ background: summaryExpanded ? 'rgba(124,58,237,0.05)' : 'transparent' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)' }}>
                      <FileText className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{isAr ? 'الملخص السريري' : isTr ? 'Klinik Özet' : 'Clinical Summary'}</p>
                      <p className="text-gray-500 text-sm">{isAr ? 'تحليل الذكاء الاصطناعي والخطوات التالية' : isTr ? 'Detaylı yapay zeka analizi ve sonraki adımlar' : 'Detailed AI analysis and next steps'}</p>
                    </div>
                  </div>
                  {summaryExpanded
                    ? <ChevronUp className="w-5 h-5 text-gray-500" />
                    : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>

                {summaryExpanded && (
                  <div className="p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
                    <div className="text-gray-300 text-sm leading-relaxed mb-6">
                      {result.executive_summary.split(/\n\s*\n/).map((para, i) => (
                        <p key={i} className="mb-4">{para.replace(/\*+/g, '')}</p>
                      ))}
                    </div>
                    <button onClick={handleExportPDF} disabled={isExporting}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50"
                      style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#A78BFA' }}>
                      {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isExporting ? (isAr ? 'جاري إنشاء التقرير...' : isTr ? 'PDF Oluşturuluyor...' : 'Generating PDF...') : (isAr ? 'تحميل تقرير PDF' : isTr ? 'PDF Raporu İndir' : 'Download PDF Report')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Recommendations */}
            {(recommendations.immediate || (recommendations.lifestyle || []).length > 0) && (
              <div className="rounded-2xl p-5" style={cardStyle}>
                <p className="text-white font-bold mb-3">{isAr ? 'التوصيات' : isTr ? 'Öneriler' : 'Recommendations'}</p>
                {recommendations.immediate && recommendations.immediate.trim() && (
                  <div className="rounded-xl px-4 py-3 mb-3"
                    style={isNoTumor
                      ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }
                      : { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p className="text-sm font-medium" style={{ color: isNoTumor ? '#34D399' : '#FCD34D' }}>
                      {recommendations.immediate}
                    </p>
                  </div>
                )}
                {(recommendations.lifestyle || []).map((r, i) => (
                  <p key={i} className="text-gray-400 text-sm py-1.5 flex items-start gap-2">
                    <span style={{ color: '#A78BFA' }} className="mt-0.5">•</span> {r}
                  </p>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            {result.disclaimer && result.disclaimer.trim() && (
              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)' }}>
                <p className="text-xs leading-relaxed flex items-start gap-2" style={{ color: 'rgba(252,211,77,0.7)' }}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {result.disclaimer}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
