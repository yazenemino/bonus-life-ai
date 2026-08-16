import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Stethoscope, Loader2, MapPin, Activity, ArrowLeft } from 'lucide-react';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { AnimatedSelect } from '../components/ui/AnimatedSelect';
import { NumberField } from '../components/ui/NumberField';
import { ROUTES } from '../config/constants';
import { symptomCheckerPredict } from '../services/api';

export default function SymptomChecker({ language = 'english' }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fever: '', cough: '', fatigue: '', difficultyBreathing: '',
    age: '', gender: '', bloodPressure: '', cholesterol: '',
  });
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const t = isAr ? {
    badge: 'أداة', title: 'فحص الأعراض', subtitle: 'تعرّف على الحالات الصحية المحتملة بناءً على أعراضك ومعلوماتك الشخصية.',
    warning: 'هذه المعلومات للإرشاد فقط. راجع دائماً الطبيب المختص للتشخيص. في حالات الطوارئ اتصل بـ 911/112.',
    fever: 'الحمى', cough: 'السعال', fatigue: 'الإعياء', difficultyBreathing: 'صعوبة التنفس',
    age: 'العمر', gender: 'الجنس', bloodPressure: 'ضغط الدم', cholesterol: 'الكوليسترول',
    yes: 'نعم', no: 'لا', male: 'ذكر', female: 'أنثى', high: 'مرتفع', normal: 'طبيعي',
    getPrediction: 'احصل على التوقع', predicting: 'جاري التوقع...', results: 'المجموعات المرضية المحتملة', probability: 'الاحتمالية',
    possibleConditions: 'الحالات المحتملة', findHospitals: 'ابحث عن مستشفيات قريبة',
    errorGeneric: 'تعذر الحصول على التوقع. يرجى المحاولة لاحقاً.', fillAll: 'يرجى ملء جميع الحقول المطلوبة.',
    symptoms: 'الأعراض', profile: 'الملف الشخصي',
  } : isTr ? {
    badge: 'Araç', title: 'Belirti Kontrolü', subtitle: 'Belirti ve profil bilgilerinize göre olası durum gruplarını görün.',
    warning: 'Bu yalnızca bilgilendirme amaçlıdır. Teşhis için mutlaka bir sağlık uzmanına başvurun. Acil durumlarda 911/112 arayın.',
    fever: 'Ateş', cough: 'Öksürük', fatigue: 'Yorgunluk', difficultyBreathing: 'Nefes almada zorluk',
    age: 'Yaş', gender: 'Cinsiyet', bloodPressure: 'Kan basıncı', cholesterol: 'Kolesterol',
    yes: 'Evet', no: 'Hayır', male: 'Erkek', female: 'Kadın', high: 'Yüksek', normal: 'Normal',
    getPrediction: 'Tahmin Al', predicting: 'Tahmin ediliyor...', results: 'Olası durum grupları', probability: 'Olasılık',
    possibleConditions: 'Olası hastalıklar', findHospitals: 'Yakındaki hastaneleri bul',
    errorGeneric: 'Tahmin alınamadı. Lütfen tekrar deneyin.', fillAll: 'Lütfen tüm alanları doldurun.',
    symptoms: 'Belirtiler', profile: 'Profil',
  } : {
    badge: 'Tool', title: 'Symptom Checker', subtitle: 'See possible condition groups based on your symptoms and profile.',
    warning: 'This is for information only. Always see a healthcare provider for diagnosis. In emergencies, call 911/112.',
    fever: 'Fever', cough: 'Cough', fatigue: 'Fatigue', difficultyBreathing: 'Difficulty breathing',
    age: 'Age', gender: 'Gender', bloodPressure: 'Blood pressure', cholesterol: 'Cholesterol',
    yes: 'Yes', no: 'No', male: 'Male', female: 'Female', high: 'High', normal: 'Normal',
    getPrediction: 'Get prediction', predicting: 'Predicting...', results: 'Possible condition groups', probability: 'Probability',
    possibleConditions: 'Possible conditions', findHospitals: 'Find nearby hospitals',
    errorGeneric: 'Could not get prediction. Please try again.', fillAll: 'Please fill in all fields.',
    symptoms: 'Symptoms', profile: 'Profile',
  };

  const update = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { fever, cough, fatigue, difficultyBreathing, age, gender, bloodPressure, cholesterol } = form;
    if ([fever, cough, fatigue, difficultyBreathing, age, gender, bloodPressure, cholesterol].some((v) => v === '')) {
      setError(t.fillAll); return;
    }
    setError(null); setPredictions(null); setLoading(true);
    try {
      const result = await symptomCheckerPredict({
        fever: parseInt(fever, 10), cough: parseInt(cough, 10), fatigue: parseInt(fatigue, 10),
        difficultyBreathing: parseInt(difficultyBreathing, 10), age: parseFloat(age), gender: parseInt(gender, 10),
        bloodPressure: parseInt(bloodPressure, 10), cholesterol: parseInt(cholesterol, 10),
        language,
      });
      setPredictions(result.predictions || []);
    } catch (err) {
      setError(err?.message || t.errorGeneric); setPredictions(null);
    } finally { setLoading(false); }
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
  };

  const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-32 pb-16"
      style={{ fontFamily: language === 'arabic' ? "'Tajawal','Figtree','Inter',sans-serif" : "'Figtree','Inter',sans-serif" }} dir={language === 'arabic' ? 'rtl' : 'ltr'}>

      <div className="fixed top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08), transparent 70%)', filter: 'blur(80px)' }} />

      {/* Back to Dashboard */}
      <button onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group relative z-10">
        <ArrowLeft className={`w-4 h-4 transition-transform ${language === 'arabic' ? 'rotate-180 group-hover:translate-x-0.5' : 'group-hover:-translate-x-0.5'}`} />
        {language === 'arabic' ? 'العودة إلى لوحة التحكم' : isTr ? 'Dashboard\'a Geri Dön' : 'Back to Dashboard'}
      </button>

      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{t.title}</h1>
        <p className="text-gray-500 max-w-md mx-auto">{t.subtitle}</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-xl text-red-300 text-sm relative z-10"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-5 h-5 shrink-0" />{error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="relative z-10 mb-6">
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), rgba(6,182,212,0.3), transparent)' }} />
          <div className="p-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {/* Symptoms column */}
              <div>
                <h2 className="font-bold text-white text-base mb-5 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#7C3AED' }} />
                  {t.symptoms}
                </h2>
                <div className="space-y-4">
                  {['fever', 'cough', 'fatigue', 'difficultyBreathing'].map((f) => (
                    <div key={f}>
                      <label className={labelCls}>{t[f]}</label>
                      <AnimatedSelect
                        value={form[f]}
                        onChange={update(f)}
                        placeholder={language === 'arabic' ? 'اختر' : isTr ? 'Seçiniz' : 'Select'}
                        options={[{ value: '1', label: t.yes }, { value: '0', label: t.no }]}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Profile column */}
              <div>
                <h2 className="font-bold text-white text-base mb-5 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#06B6D4' }} />
                  {t.profile}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>{t.age}</label>
                    <NumberField value={form.age} onChange={update('age')} min={0} max={120} step={1} placeholder="e.g. 35" accentColor="violet" />
                  </div>
                  {[
                    ['gender', [['1', t.male], ['0', t.female]]],
                    ['bloodPressure', [['1', t.high], ['0', t.normal]]],
                    ['cholesterol', [['1', t.high], ['0', t.normal]]],
                  ].map(([field, opts]) => (
                    <div key={field}>
                      <label className={labelCls}>{t[field]}</label>
                      <AnimatedSelect
                        value={form[field]}
                        onChange={update(field)}
                        placeholder={language === 'arabic' ? 'اختر' : isTr ? 'Seçiniz' : 'Select'}
                        options={opts.map(([val, label]) => ({ value: val, label }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <LiquidMetalButton type="submit" disabled={loading} width={200}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.predicting}</> : <><Stethoscope className="w-4 h-4" /> {t.getPrediction}</>}
              </LiquidMetalButton>
            </div>
          </div>
        </div>
      </form>

      {/* Results */}
      {predictions && predictions.length > 0 && (
        <div className="relative z-10 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)' }}>
          <div className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)' }} />
          <div className="p-7">
            <h3 className="font-bold text-white text-lg mb-5 flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-400" /> {t.results}
            </h3>
            <div className="space-y-4">
              {predictions.map((p, i) => (
                <div key={i} className="p-4 rounded-xl space-y-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-white text-sm">{p.disease}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.round((p.probability || 0) * 100)}%`, background: 'linear-gradient(90deg, #7C3AED, #06B6D4)' }} />
                      </div>
                      <span className="text-sm font-bold w-12 text-right" style={{ color: '#A78BFA' }}>
                        {(p.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {Array.isArray(p.disease_examples ?? p.diseaseExamples) && (p.disease_examples ?? p.diseaseExamples).length > 0 && (
                    <p className="text-xs text-gray-500">
                      <span className="text-gray-600">{t.possibleConditions}: </span>
                      {(p.disease_examples ?? p.diseaseExamples).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-4">{t.warning}</p>
            <button type="button" onClick={() => navigate(ROUTES.HOSPITALS)}
              className="w-full flex items-center justify-center gap-2 py-3 mt-5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.3)'; e.currentTarget.style.color = '#A78BFA'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9CA3AF'; }}>
              <MapPin className="w-4 h-4 shrink-0" /> {t.findHospitals}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
