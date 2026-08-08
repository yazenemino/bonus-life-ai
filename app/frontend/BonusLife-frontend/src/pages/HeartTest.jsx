import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle, CheckCircle, Loader2, Heart, Activity, Target, Stethoscope, RotateCcw, Sparkles, LayoutDashboard, ArrowLeft,
} from 'lucide-react';
import * as apiService from '../services/api';
import { haptic } from '../utils/haptics';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../config/constants';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { AnimatedSelect } from '../components/ui/AnimatedSelect';
import { VOICE_FILL_EVENT, VOICE_CLEAR_FIELD_EVENT, VOICE_FORM_NEXT_EVENT } from '../components/VoiceAgent';
import { NumberField as _NumberField } from '../components/ui/NumberField';
const FormField = (props) => <_NumberField {...props} accentColor="pink" />;

const HeartTest = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    age: '', sex: '1', cp: '1', trestbps: '', chol: '', fbs: '0', restecg: '0',
    thalach: '', exang: '0', oldpeak: '0', slope: '1', ca: '0', thal: '3',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const t = isAr ? {
    title: 'تقييم خطر أمراض القلب', subtitle: 'أدخل قيمك السريرية لتحليل خطر القلب بالذكاء الاصطناعي.',
    badge: 'بالذكاء الاصطناعي', submit: 'تحليل', newTest: 'تقييم جديد', loading: 'جاري التحليل...',
    age: 'العمر', sex: 'الجنس', cp: 'نوع ألم الصدر', trestbps: 'ضغط الراحة (mmHg)', chol: 'الكوليسترول (mg/dL)',
    fbs: 'سكر الصيام >120', restecg: 'تخطيط القلب', thalach: 'أقصى معدل قلب', exang: 'ذبحة التمرين',
    oldpeak: 'انخفاض ST', slope: 'ميل ST', ca: 'الأوعية الرئيسية (0-4)', thal: 'الثلاسيميا',
    execSummary: 'الملخص', probLabel: 'احتمالية أمراض القلب', keyRiskFactors: 'عوامل الخطر',
    lifestyleChanges: 'التوصيات', requiredError: 'يرجى ملء الحقول المطلوبة.', negativeError: 'أدخل أرقاماً غير سالبة.',
    savedToAccount: 'تم الحفظ في حسابك.', viewInDashboard: 'عرض في لوحة التحكم',
    sex0: 'أنثى', sex1: 'ذكر', cp0: 'لا يوجد', cp1: 'ذبحة نموذجية', cp2: 'ذبحة غير نموذجية', cp3: 'غير ذبحية', cp4: 'بدون أعراض',
    slope1: 'صاعد', slope2: 'مسطح', slope3: 'نازل', thal3: 'طبيعي', thal6: 'ثابت', thal7: 'عكسي',
    no: 'لا', yes: 'نعم', restecg0: 'طبيعي', restecg1: 'اضطراب ST-T', restecg2: 'تضخم البطين الأيسر',
  } : isTr ? {
    title: 'Kalp Hastalığı Risk Değerlendirmesi', subtitle: 'Klinik değerlerinizi girin; yapay zeka destekli kalp riski analizi.',
    badge: 'Yapay Zeka Destekli', submit: 'Analiz Yap', newTest: 'Yeni Değerlendirme', loading: 'Analiz ediliyor...',
    age: 'Yaş', sex: 'Cinsiyet', cp: 'Göğüs Ağrısı Tipi', trestbps: 'İstirahat Tansiyonu (mmHg)', chol: 'Kolesterol (mg/dL)',
    fbs: 'Açlık Kan Şekeri >120', restecg: 'İstirahat EKG', thalach: 'Maks. Kalp Hızı', exang: 'Egzersiz Anjini',
    oldpeak: 'ST Depresyonu', slope: 'ST Eğimi', ca: 'Ana Damar Sayısı (0-4)', thal: 'Talassemi',
    execSummary: 'Özet', probLabel: 'Kalp hastalığı risk olasılığı', keyRiskFactors: 'Risk Faktörleri',
    lifestyleChanges: 'Öneriler', requiredError: 'Zorunlu alanları doldurun.', negativeError: 'Negatif olmayan sayı girin.',
    savedToAccount: 'Hesabınıza kaydedildi.', viewInDashboard: 'Dashboard\'da görüntüle',
    sex0: 'Kadın', sex1: 'Erkek', cp0: 'Yok', cp1: 'Tipik anjina', cp2: 'Atipik anjina', cp3: 'Anjina dışı', cp4: 'Asemptomatik',
    slope1: 'Yukarı', slope2: 'Düz', slope3: 'Aşağı', thal3: 'Normal', thal6: 'Sabit', thal7: 'Reversibl',
    no: 'Hayır', yes: 'Evet', restecg0: 'Normal', restecg1: 'ST-T Anormalliği', restecg2: 'Sol Ventrikül Hipertrofisi',
  } : {
    title: 'Heart Disease Risk Assessment', subtitle: 'Enter your clinical values for AI-powered heart risk analysis.',
    badge: 'AI-Powered', submit: 'Run Analysis', newTest: 'New Assessment', loading: 'Analyzing...',
    age: 'Age', sex: 'Sex', cp: 'Chest Pain Type', trestbps: 'Resting BP (mmHg)', chol: 'Cholesterol (mg/dL)',
    fbs: 'Fasting Blood Sugar >120', restecg: 'Resting ECG', thalach: 'Max Heart Rate', exang: 'Exercise Angina',
    oldpeak: 'ST Depression', slope: 'ST Slope', ca: 'Major Vessels (0-4)', thal: 'Thalassemia',
    execSummary: 'Summary', probLabel: 'Probability of heart disease', keyRiskFactors: 'Risk Factors',
    lifestyleChanges: 'Recommendations', requiredError: 'Please fill required fields.', negativeError: 'Enter non-negative numbers.',
    savedToAccount: 'Saved to your account.', viewInDashboard: 'View in Dashboard',
    sex0: 'Female', sex1: 'Male', cp0: 'None', cp1: 'Typical angina', cp2: 'Atypical angina', cp3: 'Non-anginal', cp4: 'Asymptomatic',
    slope1: 'Upsloping', slope2: 'Flat', slope3: 'Downsloping', thal3: 'Normal', thal6: 'Fixed', thal7: 'Reversible',
    no: 'No', yes: 'Yes', restecg0: 'Normal', restecg1: 'ST-T Abnormality', restecg2: 'LV Hypertrophy',
  };

  // Voice agent: fill heart form fields
  useEffect(() => {
    const handler = (e) => {
      const { field, value } = e.detail || {};
      const allowed = ['age', 'trestbps', 'chol', 'thalach', 'oldpeak', 'ca'];
      if (field && allowed.includes(field) && value != null) {
        setFormData((prev) => ({ ...prev, [field]: String(value) }));
      }
    };
    window.addEventListener(VOICE_FILL_EVENT, handler);
    return () => window.removeEventListener(VOICE_FILL_EVENT, handler);
  }, []);

  // Voice agent: clear a form field
  useEffect(() => {
    const handler = (e) => {
      const { field } = e.detail || {};
      const allowed = ['age', 'trestbps', 'chol', 'thalach', 'oldpeak', 'ca'];
      if (field && allowed.includes(field)) {
        setFormData((prev) => ({ ...prev, [field]: '' }));
      }
    };
    window.addEventListener(VOICE_CLEAR_FIELD_EVENT, handler);
    return () => window.removeEventListener(VOICE_CLEAR_FIELD_EVENT, handler);
  }, []);

  const handleSubmitRef = useRef(() => {});

  const handleSubmit = async () => {
    setError('');
    const required = ['age', 'trestbps', 'chol', 'thalach'];
    for (const k of required) {
      const v = formData[k];
      if (v === '' || v == null) {
        setError(t.requiredError);
        return;
      }
    }
    const num = (v, def) => (v === '' || v == null ? def : parseFloat(String(v).replace(',', '.')));
    const int = (v, def) => (v === '' || v == null ? def : parseInt(String(v), 10));
    const payload = {
      age: int(formData.age, 0),
      sex: int(formData.sex, 1),
      cp: int(formData.cp, 1),
      trestbps: int(formData.trestbps, 0),
      chol: int(formData.chol, 0),
      fbs: int(formData.fbs, 0),
      restecg: int(formData.restecg, 0),
      thalach: int(formData.thalach, 0),
      exang: int(formData.exang, 0),
      oldpeak: num(formData.oldpeak, 0),
      slope: int(formData.slope, 1),
      ca: int(formData.ca, 0),
      thal: int(formData.thal, 3),
      language,
    };
    if (payload.age < 1 || payload.trestbps < 80 || payload.chol < 100 || payload.thalach < 60) {
      setError(t.negativeError);
      return;
    }
    setLoading(true);
    setSubmitted(true);
    try {
      const data = await apiService.runHeartAssessment(payload);
      haptic('success');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };
  handleSubmitRef.current = handleSubmit;

  // Voice agent: "continue" / "next" runs the analysis
  useEffect(() => {
    const onNext = () => {
      if (!result && !loading) handleSubmitRef.current();
    };
    window.addEventListener(VOICE_FORM_NEXT_EVENT, onNext);
    return () => window.removeEventListener(VOICE_FORM_NEXT_EVENT, onNext);
  }, [result, loading]);

  const handleNewTest = () => {
    setResult(null);
    setError('');
    setSubmitted(false);
    setFormData({
      age: '', sex: '1', cp: '1', trestbps: '', chol: '', fbs: '0', restecg: '0',
      thalach: '', exang: '0', oldpeak: '0', slope: '1', ca: '0', thal: '3',
    });
  };

  const risk = result?.risk_analysis?.risk_level || 'Unknown';
  const RISK_LABEL_MAP = {
    ar: { 'high risk': 'خطر مرتفع', 'moderate risk': 'خطر متوسط', 'low risk': 'خطر منخفض', 'very low risk': 'خطر منخفض جداً', 'unknown': 'غير معروف' },
    tr: { 'high risk': 'Yüksek Risk', 'moderate risk': 'Orta Risk', 'low risk': 'Düşük Risk', 'very low risk': 'Çok Düşük Risk', 'unknown': 'Bilinmiyor' },
  };
  const riskDisplay = (isAr || isTr) ? (RISK_LABEL_MAP[isAr ? 'ar' : 'tr'][risk.toLowerCase()] || risk) : risk;
  const prob = ((result?.risk_analysis?.probability ?? 0) * 100).toFixed(1);
  const factors = result?.risk_analysis?.key_factors || [];
  const recs = result?.recommendations || {};
  const isHigh = risk.toLowerCase().includes('high');
  const isMod = risk.toLowerCase().includes('moderate');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-32 pb-16">
      {/* Back to Dashboard */}
      <button onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        {isAr ? 'العودة للوحة التحكم' : isTr ? 'Panele Dön' : 'Back to Dashboard'}
      </button>

      <div className="text-center mb-10 animate-fade-in-up">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{t.title}</h1>
        <p className="text-gray-500 max-w-md mx-auto">{t.subtitle}</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      <div className="gradient-border animate-fade-in-up heart-form-card">
        <div className="card heart-form-inner p-8 sm:p-10 rounded-[1.25rem]">
          {!submitted || !result ? (
            <>
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white">{t.title}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField label={t.age} value={formData.age} onChange={(e) => setFormData(p => ({ ...p, age: e.target.value }))} required placeholder="e.g. 55" icon={Activity} />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.sex}</label>
                  <AnimatedSelect
                    value={formData.sex}
                    onChange={(e) => setFormData(p => ({ ...p, sex: e.target.value }))}
                    options={[{ value: '0', label: t.sex0 }, { value: '1', label: t.sex1 }]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.cp}</label>
                  <AnimatedSelect
                    value={formData.cp}
                    onChange={(e) => setFormData(p => ({ ...p, cp: e.target.value }))}
                    options={[
                      { value: '0', label: t.cp0 },
                      { value: '1', label: t.cp1 },
                      { value: '2', label: t.cp2 },
                      { value: '3', label: t.cp3 },
                      { value: '4', label: t.cp4 },
                    ]}
                  />
                </div>
                <FormField label={t.trestbps} value={formData.trestbps} onChange={(e) => setFormData(p => ({ ...p, trestbps: e.target.value }))} required hint="80–250 mmHg" placeholder="e.g. 130" />
                <FormField label={t.chol} value={formData.chol} onChange={(e) => setFormData(p => ({ ...p, chol: e.target.value }))} required placeholder="e.g. 240" />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.fbs}</label>
                  <AnimatedSelect
                    value={formData.fbs}
                    onChange={(e) => setFormData(p => ({ ...p, fbs: e.target.value }))}
                    options={[{ value: '0', label: t.no }, { value: '1', label: t.yes }]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.restecg}</label>
                  <AnimatedSelect
                    value={formData.restecg}
                    onChange={(e) => setFormData(p => ({ ...p, restecg: e.target.value }))}
                    options={[
                      { value: '0', label: t.restecg0 },
                      { value: '1', label: t.restecg1 },
                      { value: '2', label: t.restecg2 },
                    ]}
                  />
                </div>
                <FormField label={t.thalach} value={formData.thalach} onChange={(e) => setFormData(p => ({ ...p, thalach: e.target.value }))} required hint="60–220 bpm" placeholder="e.g. 150" />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.exang}</label>
                  <AnimatedSelect
                    value={formData.exang}
                    onChange={(e) => setFormData(p => ({ ...p, exang: e.target.value }))}
                    options={[{ value: '0', label: t.no }, { value: '1', label: t.yes }]}
                  />
                </div>
                <FormField label={t.oldpeak} value={formData.oldpeak} onChange={(e) => setFormData(p => ({ ...p, oldpeak: e.target.value }))} hint="0–10" placeholder="0" />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.slope}</label>
                  <AnimatedSelect
                    value={formData.slope}
                    onChange={(e) => setFormData(p => ({ ...p, slope: e.target.value }))}
                    options={[
                      { value: '1', label: t.slope1 },
                      { value: '2', label: t.slope2 },
                      { value: '3', label: t.slope3 },
                    ]}
                  />
                </div>
                <FormField label={t.ca} value={formData.ca} onChange={(e) => setFormData(p => ({ ...p, ca: e.target.value }))} hint="0–4" placeholder="0" />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">{t.thal}</label>
                  <AnimatedSelect
                    value={formData.thal}
                    onChange={(e) => setFormData(p => ({ ...p, thal: e.target.value }))}
                    options={[
                      { value: '3', label: t.thal3 },
                      { value: '6', label: t.thal6 },
                      { value: '7', label: t.thal7 },
                    ]}
                  />
                </div>
              </div>
              <div className="mt-8 flex gap-4">
                <LiquidMetalButton onClick={handleSubmit} disabled={loading} width={180}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</> : <><Activity className="w-4 h-4" /> {t.submit}</>}
                </LiquidMetalButton>
              </div>
            </>
          ) : (
            <>
              {loading ? (
                <div className="flex flex-col items-center py-24 gap-6">
                  <Loader2 className="w-12 h-12 text-violet-400 animate-spin" />
                  <p className="text-gray-400 font-medium">{t.loading}</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {result.executive_summary && (
                    <div className="gradient-border">
                      <div className="card p-6 rounded-[1.25rem] bg-white/[0.02]">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                            <Stethoscope className="w-5 h-5 text-pink-400" />
                          </div>
                          <div>
                            <h3 className="font-bold text-white mb-2 text-lg">{t.execSummary}</h3>
                            <div className="text-sm text-gray-400 leading-relaxed">
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  strong: ({ children }) => <strong className="font-semibold text-gray-200">{children}</strong>,
                                }}
                              >
                                {result.executive_summary}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={`card p-7 border-2 ${isHigh ? 'border-red-500/20 bg-red-500/[0.04]' : isMod ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-violet-500/20 bg-violet-500/[0.04]'}`}>
                      <Target className={`w-6 h-6 mb-4 ${isHigh ? 'text-red-400' : isMod ? 'text-amber-400' : 'text-violet-400'}`} />
                      <div className={`text-5xl font-black mb-2 ${isHigh ? 'text-red-400' : isMod ? 'text-amber-400' : 'text-violet-400'}`}>{prob}%</div>
                      <div className={`text-sm font-bold mb-3 ${isHigh ? 'text-red-300' : isMod ? 'text-amber-300' : 'text-violet-300'}`}>{riskDisplay}</div>
                      <p className="text-xs text-gray-500">{t.probLabel}</p>
                    </div>
                    <div className="card p-7">
                      <h3 className="font-bold text-white mb-4 text-lg">{t.keyRiskFactors}</h3>
                      {factors.length > 0 ? (
                        <ul className="space-y-3">
                          {factors.map((f, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span className={`badge mt-0.5 ${(f.severity || '').toLowerCase().includes('high') ? 'bg-red-500/20 text-red-400' : (f.severity || '').toLowerCase().includes('moderate') ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/20 text-violet-400'}`}>
                                {f.severity || 'Info'}
                              </span>
                              <span className="text-sm text-gray-300">{f.factor}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-gray-500">No major factors from inputs.</p>}
                    </div>
                  </div>
                  {recs.lifestyle_changes && recs.lifestyle_changes.length > 0 && (
                    <div className="card p-6">
                      <h3 className="font-bold text-white mb-4 text-lg">{t.lifestyleChanges}</h3>
                      <ul className="list-disc list-inside space-y-2 text-sm text-gray-400">
                        {recs.lifestyle_changes.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {user && (
                    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-pink-500/10 border border-pink-500/20">
                      <CheckCircle className="w-5 h-5 text-pink-400 shrink-0" />
                      <span className="text-sm text-pink-200">{t.savedToAccount}</span>
                      <Link to={`${ROUTES.DASHBOARD}?tab=assessments&type=heart`} className="inline-flex items-center gap-1.5 text-sm font-medium text-pink-400 hover:text-pink-300 transition">
                        <LayoutDashboard className="w-4 h-4" /> {t.viewInDashboard}
                      </Link>
                    </div>
                  )}
                  <button type="button" onClick={handleNewTest} className="btn-secondary flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> {t.newTest}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeartTest;
