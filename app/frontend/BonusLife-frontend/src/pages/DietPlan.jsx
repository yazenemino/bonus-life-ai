import React, { useState, useEffect } from 'react';
import { NumberField } from '../components/ui/NumberField';
import { AnimatedSelect } from '../components/ui/AnimatedSelect';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import {
  Salad, Download, Calculator, Loader2, AlertTriangle, CheckCircle,
  UtensilsCrossed, ShoppingCart, Lightbulb, BarChart3, Clock, Sparkles,
  Apple, Dumbbell, Save, RotateCcw, ClipboardList, ArrowLeft,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, ROUTES } from '../config/constants';
import { getStoredToken, generateDietPlan as apiGenerateDietPlan } from '../services/api';

/* Stable form components (defined outside so inputs keep focus while typing) */
function FormInput({ label, value, onChange, type = 'text', required, hint, placeholder, error, ...rest }) {
  const isNegativeError = !!error;
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-300 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        className={`input-field ${isNegativeError ? 'border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20' : ''}`}
        {...rest}
      />
      {isNegativeError && <p className="text-[11px] text-red-400 font-medium mt-1.5">{error}</p>}
      {hint && !isNegativeError && <p className="text-[11px] text-gray-600 mt-1.5">{hint}</p>}
    </div>
  );
}

function FormSelect({ label, value, onChange, options, selectLabel }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-300 mb-2">
        {label}
      </label>
      <AnimatedSelect
        value={value ?? ''}
        onChange={onChange}
        options={options}
        placeholder={selectLabel}
      />
    </div>
  );
}

const DietPlan = ({ language = 'english' }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    age: '', weight: '', height: '', gender: '', dietaryPreference: 'balanced',
    healthConditions: '', activityLevel: 'moderate', goals: 'diabetes_prevention',
    allergies: '', typicalDay: '',
  });
  const [dietPlan, setDietPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedPlans, setSavedPlans] = useState([]);
  const [showSaved, setShowSaved] = useState(false);

  // Feature f8: Load user preferences from profile to pre-fill
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return;
        const user = await res.json();
        if (user.dietary_preference) {
          setFormData(prev => ({
            ...prev,
            dietaryPreference: user.dietary_preference || prev.dietaryPreference,
            allergies: user.allergies || prev.allergies,
          }));
        }
      } catch {}
      // Load saved plans
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/me/diet-plans?limit=10`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const plans = await res.json();
          setSavedPlans(Array.isArray(plans) ? plans : []);
        }
      } catch {}
    })();
  }, []);

  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const t = isAr ? {
    badge: 'تغذية بالذكاء الاصطناعي', title: 'مخطط النظام الغذائي', subtitle: 'خطط وجبات مخصصة بالذكاء الاصطناعي للوقاية من السكري وإدارته.',
    bodyMetrics: 'مقاييس الجسم', preferences: 'التفضيلات', additionalInfo: 'معلومات إضافية',
    age: 'العمر', weight: 'الوزن (كغ)', height: 'الطول (سم)', gender: 'الجنس', select: 'اختر...',
    male: 'ذكر', female: 'أنثى', bmi: 'مؤشر كتلة الجسم', dailyCalories: 'السعرات الحرارية اليومية', goal: 'الهدف', kcalDay: 'سعرة حرارية/يوم',
    dietType: 'نوع النظام الغذائي', activityLevel: 'مستوى النشاط', goalLabel: 'الهدف',
    healthConditions: 'الحالات الصحية', allergies: 'الحساسية', dailyRoutine: 'الروتين اليومي',
    placeholders: { health: 'مثال: ارتفاع ضغط الدم', allergies: 'مثال: الغلوتين', routine: 'مثال: الاستيقاظ 7 صباحاً' },
    generate: 'إنشاء خطة غذائية', generating: 'جاري الإنشاء...', planGenerated: 'تم إنشاء الخطة!',
    savedToDashboard: 'تم الحفظ في لوحة التحكم.', viewInDashboard: 'عرض في لوحة التحكم',
    yourPlan: 'خطتك الغذائية', generatedBy: 'تم إنشاؤها بالذكاء الاصطناعي بناءً على ملفك الشخصي',
    overview: 'نظرة عامة', dailyMeals: 'الوجبات اليومية', groceries: 'قائمة التسوق', importantNotes: 'ملاحظات هامة',
    calories: 'السعرات', protein: 'البروتين', carbs: 'الكربوهيدرات', fat: 'الدهون',
    underweight: 'نقص وزن', normal: 'طبيعي', overweight: 'وزن زائد', obese: 'سمنة',
    dietOptions: [{ value: 'balanced', label: 'متوازن' }, { value: 'vegetarian', label: 'نباتي' }, { value: 'non-vegetarian', label: 'غير نباتي' }, { value: 'vegan', label: 'نباتي صرف' }, { value: 'mediterranean', label: 'حمية البحر المتوسط' }, { value: 'low_carb', label: 'منخفض الكربوهيدرات' }, { value: 'diabetic_friendly', label: 'مناسب لمرضى السكري' }],
    activityOptions: [{ value: 'sedentary', label: 'خامل' }, { value: 'light', label: 'نشاط خفيف' }, { value: 'moderate', label: 'نشاط متوسط' }, { value: 'active', label: 'نشط' }, { value: 'very_active', label: 'نشط جداً' }],
    goalOptions: [{ value: 'diabetes_prevention', label: 'الوقاية من السكري' }, { value: 'blood_sugar_control', label: 'التحكم في سكر الدم' }, { value: 'weight_loss', label: 'خسارة الوزن' }, { value: 'weight_gain', label: 'زيادة الوزن' }, { value: 'maintenance', label: 'المحافظة على الوزن' }, { value: 'gestational_diabetes', label: 'سكري الحمل' }],
    goalDisplay: { diabetes_prevention: 'الوقاية من السكري', blood_sugar_control: 'التحكم في سكر الدم', weight_loss: 'خسارة الوزن', weight_gain: 'زيادة الوزن', maintenance: 'المحافظة على الوزن', gestational_diabetes: 'سكري الحمل' },
    negativeError: 'يرجى إدخال رقم موجب.',
  } : isTr ? {
    badge: 'Yapay Zeka Beslenme', title: 'Diyet Planı', subtitle: 'Diyabet önleme ve yönetimi için kişiselleştirilmiş yapay zeka destekli öğün planları.',
    bodyMetrics: 'Vücut Ölçüleri', preferences: 'Tercihler', additionalInfo: 'Ek Bilgi',
    age: 'Yaş', weight: 'Kilo (kg)', height: 'Boy (cm)', gender: 'Cinsiyet', select: 'Seçin...',
    male: 'Erkek', female: 'Kadın', bmi: 'VKİ', dailyCalories: 'Günlük Kalori', goal: 'Hedef', kcalDay: 'kcal/gün',
    dietType: 'Diyet Tipi', activityLevel: 'Aktivite Seviyesi', goalLabel: 'Hedef',
    healthConditions: 'Sağlık Durumu', allergies: 'Alerjiler', dailyRoutine: 'Günlük Rutin',
    placeholders: { health: 'örn. yüksek tansiyon', allergies: 'örn. glüten', routine: 'örn. 07:00\'da kalk' },
    generate: 'Diyet Planı Oluştur', generating: 'Oluşturuluyor...', planGenerated: 'Plan oluşturuldu!',
    savedToDashboard: 'Kontrol paneline kaydedildi.', viewInDashboard: 'Kontrol panelinde görüntüle',
    yourPlan: 'Diyet Planınız', generatedBy: 'Profilinize göre yapay zeka tarafından oluşturuldu',
    overview: 'Genel Bakış', dailyMeals: 'Günlük Öğünler', groceries: 'Alışveriş Listesi', importantNotes: 'Önemli Notlar',
    calories: 'Kalori', protein: 'Protein', carbs: 'Karbonhidrat', fat: 'Yağ',
    underweight: 'Zayıf', normal: 'Normal', overweight: 'Fazla Kilolu', obese: 'Obez',
    dietOptions: [{ value: 'balanced', label: 'Dengeli' }, { value: 'vegetarian', label: 'Vejetaryen' }, { value: 'non-vegetarian', label: 'Vejetaryen Değil' }, { value: 'vegan', label: 'Vegan' }, { value: 'mediterranean', label: 'Akdeniz' }, { value: 'low_carb', label: 'Düşük Karbonhidrat' }, { value: 'diabetic_friendly', label: 'Diyabet Dostu' }],
    activityOptions: [{ value: 'sedentary', label: 'Hareketsiz' }, { value: 'light', label: 'Hafif' }, { value: 'moderate', label: 'Orta' }, { value: 'active', label: 'Aktif' }, { value: 'very_active', label: 'Çok Aktif' }],
    goalOptions: [{ value: 'diabetes_prevention', label: 'Diyabet Önleme' }, { value: 'blood_sugar_control', label: 'Kan Şekeri Kontrolü' }, { value: 'weight_loss', label: 'Kilo Verme' }, { value: 'weight_gain', label: 'Kilo Alma' }, { value: 'maintenance', label: 'Koruma' }, { value: 'gestational_diabetes', label: 'Gestasyonel Diyabet' }],
    goalDisplay: { diabetes_prevention: 'Diyabet önleme', blood_sugar_control: 'Kan şekeri kontrolü', weight_loss: 'Kilo verme', weight_gain: 'Kilo alma', maintenance: 'Koruma', gestational_diabetes: 'Gestasyonel diyabet' },
    negativeError: 'Lütfen negatif olmayan bir sayı girin.',
  } : {
    badge: 'AI Nutrition', title: 'Diet Planner', subtitle: 'Personalized AI-generated meal plans for diabetes prevention and management.',
    bodyMetrics: 'Body Metrics', preferences: 'Preferences', additionalInfo: 'Additional Info',
    age: 'Age', weight: 'Weight (kg)', height: 'Height (cm)', gender: 'Gender', select: 'Select...',
    male: 'Male', female: 'Female', bmi: 'BMI', dailyCalories: 'Daily Calories', goal: 'Goal', kcalDay: 'kcal/day',
    dietType: 'Diet Type', activityLevel: 'Activity Level', goalLabel: 'Goal',
    healthConditions: 'Health Conditions', allergies: 'Allergies', dailyRoutine: 'Daily Routine',
    placeholders: { health: 'e.g., high BP', allergies: 'e.g., gluten', routine: 'e.g., wake 7AM' },
    generate: 'Generate Diet Plan', generating: 'Generating...', planGenerated: 'Plan generated!',
    savedToDashboard: 'Saved to your Dashboard.', viewInDashboard: 'View in Dashboard',
    yourPlan: 'Your Diet Plan', generatedBy: 'Generated by AI based on your profile',
    overview: 'Overview', dailyMeals: 'Daily Meals', groceries: 'Groceries', importantNotes: 'Important Notes',
    calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    underweight: 'Underweight', normal: 'Normal', overweight: 'Overweight', obese: 'Obese',
    dietOptions: [{ value: 'balanced', label: 'Balanced' }, { value: 'vegetarian', label: 'Vegetarian' }, { value: 'non-vegetarian', label: 'Non-Vegetarian' }, { value: 'vegan', label: 'Vegan' }, { value: 'mediterranean', label: 'Mediterranean' }, { value: 'low_carb', label: 'Low Carb' }, { value: 'diabetic_friendly', label: 'Diabetic Friendly' }],
    activityOptions: [{ value: 'sedentary', label: 'Sedentary' }, { value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'active', label: 'Active' }, { value: 'very_active', label: 'Very Active' }],
    goalOptions: [{ value: 'diabetes_prevention', label: 'Diabetes Prevention' }, { value: 'blood_sugar_control', label: 'Blood Sugar Control' }, { value: 'weight_loss', label: 'Weight Loss' }, { value: 'weight_gain', label: 'Weight Gain' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'gestational_diabetes', label: 'Gestational Diabetes' }],
    goalDisplay: { diabetes_prevention: 'Diabetes prevention', blood_sugar_control: 'Blood sugar control', weight_loss: 'Weight loss', weight_gain: 'Weight gain', maintenance: 'Maintenance', gestational_diabetes: 'Gestational diabetes' },
    negativeError: 'Please enter a positive number.',
  };

  const update = (f, v) => setFormData(p => ({ ...p, [f]: v }));

  const isNegative = (v) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) < 0;
  const negErr = t.negativeError;

  const generateDietPlan = async () => {
    setLoading(true); setError(''); setSuccess('');
    try {
      if (isNegative(formData.age) || isNegative(formData.weight) || isNegative(formData.height))
        throw new Error(negErr);
      const d = { ...formData }; delete d.bmi; delete d.bmi_category;
      const result = await apiGenerateDietPlan(d, language);
      setDietPlan(result);
      setSuccess(t.planGenerated);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const bmi = formData.weight && formData.height ? (formData.weight / ((formData.height / 100) ** 2)).toFixed(1) : null;
  const bmiCatKey = bmi ? (bmi < 18.5 ? 'underweight' : bmi <= 24.9 ? 'normal' : bmi <= 29.9 ? 'overweight' : 'obese') : '';
  const bmiCat = bmiCatKey ? t[bmiCatKey] : '';

  const calories = (() => {
    if (!formData.weight || !formData.height || !formData.age || !formData.gender || !formData.activityLevel) return null;
    const bmr = formData.gender === 'male'
      ? 88.362 + 13.397 * formData.weight + 4.799 * formData.height - 5.677 * formData.age
      : 447.593 + 9.247 * formData.weight + 3.098 * formData.height - 4.330 * formData.age;
    const mul = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    return Math.round(bmr * (mul[formData.activityLevel] || 1.55));
  })();

  const valid = formData.age && formData.weight && formData.height && formData.gender
    && !isNegative(formData.age) && !isNegative(formData.weight) && !isNegative(formData.height);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-32 pb-16"
      style={{ fontFamily: language === 'arabic' ? "'Tajawal','Figtree','Inter',sans-serif" : "'Figtree','Inter',sans-serif" }} dir={language === 'arabic' ? 'rtl' : 'ltr'}>
      {/* Back to Dashboard */}
      <button onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 mb-8 text-sm text-white/70 hover:text-white transition-colors group">
        <ArrowLeft className={`w-4 h-4 transition-transform ${language === 'arabic' ? 'rotate-180 group-hover:translate-x-0.5' : 'group-hover:-translate-x-0.5'}`} />
        {language === 'arabic' ? 'العودة إلى لوحة التحكم' : isTr ? 'Dashboard\'a Geri Dön' : 'Back to Dashboard'}
      </button>

      {/* Header */}
      <div className="text-center mb-14 animate-fade-in-up">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 tracking-tight">{t.title}</h1>
        <p className="text-gray-500 max-w-md mx-auto">{t.subtitle}</p>
      </div>

      {error && <div className="flex items-center gap-3 p-4 mb-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in-up"><AlertTriangle className="w-5 h-5 shrink-0" />{error}</div>}
      {success && (
        <div className="flex flex-wrap items-center gap-3 p-4 mb-8 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm animate-fade-in-up">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{success}</span>
          {getStoredToken() && (
            <>
              <span className="text-violet-400/80">·</span>
              <span className="text-gray-400">{t.savedToDashboard}</span>
              <Link to={ROUTES.DASHBOARD} className="font-medium text-violet-400 hover:text-violet-300 underline">
                {t.viewInDashboard}
              </Link>
            </>
          )}
        </div>
      )}

      <div className="gradient-border animate-fade-in-up">
        <div className="card p-8 sm:p-10 rounded-[1.25rem]">
          {/* Section 1: Body Metrics */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg font-bold text-white">{t.bodyMetrics}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <NumberField label={t.age} value={formData.age} onChange={(e) => update('age', e.target.value)} min={0} max={120} step={1} placeholder="25" error={isNegative(formData.age) ? negErr : undefined} />
              <NumberField label={t.weight} value={formData.weight} onChange={(e) => update('weight', e.target.value)} min={0} max={300} step={0.1} placeholder="70" error={isNegative(formData.weight) ? negErr : undefined} />
              <NumberField label={t.height} value={formData.height} onChange={(e) => update('height', e.target.value)} min={0} max={250} step={1} placeholder="170" error={isNegative(formData.height) ? negErr : undefined} />
              <FormSelect label={t.gender} value={formData.gender} onChange={(e) => update('gender', e.target.value)} options={[{ value: 'male', label: t.male }, { value: 'female', label: t.female }]} selectLabel={t.select} />
            </div>
          </div>

          {/* Live metrics */}
          {(bmi || calories) && (
            <div className="grid grid-cols-3 gap-4 mb-10">
              {bmi && (
                <div className="card p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">{t.bmi}</p>
                  <p className={`text-2xl font-black ${bmiCatKey === 'normal' ? 'text-violet-400' : bmiCatKey === 'overweight' ? 'text-amber-400' : 'text-red-400'}`}>{bmi}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{bmiCat}</p>
                </div>
              )}
              {calories && (
                <div className="card p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">{t.dailyCalories}</p>
                  <p className="text-2xl font-black text-cyan-400">{calories}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{t.kcalDay}</p>
                </div>
              )}
              <div className="card p-4 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">{t.goal}</p>
                <p className="text-lg font-black text-violet-400">{t.goalDisplay[formData.goals] || formData.goals.replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}

          {/* Section 2: Preferences */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-white">{t.preferences}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <FormSelect label={t.dietType} value={formData.dietaryPreference} onChange={(e) => update('dietaryPreference', e.target.value)} options={t.dietOptions} selectLabel={t.select} />
              <FormSelect label={t.activityLevel} value={formData.activityLevel} onChange={(e) => update('activityLevel', e.target.value)} options={t.activityOptions} selectLabel={t.select} />
              <FormSelect label={t.goalLabel} value={formData.goals} onChange={(e) => update('goals', e.target.value)} options={t.goalOptions} selectLabel={t.select} />
            </div>
          </div>

          {/* Section 3: Additional Info */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-lg font-bold text-white">{t.additionalInfo}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <FormInput label={t.healthConditions} value={formData.healthConditions} onChange={(e) => update('healthConditions', e.target.value)} placeholder={t.placeholders.health} />
              <FormInput label={t.allergies} value={formData.allergies} onChange={(e) => update('allergies', e.target.value)} placeholder={t.placeholders.allergies} />
              <FormInput label={t.dailyRoutine} value={formData.typicalDay} onChange={(e) => update('typicalDay', e.target.value)} placeholder={t.placeholders.routine} />
            </div>
          </div>

          <div className="text-center flex items-center justify-center gap-4">
            <LiquidMetalButton onClick={generateDietPlan} disabled={loading || !valid} width={200}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.generating}</> : <><UtensilsCrossed className="w-4 h-4" /> {t.generate}</>}
            </LiquidMetalButton>
            {savedPlans.length > 0 && (
              <button onClick={() => setShowSaved(!showSaved)} className="btn-ghost text-sm">
                <RotateCcw className="w-4 h-4" /> {isAr ? 'الخطط المحفوظة' : isTr ? 'Kayıtlı Planlar' : 'Saved Plans'} ({savedPlans.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feature f10: Saved Plans list */}
      {showSaved && savedPlans.length > 0 && (
        <div className="gradient-border mt-6 animate-fade-in-up">
          <div className="card p-6 rounded-[1.25rem]">
            <h3 className="text-lg font-bold text-white mb-4">{isAr ? 'الخطط المحفوظة' : isTr ? 'Kayıtlı Planlarım' : 'My Saved Plans'}</h3>
            <ul className="space-y-3">
              {savedPlans.map((plan) => (
                <li key={plan.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {plan.plan_name || t.goalDisplay[plan.goal] || plan.goal || (isAr ? 'خطة غذائية' : isTr ? 'Diyet planı' : 'Diet plan')}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{plan.overview?.slice(0, 80)}...</p>
                    {plan.created_at && <p className="text-[10px] text-gray-600 mt-0.5">{new Date(plan.created_at).toLocaleDateString()}</p>}
                  </div>
                  <button
                    onClick={() => {
                      if (plan.payload) {
                        setDietPlan(plan.payload);
                        setShowSaved(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition shrink-0 ml-3"
                  >
                    {isAr ? 'استخدام مرة أخرى' : isTr ? 'Tekrar Kullan' : 'Use Again'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Result */}
      {dietPlan && (
        <div className="gradient-border mt-10 animate-fade-in-up">
          <div className="card p-8 sm:p-10 rounded-[1.25rem]">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Salad className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white">{t.yourPlan}</h2>
                  <p className="text-sm text-gray-500">{t.generatedBy}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {dietPlan.grocery_list && (
                  <button
                    onClick={() => {
                      const text = typeof dietPlan.grocery_list === 'string' ? dietPlan.grocery_list : JSON.stringify(dietPlan.grocery_list, null, 2);
                      const blob = new Blob([text], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'grocery-list.txt'; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="btn-ghost text-xs"
                  >
                    <ClipboardList className="w-4 h-4" /> {language === 'turkish' ? 'Alışveriş' : 'Grocery'}
                  </button>
                )}
                <button
                  onClick={() => {
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diet Plan</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}h1{color:#059669}h2{color:#444;margin-top:20px}pre{background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap}</style></head><body><h1>${language === 'turkish' ? 'Diyet Planınız' : 'Your Diet Plan'}</h1>${dietPlan.overview ? `<h2>${language === 'turkish' ? 'Genel Bakış' : 'Overview'}</h2><p>${dietPlan.overview}</p>` : ''}${dietPlan.daily_plan ? `<h2>${language === 'turkish' ? 'Günlük Öğünler' : 'Daily Meals'}</h2><pre>${dietPlan.daily_plan}</pre>` : ''}${dietPlan.grocery_list ? `<h2>${language === 'turkish' ? 'Alışveriş Listesi' : 'Grocery List'}</h2><pre>${dietPlan.grocery_list}</pre>` : ''}${dietPlan.important_notes ? `<h2>${language === 'turkish' ? 'Önemli Notlar' : 'Important Notes'}</h2><p>${dietPlan.important_notes}</p>` : ''}</body></html>`;
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const w = window.open(url, '_blank');
                    if (w) w.onload = () => setTimeout(() => w.print(), 500);
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  }}
                  className="btn-ghost text-xs"
                >
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>

            <div className="space-y-8">
              {dietPlan.overview && (
                <div>
                  <div className="flex items-center gap-2.5 mb-3"><BarChart3 className="w-5 h-5 text-violet-400" /><h3 className="font-bold text-white">{t.overview}</h3></div>
                  <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">{dietPlan.overview}</p>
                </div>
              )}
              {dietPlan.daily_plan && (
                <div>
                  <div className="flex items-center gap-2.5 mb-3"><UtensilsCrossed className="w-5 h-5 text-amber-400" /><h3 className="font-bold text-white">{t.dailyMeals}</h3></div>
                  <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">{dietPlan.daily_plan}</p>
                </div>
              )}
              {dietPlan.grocery_list && (
                <div>
                  <div className="flex items-center gap-2.5 mb-3"><ShoppingCart className="w-5 h-5 text-cyan-400" /><h3 className="font-bold text-white">{t.groceries}</h3></div>
                  <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">{dietPlan.grocery_list}</p>
                </div>
              )}
              {dietPlan.important_notes && (
                <div className="card p-5 bg-blue-500/[0.04] border-blue-500/10">
                  <div className="flex items-center gap-2.5 mb-2"><Lightbulb className="w-5 h-5 text-blue-400" /><h4 className="font-bold text-blue-300">{t.importantNotes}</h4></div>
                  <p className="text-sm text-blue-300/80 whitespace-pre-line leading-relaxed">{dietPlan.important_notes}</p>
                </div>
              )}
              {dietPlan.nutritional_info && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: t.calories, value: dietPlan.nutritional_info.daily_calories, unit: 'kcal' },
                    { label: t.protein, value: dietPlan.nutritional_info.protein_grams, unit: 'g' },
                    { label: t.carbs, value: dietPlan.nutritional_info.carbs_grams, unit: 'g' },
                    { label: t.fat, value: dietPlan.nutritional_info.fat_grams, unit: 'g' },
                  ].map((n, i) => (
                    <div key={i} className="card p-4 text-center">
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-bold mb-1">{n.label}</p>
                      <p className="text-xl font-black gradient-text">{n.value}</p>
                      <p className="text-[10px] text-gray-600">{n.unit}</p>
                    </div>
                  ))}
                </div>
              )}
              {dietPlan.timestamp && (
                <p className="text-[10px] text-gray-600 flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(dietPlan.timestamp).toLocaleString()} | {dietPlan.generation_time}s</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DietPlan;
