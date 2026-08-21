import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LiquidMetalButton } from '../components/ui/LiquidMetalButton';
import { AnimatedActionMenu } from '../components/ui/AnimatedActionMenu';
import ReactMarkdown from 'react-markdown';
import {
  Activity, MessageSquare, Mic, Salad, AlertTriangle, User, FileText, UtensilsCrossed,
  Loader2, ChevronRight, ChevronDown, Camera, X, Check, Upload, Download, Share2, RefreshCw,
  Megaphone, ArrowRight, Shield, GitCompare, Heart, Apple, AlertCircle,
  Search, Calendar, Eye, Clock, Trash2, QrCode, ScanFace, Dumbbell, Sun, HelpCircle, Ellipsis, Bell,
  CreditCard, Sparkles, ScanLine, Brain, Droplets,
} from 'lucide-react';
import { ROUTES, getAvatarUrl } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import apiService, {
  faceEnroll,
  faceStatus,
  faceToggleEnabled,
  confirmSubscription,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../services/api';
import { buildAndDownloadSignedPDF, buildAndDownloadSignedHeartPDF, buildAndDownloadSignedMriPDF, buildAndDownloadSignedCKDPDF } from '../utils/assessmentPdf';
import FluidCard from '../components/FluidCard';
import { StackedToolCards } from '../components/ui/StackedToolCards';
import { MiniCalendar } from '../components/ui/MiniCalendar';
import { AvatarPicker } from '../components/ui/AvatarPicker';
import { DateRangePicker } from '../components/ui/DateRangePicker';

const toolGroups = [
  {
    id: 'assessments',
    titleEn: 'Health Assessments', titleTr: 'Sağlık Değerlendirmeleri', titleAr: 'التقييمات الصحية',
    accent: 'violet',
    items: [
      { path: ROUTES.TEST,            labelEn: 'Diabetes Assessment', labelTr: 'Diyabet Değerlendirmesi', labelAr: 'تقييم السكري',            icon: Activity },
      { path: ROUTES.HEART_TEST,      labelEn: 'Heart Risk Assessment', labelTr: 'Kalp Risk Değerlendirmesi', labelAr: 'تقييم خطر أمراض القلب',           icon: Heart },
      { path: ROUTES.BRAIN_MRI,       labelEn: 'Brain MRI Risk Assessment', labelTr: 'Beyin MRI Risk Değerlendirmesi', labelAr: 'تقييم خطر الرنين المغناطيسي للدماغ',      icon: Brain },
      { path: ROUTES.CKD_TEST,        labelEn: 'Kidney Disease (CKD) Risk Assessment', labelTr: 'Böbrek Hastalığı (CKD) Risk Değerlendirmesi', labelAr: 'تقييم خطر أمراض الكلى (CKD)', icon: Droplets },
      { path: ROUTES.SYMPTOM_CHECKER, labelEn: 'Symptom Checker', labelTr: 'Belirti Kontrolü', labelAr: 'فاحص الأعراض',                   icon: AlertTriangle },
    ],
  },
  {
    id: 'ai',
    titleEn: 'Diabetes Specialist AI', titleTr: 'Diyabet Uzmanı Yapay Zeka', titleAr: 'طبيب السكري بالذكاء الاصطناعي',
    accent: 'blue',
    items: [
      { path: ROUTES.CHAT,               labelEn: 'AI Chat', labelTr: 'Yapay Zeka Sohbet', labelAr: 'محادثة الذكاء الاصطناعي', icon: MessageSquare },
      { path: ROUTES.VOICE_CHAT,         labelEn: 'Voice Chat', labelTr: 'Sesli Sohbet', labelAr: 'محادثة صوتية',       icon: Mic },
      { path: ROUTES.LOCAL_AI_SCENARIO,  labelEn: 'What if…?', labelTr: 'Ya… olursa?', labelAr: 'ماذا لو...؟',        icon: HelpCircle },
    ],
  },
  {
    id: 'nutrition',
    titleEn: 'Nutrition & Fitness', titleTr: 'Beslenme & Fitness', titleAr: 'التغذية واللياقة',
    accent: 'emerald',
    items: [
      { path: ROUTES.DIET_PLAN,  labelEn: 'Diet Plan', labelTr: 'Diyet Planı', labelAr: 'خطة النظام الغذائي',         icon: Salad },
      { path: ROUTES.MEAL_PHOTO, labelEn: 'Meal Analyzer', labelTr: 'Öğün Analizi', labelAr: 'محلل الوجبات',        icon: Apple },
      { path: ROUTES.SPORT,      labelEn: 'Workout Videos', labelTr: 'Antrenman Videoları', labelAr: 'فيديوهات التمارين', icon: Dumbbell },
      { path: ROUTES.LOCAL_AI_TIP, labelEn: 'Tip of the Day', labelTr: 'Günün İpucu', labelAr: 'نصيحة اليوم',       icon: Sun },
    ],
  },
];

// Friendly labels for diet plan goal (stored as e.g. diabetes_prevention)
const DIET_GOAL_LABELS = {
  en: { diabetes_prevention: 'Diabetes Prevention', blood_sugar_control: 'Blood Sugar Control', weight_loss: 'Weight Loss', weight_gain: 'Weight Gain', maintenance: 'Maintenance', gestational_diabetes: 'Gestational Diabetes' },
  tr: { diabetes_prevention: 'Diyabet Önleme', blood_sugar_control: 'Kan Şekeri Kontrolü', weight_loss: 'Kilo Verme', weight_gain: 'Kilo Alma', maintenance: 'Koruma', gestational_diabetes: 'Gestasyonel Diyabet' },
  ar: { diabetes_prevention: 'الوقاية من السكري', blood_sugar_control: 'التحكم في سكر الدم', weight_loss: 'إنقاص الوزن', weight_gain: 'زيادة الوزن', maintenance: 'المحافظة على الوزن', gestational_diabetes: 'سكري الحمل' },
};
const dietGoalDisplay = (goal, isAr, isTr) => (DIET_GOAL_LABELS[isAr ? 'ar' : isTr ? 'tr' : 'en'][goal] || (goal || '').replace(/_/g, ' ')) || (isAr ? 'خطة النظام الغذائي' : isTr ? 'Diyet planı' : 'Diet plan');

// Risk-level labels come back from the ML models as fixed English strings (e.g. "Low Risk").
// Translate for display only — keep the raw value for color-class lookups (getRiskBadgeClasses etc).
const RISK_LEVEL_LABELS = {
  ar: { 'high risk': 'خطر مرتفع', 'moderate risk': 'خطر متوسط', 'low risk': 'خطر منخفض', 'very low risk': 'خطر منخفض جداً' },
  tr: { 'high risk': 'Yüksek Risk', 'moderate risk': 'Orta Risk', 'low risk': 'Düşük Risk', 'very low risk': 'Çok Düşük Risk' },
};
const riskLevelDisplay = (level, isAr, isTr) => (isAr || isTr) ? (RISK_LEVEL_LABELS[isAr ? 'ar' : 'tr'][(level || '').toLowerCase()] || level) : level;

const CKD_PREDICTION_LABELS = {
  ar: { 'ckd': 'قصور كلوي', 'no ckd': 'لا يوجد قصور كلوي' },
  tr: { 'ckd': 'KBH Var', 'no ckd': 'KBH Yok' },
};
const ckdPredictionDisplay = (pred, isAr, isTr) => (isAr || isTr) ? (CKD_PREDICTION_LABELS[isAr ? 'ar' : 'tr'][(pred || '').toLowerCase()] || pred) : pred;

// Consistent time format: "8:51 PM" (no leading zero, uppercase AM/PM)
const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Risk level → badge color classes (Low=green, Medium=amber, High=red)
const getRiskBadgeClasses = (riskLevel) => {
  const r = (riskLevel || '').toLowerCase();
  if (r.includes('low') || r.includes('minimal')) return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
  if (r.includes('medium') || r.includes('moderate')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (r.includes('high') || r.includes('elevated')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-white/[0.08] text-gray-300 border-white/[0.12]';
};
const getRiskBorderClass = (riskLevel) => {
  const r = (riskLevel || '').toLowerCase();
  if (r.includes('low') || r.includes('minimal')) return 'border-l-violet-500/50';
  if (r.includes('medium') || r.includes('moderate')) return 'border-l-amber-500/50';
  if (r.includes('high') || r.includes('elevated')) return 'border-l-red-500/50';
  return 'border-l-white/10';
};
/** Hover accent by risk (e.g. for Heart cards: green low, red high, like diabetes). */
const getRiskHoverClass = (riskLevel) => {
  const r = (riskLevel || '').toLowerCase();
  if (r.includes('low') || r.includes('minimal')) return 'hover:border-violet-500/30 hover:text-violet-400 focus:ring-violet-500/50';
  if (r.includes('medium') || r.includes('moderate')) return 'hover:border-amber-500/30 hover:text-amber-400 focus:ring-amber-500/50';
  if (r.includes('high') || r.includes('elevated')) return 'hover:border-red-500/30 hover:text-red-400 focus:ring-red-500/50';
  return 'hover:border-white/20 hover:text-gray-300 focus:ring-white/20';
};

// Greeting by time of day (for hero)
const getGreeting = (isAr, isTr, name) => {
  const firstName = (name || '').split(/\s+/)[0] || (isAr ? 'هناك' : isTr ? 'Kullanıcı' : 'there');
  const hour = new Date().getHours();
  let timeLabel = isAr ? 'مرحباً' : isTr ? 'Merhaba' : 'Hi';
  if (hour >= 5 && hour < 12) timeLabel = isAr ? 'صباح الخير' : isTr ? 'Günaydın' : 'Good morning';
  else if (hour >= 12 && hour < 17) timeLabel = isAr ? 'طاب مساؤك' : isTr ? 'İyi günler' : 'Good afternoon';
  else if (hour >= 17 && hour < 21) timeLabel = isAr ? 'مساء الخير' : isTr ? 'İyi akşamlar' : 'Good evening';
  else timeLabel = isAr ? 'مساء الخير' : isTr ? 'İyi geceler' : 'Good evening';
  return `${timeLabel}, ${firstName}`;
};

export default function Dashboard({ language }) {
  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser, setUserAvatar } = useAuth();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarAnchorRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifPos, setNotifPos] = useState({ top: 0, left: 0 });
  const notifAnchorRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try { const d = await getNotifications(20); setNotifications(Array.isArray(d) ? d : []); } catch {}
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleOpenNotif = () => {
    if (notifAnchorRef.current) {
      const rect = notifAnchorRef.current.getBoundingClientRect();
      const dropdownWidth = 320;
      let left = rect.right - dropdownWidth;
      if (left < 8) left = 8;
      setNotifPos({ top: rect.bottom + 4, left });
    }
    setNotifOpen(o => !o);
  };
  const handleMarkRead = async (id) => {
    try { await markNotificationRead(id); setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n)); } catch {}
  };
  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); setNotifications(p => p.map(n => ({ ...n, is_read: true }))); } catch {}
  };
  const handleDeleteNotif = async (e, id) => {
    e.stopPropagation();
    try { await deleteNotification(id); setNotifications(p => p.filter(n => n.id !== id)); } catch {}
  };

  const [assessments, setAssessments] = useState([]);
  const [heartAssessments, setHeartAssessments] = useState([]);
  const [ckdAssessments, setCKDAssessments] = useState([]);
  const [dietPlans, setDietPlans] = useState([]);
  const [brainMriAnalyses, setBrainMriAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [announcements, setAnnouncements] = useState([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscriptionConfirmError, setSubscriptionConfirmError] = useState(null);

  // Compare assessments state
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);

  // Imaging compare state
  const [imagingCompareMode, setImagingCompareMode] = useState(false);
  const [imagingCompareIds, setImagingCompareIds] = useState([]);

  // Filters: imaging (brain mri)
  const [imagingSearch, setImagingSearch] = useState('');
  const [imagingDateFrom, setImagingDateFrom] = useState('');
  const [imagingDateTo, setImagingDateTo] = useState('');
  const [imagingTypeFilter, setImagingTypeFilter] = useState('all'); // 'all' | 'mri'

  // Filters: assessments (combined diabetes + heart)
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentDateFrom, setAssessmentDateFrom] = useState('');
  const [assessmentDateTo, setAssessmentDateTo] = useState('');
  const [assessmentTypeFilter, setAssessmentTypeFilter] = useState('all'); // 'all' | 'diabetes' | 'heart' | 'ckd'
  // Filters: diet plans
  const [dietPlanSearch, setDietPlanSearch] = useState('');
  const [dietPlanDateFrom, setDietPlanDateFrom] = useState('');
  const [dietPlanDateTo, setDietPlanDateTo] = useState('');

  // Dismissed announcement IDs (persisted in localStorage so they don't show again)
  const DISMISSED_ANNOUNCEMENTS_KEY = 'morelife_dismissed_announcements';
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_ANNOUNCEMENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const visibleAnnouncements = announcements.filter(a => !dismissedAnnouncementIds.includes(a.id));
  const dismissAnnouncement = (id) => {
    setDismissedAnnouncementIds(prev => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try {
        localStorage.setItem(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, h, d, ann, bmr, ckd] = await Promise.all([
        apiService.getMyAssessments(),
        apiService.getMyHeartAssessments(),
        apiService.getMyDietPlans(),
        apiService.getActiveAnnouncements().catch(() => []),
        apiService.getMyBrainMriAnalyses().catch(() => []),
        apiService.getMyCKDAssessments().catch(() => []),
      ]);
      setAssessments(Array.isArray(a) ? a : []);
      setHeartAssessments(Array.isArray(h) ? h : []);
      setDietPlans(Array.isArray(d) ? d : []);
      setAnnouncements(Array.isArray(ann) ? ann : []);
      setBrainMriAnalyses(Array.isArray(bmr) ? bmr : []);
      setCKDAssessments(Array.isArray(ckd) ? ckd : []);
    } catch (err) {
      setError(err.message || (isAr ? 'فشل في تحميل البيانات.' : isTr ? 'Veriler yüklenemedi.' : 'Failed to load data.'));
      setAssessments([]);
      setHeartAssessments([]);
      setDietPlans([]);
      setBrainMriAnalyses([]);
      setCKDAssessments([]);
    } finally {
      setLoading(false);
    }
  }, [isTr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Open tab from URL (e.g. /dashboard?tab=assessments when returning from assessment report)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const type = searchParams.get('type');
    if (tab === 'heart-assessments') {
      setActiveTab('assessments');
      setAssessmentTypeFilter('heart');
      setSearchParams({ ...Object.fromEntries(searchParams.entries()), tab: 'assessments', type: 'heart' }, { replace: true });
      return;
    }
    if (tab === 'ckd-assessments') {
      setActiveTab('assessments');
      setAssessmentTypeFilter('ckd');
      setSearchParams({ ...Object.fromEntries(searchParams.entries()), tab: 'assessments', type: 'ckd' }, { replace: true });
      return;
    }
    if (tab && ['overview', 'assessments', 'imaging', 'diet-plans', 'subscription', 'profile'].includes(tab)) {
      setActiveTab(tab);
      if (tab === 'assessments') setAssessmentTypeFilter(['diabetes', 'heart', 'ckd'].includes(type) ? type : 'all');
    }
  }, [searchParams, setSearchParams]);

  // After Stripe Checkout success: confirm subscription with session_id then refresh user and clean URL
  useEffect(() => {
    const success = searchParams.get('subscription');
    const sessionId = searchParams.get('session_id');
    if (success !== 'success' || !sessionId) return;
    let cancelled = false;
    setSubscriptionConfirmError(null);
    (async () => {
      try {
        await confirmSubscription(sessionId);
        if (!cancelled) await refreshUser();
      } catch (err) {
        if (!cancelled) setSubscriptionConfirmError(err?.message || (isAr ? 'تعذر تأكيد الاشتراك.' : isTr ? 'Abonelik doğrulanamadı.' : 'Could not confirm subscription.'));
      } finally {
        if (!cancelled) setSearchParams({}, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, refreshUser, setSearchParams, isTr]);

  // Onboarding: check if user has no assessments (any type) = first time
  const totalAssessmentsCount = (assessments?.length || 0) + (heartAssessments?.length || 0) + (ckdAssessments?.length || 0);
  const isFirstTime = !loading && totalAssessmentsCount === 0 && !user?.onboarding_completed;
  const dismissOnboarding = async () => {
    try {
      await apiService.updateProfile({ onboarding_completed: true });
      refreshUser();
    } catch {}
  };

  // Signed PDF export (uses shared util)
  const [pdfLoading, setPdfLoading] = useState(null);
  const exportSignedAssessmentPDF = async (assessment) => {
    setPdfLoading(assessment.id);
    try {
      await buildAndDownloadSignedPDF(assessment, user, isTr, apiService);
    } catch (err) {
      const msg = err.message || '';
      const is404 = msg.includes('404');
      const friendly = is404
        ? (isAr ? 'لم يتم العثور على خدمة توقيع PDF (404). هل الخادم الخلفي يعمل؟' : isTr ? 'PDF imzalama servisi bulunamadı (404). Backend çalışıyor mu?' : 'PDF signing service not found (404). Is the backend running?')
        : (msg || (isAr ? 'تعذر إنشاء ملف PDF.' : isTr ? 'PDF oluşturulamadı.' : 'Could not create PDF.'));
      alert(friendly);
    } finally {
      setPdfLoading(null);
    }
  };

  // Signed Brain MRI PDF export
  const exportSignedMriPDF = async (assessment) => {
    setPdfLoading(`bm-${assessment.id}`);
    try {
      await buildAndDownloadSignedMriPDF(assessment, user, isTr, apiService);
    } catch (err) {
      const msg = err.message || '';
      const friendly = msg.includes('404')
        ? (isAr ? 'لم يتم العثور على خدمة توقيع PDF.' : isTr ? 'PDF imzalama servisi bulunamadı.' : 'PDF signing service not found.')
        : (isAr ? 'تعذر إنشاء ملف PDF.' : isTr ? 'PDF oluşturulamadı.' : 'Could not create PDF.');
      alert(friendly + ' ' + msg);
    } finally {
      setPdfLoading(null);
    }
  };

  // Share assessment
  const [shareLoading, setShareLoading] = useState(null);
  const [shareLink, setShareLink] = useState(null);
  const handleShare = async (assessmentId) => {
    setShareLoading(assessmentId);
    try {
      const result = await apiService.shareAssessment(assessmentId);
      const link = `${window.location.origin}/shared/${result.share_token}`;
      setShareLink({ id: assessmentId, link, type: 'diabetes' });
      navigator.clipboard?.writeText(link);
    } catch (err) {
      alert(err.message);
    } finally {
      setShareLoading(null);
    }
  };

  const [deletingId, setDeletingId] = useState(null);
  const exportSignedHeartPDF = async (assessment) => {
    setPdfLoading(assessment.id);
    try {
      await buildAndDownloadSignedHeartPDF(assessment, user, isTr, apiService);
    } catch (err) {
      const msg = err.message || '';
      const is404 = msg.includes('404');
      const friendly = is404
        ? (isAr ? 'لم يتم العثور على خدمة توقيع PDF (404).' : isTr ? 'PDF imzalama servisi bulunamadı (404).' : 'PDF signing service not found (404).')
        : (msg || (isAr ? 'تعذر إنشاء ملف PDF.' : isTr ? 'PDF oluşturulamadı.' : 'Could not create PDF.'));
      alert(friendly);
    } finally {
      setPdfLoading(null);
    }
  };
  const handleShareHeart = async (heartAssessmentId) => {
    setShareLoading(heartAssessmentId);
    try {
      const result = await apiService.shareHeartAssessment(heartAssessmentId);
      const link = `${window.location.origin}/shared/heart/${result.share_token}`;
      setShareLink({ id: heartAssessmentId, link, type: 'heart' });
      navigator.clipboard?.writeText(link);
    } catch (err) {
      alert(err.message);
    } finally {
      setShareLoading(null);
    }
  };
  const handleDeleteHeartAssessment = async (a) => {
    setDeletingId(`h-${a.id}`);
    try {
      await apiService.deleteHeartAssessment(a.id);
      setHeartAssessments(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      alert(err.message || (isAr ? 'تعذر الحذف.' : isTr ? 'Silinemedi.' : 'Could not delete.'));
    } finally {
      setDeletingId(null);
    }
  };
  const exportSignedCKDPDF = async (assessment) => {
    setPdfLoading(`ckd-${assessment.id}`);
    try {
      await buildAndDownloadSignedCKDPDF(assessment, user, isTr, apiService);
    } catch (err) {
      const msg = err.message || '';
      const friendly = msg.includes('404')
        ? (isAr ? 'لم يتم العثور على خدمة توقيع PDF (404).' : isTr ? 'PDF imzalama servisi bulunamadı (404).' : 'PDF signing service not found (404).')
        : (msg || (isAr ? 'تعذر إنشاء ملف PDF.' : isTr ? 'PDF oluşturulamadı.' : 'Could not create PDF.'));
      alert(friendly);
    } finally {
      setPdfLoading(null);
    }
  };
  const handleShareCKD = async (ckdAssessmentId) => {
    setShareLoading(ckdAssessmentId);
    try {
      const result = await apiService.shareCKDAssessment(ckdAssessmentId);
      const link = `${window.location.origin}/shared/ckd/${result.share_token}`;
      setShareLink({ id: ckdAssessmentId, link, type: 'ckd' });
      navigator.clipboard?.writeText(link);
    } catch (err) {
      alert(err.message);
    } finally {
      setShareLoading(null);
    }
  };
  const handleDeleteCKDAssessment = async (a) => {
    setDeletingId(`ckd-${a.id}`);
    try {
      await apiService.deleteCKDAssessment(a.id);
      setCKDAssessments(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      alert(err.message || (isAr ? 'تعذر الحذف.' : isTr ? 'Silinemedi.' : 'Could not delete.'));
    } finally {
      setDeletingId(null);
    }
  };
  const handleDeleteAssessment = async (a) => {
    setDeletingId(`a-${a.id}`);
    try {
      await apiService.deleteAssessment(a.id);
      setAssessments(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      alert(err.message || (isAr ? 'تعذر الحذف.' : isTr ? 'Silinemedi.' : 'Could not delete.'));
    } finally {
      setDeletingId(null);
    }
  };
  const handleDeleteDietPlan = async (d) => {
    setDeletingId(`d-${d.id}`);
    try {
      await apiService.deleteDietPlan(d.id);
      setDietPlans(prev => prev.filter(x => x.id !== d.id));
    } catch (err) {
      alert(err.message || (isAr ? 'تعذر الحذف.' : isTr ? 'Silinemedi.' : 'Could not delete.'));
    } finally {
      setDeletingId(null);
    }
  };

  // Compare assessments
  const toggleCompare = (id, type) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);

      if (prev.length > 0) {
        const firstId = prev[0];
        const firstIsCKD = Boolean(ckdAssessments.find(a => a.id === firstId));
        const firstIsHeart = !firstIsCKD && Boolean(heartAssessments.find(a => a.id === firstId));
        const firstType = firstIsCKD ? 'ckd' : firstIsHeart ? 'heart' : 'diabetes';
        if (type !== firstType) return prev;
      }

      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparedAssessments = React.useMemo(() => {
    return compareIds.map(id => {
      let item = assessments.find(a => a.id === id);
      if (item) return { ...item, _type: 'diabetes' };
      item = heartAssessments.find(h => h.id === id);
      if (item) return { ...item, _type: 'heart' };
      item = ckdAssessments.find(c => c.id === id);
      if (item) return { ...item, _type: 'ckd' };
      return null;
    }).filter(Boolean);
  }, [compareIds, assessments, heartAssessments, ckdAssessments]);

  const toggleImagingCompare = (id) => {
    setImagingCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const combinedImagingAnalyses = React.useMemo(() => {
    return (brainMriAnalyses || []).map(a => ({ ...a, _type: 'mri' })).sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });
  }, [brainMriAnalyses]);

  const comparedImagingAnalyses = React.useMemo(() => {
    return imagingCompareIds.map(id => {
      return combinedImagingAnalyses.find(a => a.id === id) || null;
    }).filter(Boolean);
  }, [imagingCompareIds, combinedImagingAnalyses]);

  const filteredImagingAnalyses = React.useMemo(() => {
    return combinedImagingAnalyses.filter(a => {
      if (imagingTypeFilter !== 'all' && a._type !== imagingTypeFilter) return false;
      if (imagingSearch) {
        const query = imagingSearch.toLowerCase();
        const summary = (a.executive_summary || '').toLowerCase();
        const conds = (a.tumor_class || '').toLowerCase();
        if (!summary.includes(query) && !conds.includes(query)) return false;
      }
      if (imagingDateFrom) {
        if (!a.created_at || new Date(a.created_at) < new Date(imagingDateFrom)) return false;
      }
      if (imagingDateTo) {
        const toD = new Date(imagingDateTo);
        toD.setHours(23, 59, 59, 999);
        if (!a.created_at || new Date(a.created_at) > toD) return false;
      }
      return true;
    });
  }, [combinedImagingAnalyses, imagingTypeFilter, imagingSearch, imagingDateFrom, imagingDateTo]);

  // Combined assessments (diabetes + heart + ckd) for list, sorted by date desc
  const combinedAssessments = React.useMemo(() => {
    const diabetes = (assessments || []).map(a => ({ ...a, _type: 'diabetes' }));
    const heart = (heartAssessments || []).map(a => ({ ...a, _type: 'heart' }));
    const ckd = (ckdAssessments || []).map(a => ({ ...a, _type: 'ckd' }));
    const list = [...diabetes, ...heart, ...ckd].sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });
    return list;
  }, [assessments, heartAssessments, ckdAssessments]);

  // Filtered combined list (type + search + date)
  const filteredAssessments = React.useMemo(() => {
    let list = [...combinedAssessments];
    if (assessmentTypeFilter === 'diabetes') list = list.filter(a => a._type === 'diabetes');
    else if (assessmentTypeFilter === 'heart') list = list.filter(a => a._type === 'heart');
    else if (assessmentTypeFilter === 'ckd') list = list.filter(a => a._type === 'ckd');
    const q = (assessmentSearch || '').toLowerCase().trim();
    if (q) {
      list = list.filter(a => {
        const matchText = (a.risk_level || '').toLowerCase().includes(q) ||
          (a.prediction || '').toLowerCase().includes(q) ||
          (a.executive_summary || '').toLowerCase().includes(q);
        const matchType = (q === 'diabetes' && a._type === 'diabetes') || (q === 'heart' && a._type === 'heart') ||
          (q === 'ckd' && a._type === 'ckd') || (q === 'kidney' && a._type === 'ckd') ||
          (isTr && ((q === 'kalp' && a._type === 'heart') || (q === 'diyabet' && a._type === 'diabetes') || (q === 'böbrek' && a._type === 'ckd')));
        return matchText || matchType;
      });
    }
    if (assessmentDateFrom) {
      const from = new Date(assessmentDateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter(a => a.created_at && new Date(a.created_at) >= from);
    }
    if (assessmentDateTo) {
      const to = new Date(assessmentDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(a => a.created_at && new Date(a.created_at) <= to);
    }
    return list;
  }, [combinedAssessments, assessmentTypeFilter, assessmentSearch, assessmentDateFrom, assessmentDateTo, isTr]);

  const filteredDietPlans = React.useMemo(() => {
    let list = [...dietPlans];
    const q = (dietPlanSearch || '').toLowerCase().trim();
    if (q) {
      list = list.filter(d =>
        (d.goal || '').toLowerCase().includes(q) ||
        (dietGoalDisplay(d.goal, isAr, isTr) || '').toLowerCase().includes(q) ||
        (d.overview || '').toLowerCase().includes(q)
      );
    }
    if (dietPlanDateFrom) {
      const from = new Date(dietPlanDateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter(d => d.created_at && new Date(d.created_at) >= from);
    }
    if (dietPlanDateTo) {
      const to = new Date(dietPlanDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(d => d.created_at && new Date(d.created_at) <= to);
    }
    return list;
  }, [dietPlans, dietPlanSearch, dietPlanDateFrom, dietPlanDateTo, isTr]);

  // Export my data
  const [exporting, setExporting] = useState(false);
  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await apiService.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `morelife-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 pt-32 pb-24">
      <header className="relative rounded-2xl mb-8 p-6 border border-white/[0.08]" style={{ background: 'linear-gradient(160deg, rgba(38,38,38,0.72) 0%, rgba(8,8,8,0.88) 45%, rgba(28,28,28,0.75) 100%)', backdropFilter: 'blur(48px) saturate(180%) brightness(1.05)' }}>
        {/* Subtle decorative glows */}
        <div style={{ position: 'absolute', top: '-60px', right: '-40px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '40%', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Top row: greeting + date */}
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/40 mb-1">{getGreeting(isAr, isTr, user?.full_name)}</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {isAr ? 'لوحة التحكم' : isTr ? 'Kontrol Paneli' : 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {/* Notification bell pill */}
            <button
              ref={notifAnchorRef}
              onClick={handleOpenNotif}
              className="relative flex items-center justify-center w-8 h-8 rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 hover:border-white/[0.14] hover:bg-white/[0.07] transition-all"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white text-black text-[7px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification portal overlay */}
            {notifOpen && createPortal(
              <>
                <div
                  onClick={() => setNotifOpen(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 99998 }}
                />
                <div style={{ position: 'fixed', top: notifPos.top, left: notifPos.left, width: 320, zIndex: 99999 }}>
                  <div style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(160deg, rgba(28,28,28,0.97) 0%, rgba(8,8,10,0.99) 100%)', backdropFilter: 'blur(48px) saturate(200%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 56px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                    {/* Header */}
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>{isAr ? 'الإشعارات' : isTr ? 'Bildirimler' : 'Notifications'}</span>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', fontWeight: 600, padding: 0 }}>
                          {isAr ? 'تحديد الكل كمقروء' : isTr ? 'Tümünü oku' : 'Mark all read'}
                        </button>
                      )}
                    </div>
                    {/* List */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>
                          <Bell style={{ width: 24, height: 24, margin: '0 auto 0.5rem', opacity: 0.15 }} />
                          {isAr ? 'لا توجد إشعارات' : isTr ? 'Bildirim yok' : 'No notifications'}
                        </div>
                      ) : notifications.slice(0, 15).map(n => (
                        <div key={n.id} onClick={() => handleMarkRead(n.id)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.7rem 1rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: n.is_read ? 'transparent' : 'rgba(255,255,255,0.02)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(255,255,255,0.02)'}
                        >
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
                            {(n.title || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: n.is_read ? 'rgba(255,255,255,0.4)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</p>
                              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginLeft: 6 }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                            </div>
                            {n.message && <p style={{ margin: '0 0 3px', fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</p>}
                            <span style={{ fontSize: '0.6rem', color: n.is_read ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)' }}>{n.is_read ? (isAr ? '✓ مقروء' : isTr ? '✓ Okundu' : '✓ Read') : (isAr ? '● غير مقروء' : isTr ? '● Okunmadı' : '● Unread')}</span>
                          </div>
                          <button onClick={(e) => handleDeleteNotif(e, n.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.15)', padding: '2px', borderRadius: 6, flexShrink: 0, display: 'flex' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}
                          >
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>,
              document.body
            )}

            {/* Date pill */}
            <button
              ref={calendarAnchorRef}
              onClick={() => setCalendarOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-xs text-white/40 hover:text-white/70 hover:border-white/[0.14] hover:bg-white/[0.07] transition-all"
            >
              <Calendar className="w-3 h-3" />
              {new Date().toLocaleDateString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </button>
            <MiniCalendar
              open={calendarOpen}
              onClose={() => setCalendarOpen(false)}
              isTr={isTr}
              anchorRef={calendarAnchorRef}
            />
          </div>
        </div>

        {/* Bottom stats strip */}
        {!loading && (
          <div className="relative mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-4">
            {/* Left: stats */}
            <div className="flex items-center gap-5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs text-white/45">{totalAssessmentsCount} {isAr ? 'تقييم' : isTr ? 'değerlendirme' : totalAssessmentsCount === 1 ? 'assessment' : 'assessments'}</span>
              </div>
              <div className="w-px h-3 bg-white/[0.08]" />
              <div className="flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs text-white/45">{combinedImagingAnalyses.length} {isAr ? 'فحص تصوير' : isTr ? 'görüntüleme' : combinedImagingAnalyses.length === 1 ? 'imaging scan' : 'imaging scans'}</span>
              </div>
              <div className="w-px h-3 bg-white/[0.08]" />
              <div className="flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs text-white/45">{dietPlans.length} {isAr ? 'خطة غذائية' : isTr ? 'diyet planı' : dietPlans.length === 1 ? 'diet plan' : 'diet plans'}</span>
              </div>
            </div>
            {/* Right: Verify Report */}
            <Link to={ROUTES.VERIFY} className="shrink-0 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
              <QrCode className="w-3.5 h-3.5" />
              {isAr ? 'التحقق من التقرير' : isTr ? 'Rapor Doğrula' : 'Verify Report'}
            </Link>
          </div>
        )}
      </header>

      {/* Feature f1: Announcements Banner (dismissible, max-height + fade) */}
      {visibleAnnouncements.length > 0 && (
        <div className="mb-6 relative max-h-48 overflow-y-auto overflow-x-hidden rounded-xl">
          <div className="space-y-2 pr-2">
            {visibleAnnouncements.slice(0, 3).map((ann) => (
              <div key={ann.id} className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 relative">
                <Megaphone className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-300">{ann.title}</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">{ann.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAnnouncement(ann.id)}
                  className="p-1.5 rounded-lg text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/20 transition shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  title={isAr ? 'إخفاء (عدم الإظهار مجدداً)' : isTr ? 'Kapat (bir daha gösterme)' : 'Dismiss (don\'t show again)'}
                  aria-label={isAr ? 'إخفاء الإعلان' : isTr ? 'Duyuruyu kapat' : 'Dismiss announcement'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-[#060611] to-transparent" aria-hidden="true" />
        </div>
      )}

      {/* Feature f2: Onboarding prompt for first-time users */}
      {isFirstTime && (
        <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div>
                <h3 className="text-white font-semibold">
                  {isAr ? 'مرحباً بك! ابدأ رحلتك الصحية' : isTr ? 'Hoş geldiniz! Sağlık yolculuğunuza başlayın' : 'Welcome! Start your health journey'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {isTr
                    ? 'İlk değerlendirmenizi alarak diyabet riskinizi öğrenin. Sonuçlarınız yapay zeka sohbetini ve diyet planlarınızı kişiselleştirecektir.'
                    : 'Take your first assessment to learn your diabetes risk. Your results will personalize AI chat and diet plan recommendations.'}
                </p>
                <Link
                  to={ROUTES.TEST}
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium transition"
                >
                  <Activity className="w-4 h-4" />
                  {isAr ? 'قم بالتقييم' : isTr ? 'Değerlendirme Yap' : 'Take Assessment'}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <button onClick={dismissOnboarding} className="p-1 hover:bg-white/10 rounded-lg shrink-0" title="Dismiss">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="relative mb-8">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent" style={{ scrollbarWidth: 'thin' }}>
          {[
            { id: 'overview', labelEn: 'Overview', labelTr: 'Genel Bakış', labelAr: 'نظرة عامة', dataTour: 'dashboard-tab-overview' },
            { id: 'assessments', labelEn: 'My Assessments', labelTr: 'Değerlendirmelerim', labelAr: 'تقييماتي', dataTour: 'dashboard-tab-assessments' },
            { id: 'imaging', labelEn: 'Imaging History', labelTr: 'Görüntüleme Geçmişi', labelAr: 'تاريخ التصوير', dataTour: 'dashboard-tab-imaging' },
            { id: 'diet-plans', labelEn: 'My Diet Plans', labelTr: 'Diyet Planlarım', labelAr: 'خطط النظام الغذائي', dataTour: 'dashboard-tab-diet-plans' },
            { id: 'subscription', labelEn: 'My Subscription', labelTr: 'Aboneliğim', labelAr: 'اشتراكي', dataTour: 'dashboard-tab-subscription' },
            { id: 'profile', labelEn: 'Profile', labelTr: 'Profil', labelAr: 'الملف الشخصي', dataTour: 'dashboard-tab-profile' },
          ].map((tab) => (
            <button
              key={tab.id}
              data-tour={tab.dataTour}
              onClick={() => { setActiveTab(tab.id); setSearchParams({ tab: tab.id }, { replace: true }); }}
              className={`px-4 py-2.5 text-sm font-medium rounded-full transition whitespace-nowrap shrink-0 ${activeTab === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {isAr ? tab.labelAr : isTr ? tab.labelTr : tab.labelEn}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[#060611] to-transparent pointer-events-none" aria-hidden="true" />
      </div>

      {/* Feature f3: Global error with retry */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition">
            <RefreshCw className="w-3.5 h-3.5" />
            {isAr ? 'إعادة المحاولة' : isTr ? 'Tekrar Dene' : 'Retry'}
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <section className="mb-10" data-tour="dashboard-tools">
            <h2 className="text-lg font-semibold text-white mb-4 tracking-tight">{isAr ? 'الأدوات' : isTr ? 'Araçlar' : 'TOOLS'}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {toolGroups.map(group => (
                <StackedToolCards key={group.id} {...group} isTr={isTr} isAr={isAr} />
              ))}
            </div>
          </section>


          {/* Latest assessment summary (most recent diabetes, heart, or CKD) */}
          {!loading && combinedAssessments.length > 0 && (() => {
            const latest = combinedAssessments[0];
            const isHeart = latest._type === 'heart';
            const isCKD = latest._type === 'ckd';
            const viewRoute = isHeart ? `${ROUTES.DASHBOARD_HEART_ASSESSMENT}/${latest.id}` : isCKD ? `${ROUTES.DASHBOARD_CKD_ASSESSMENT}/${latest.id}` : `${ROUTES.DASHBOARD_ASSESSMENT}/${latest.id}`;
            const shareMatch = shareLink?.id === latest.id && shareLink?.type === latest._type;
            const borderCls = 'border-l-white/[0.15]';
            return (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-white mb-4">{isAr ? 'أحدث تقييم' : isTr ? 'Son Değerlendirme' : 'Latest Assessment'}</h2>
                <div className={`p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] border-l-4 ${borderCls}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-white/[0.05] text-white/40 border-white/[0.08]">
                          {isCKD ? <Droplets className="w-3 h-3" /> : isHeart ? <Heart className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                          {isAr ? (isCKD ? 'الكلى (CKD)' : isHeart ? 'القلب' : 'السكري') : isTr ? (isCKD ? 'Böbrek (CKD)' : isHeart ? 'Kalp' : 'Diyabet') : (isCKD ? 'Kidney (CKD)' : isHeart ? 'Heart' : 'Diabetes')}
                        </span>
                        {isCKD ? (
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium border bg-white/[0.05] text-white/45 border-white/[0.08]">
                            {ckdPredictionDisplay(latest.prediction, isAr, isTr)} · {((latest.confidence || 0) * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium border bg-white/[0.05] text-white/45 border-white/[0.08]">
                            {riskLevelDisplay(latest.risk_level, isAr, isTr)} · {(latest.probability * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 line-clamp-2 max-w-md mt-2 [&_strong]:font-semibold [&_strong]:text-gray-200">
                        <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span>, strong: ({ children }) => <strong>{children}</strong> }}>{latest.executive_summary || ''}</ReactMarkdown>
                      </div>
                      {latest.created_at && <p className="text-xs text-gray-500 mt-1">{new Date(latest.created_at).toLocaleString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US')}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <LiquidMetalButton onClick={() => navigate(isCKD ? ROUTES.CKD_TEST : isHeart ? ROUTES.HEART_TEST : ROUTES.TEST)} width={170} height={38}>
                        {isAr ? 'تقييم جديد' : isTr ? 'Yeni değerlendirme' : 'New assessment'}
                        <ArrowRight className="w-4 h-4" />
                      </LiquidMetalButton>
                      <LiquidMetalButton data-tour="dashboard-view-report" onClick={() => navigate(viewRoute, { state: { assessment: latest } })} width={90} height={38}>
                        {isAr ? 'عرض' : isTr ? 'Görüntüle' : 'View'} <Eye className="w-4 h-4" />
                      </LiquidMetalButton>
                      {isCKD ? (
                        <>
                          <button onClick={() => exportSignedCKDPDF(latest)} disabled={pdfLoading === `ckd-${latest.id}`} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-cyan-400 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/50" title={isAr ? 'تنزيل PDF موقّع' : isTr ? 'İmzalı PDF İndir' : 'Download Signed PDF'} aria-label={isAr ? 'تنزيل PDF موقّع' : isTr ? 'İmzalı PDF İndir' : 'Download Signed PDF'} data-tour="dashboard-download-signed">
                            {pdfLoading === `ckd-${latest.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleShareCKD(latest.id)} disabled={shareLoading === latest.id} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-cyan-400 transition focus:outline-none focus:ring-2 focus:ring-cyan-500/50" title={isAr ? 'مشاركة' : isTr ? 'Paylaş' : 'Share'} aria-label={isAr ? 'مشاركة' : isTr ? 'Paylaş' : 'Share'} data-tour="dashboard-share">
                            {shareLoading === latest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                          </button>
                        </>
                      ) : isHeart ? (
                        (() => {
                          const heartHover = getRiskHoverClass(latest.risk_level);
                          return (
                            <>
                              <button onClick={() => exportSignedHeartPDF(latest)} disabled={pdfLoading === latest.id} className={`p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 ${heartHover} transition focus:outline-none focus:ring-2`} title={isAr ? 'تنزيل PDF' : isTr ? 'PDF İndir' : 'Download PDF'} aria-label={isAr ? 'تنزيل PDF' : isTr ? 'PDF İndir' : 'Download PDF'} data-tour="dashboard-download-signed">
                                {pdfLoading === latest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </button>
                              <button onClick={() => handleShareHeart(latest.id)} disabled={shareLoading === latest.id} className={`p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 ${heartHover} transition focus:outline-none focus:ring-2`} title={isAr ? 'مشاركة' : isTr ? 'Paylaş' : 'Share'} aria-label={isAr ? 'مشاركة' : isTr ? 'Paylaş' : 'Share'} data-tour="dashboard-share">
                                {shareLoading === latest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                              </button>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <button onClick={() => exportSignedAssessmentPDF(latest)} disabled={pdfLoading === latest.id} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-violet-400 transition focus:outline-none focus:ring-2 focus:ring-violet-500/50" title={isAr ? 'تنزيل PDF موقّع' : isTr ? 'İmzalı PDF İndir' : 'Download Signed PDF'} aria-label={isAr ? 'تنزيل PDF موقّع' : isTr ? 'İmzalı PDF İndir' : 'Download Signed PDF'} data-tour="dashboard-download-signed">
                            {pdfLoading === latest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleShare(latest.id)} disabled={shareLoading === latest.id} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-violet-400 transition focus:outline-none focus:ring-2 focus:ring-violet-500/50" title={isAr ? 'شارك مع الطبيب' : isTr ? 'Doktora Paylaş' : 'Share with Doctor'} aria-label={isAr ? 'شارك مع الطبيب' : isTr ? 'Doktora Paylaş' : 'Share with Doctor'} data-tour="dashboard-share">
                            {shareLoading === latest.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {shareMatch && (
                    <div className="mt-3 p-2 rounded-lg border bg-white/[0.03] border-white/[0.08]">
                      <p className="text-xs text-white/40">{isAr ? 'تم نسخ الرابط إلى الحافظة:' : isTr ? 'Link panoya kopyalandı:' : 'Link copied to clipboard:'}</p>
                      <p className="text-xs break-all mt-1 text-white/30">{shareLink.link}</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Latest imaging scan summary */}
          {!loading && combinedImagingAnalyses.length > 0 && (() => {
            const latest = combinedImagingAnalyses[0];
            const badgeCls = 'bg-white/[0.05] text-white/45 border-white/[0.08]';
            return (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-white mb-4">{isAr ? 'أحدث تصوير' : isTr ? 'Son Görüntüleme' : 'Latest Imaging'}</h2>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] border-l-4 border-l-white/[0.15]">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-white/[0.05] text-white/40 border-white/[0.08]">
                          <Brain className="w-3 h-3" />
                          {isAr ? 'تصوير الدماغ بالرنين المغناطيسي' : isTr ? 'MRI' : 'Brain MRI'}
                        </span>
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border ${badgeCls}`}>
                          {`${latest.tumor_class || 'N/A'} ${latest.confidence != null ? `· ${(latest.confidence * 100).toFixed(0)}%` : ''}`}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 line-clamp-2 max-w-md mt-2 [&_strong]:font-semibold [&_strong]:text-gray-200">
                        {latest.executive_summary ? latest.executive_summary.replace(/\*+/g, '') : '—'}
                      </div>
                      {latest.created_at && <p className="text-xs text-gray-500 mt-1">{new Date(latest.created_at).toLocaleString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US')}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <LiquidMetalButton onClick={() => navigate(ROUTES.BRAIN_MRI)} width={155} height={38}>
                        {isAr ? 'تحليل جديد' : isTr ? 'Yeni analiz' : 'New analysis'}
                        <ArrowRight className="w-4 h-4" />
                      </LiquidMetalButton>
                      <LiquidMetalButton onClick={() => navigate(ROUTES.BRAIN_MRI, { state: { assessment: latest } })} width={90} height={38}>
                        {isAr ? 'عرض' : isTr ? 'Görüntüle' : 'View'} <Eye className="w-4 h-4" />
                      </LiquidMetalButton>
                      <button onClick={() => exportSignedMriPDF(latest)} disabled={pdfLoading === `bm-${latest.id}`} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-violet-400 focus:ring-violet-500/50 transition focus:outline-none focus:ring-2" title={isAr ? 'تنزيل PDF موقّع' : isTr ? 'İmzalı PDF İndir' : 'Download Signed PDF'}>
                        {pdfLoading === `bm-${latest.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}
        </>
      )}

      {activeTab === 'assessments' && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">{isAr ? 'تقييماتي' : isTr ? 'Değerlendirmelerim' : 'My Assessments'}</h2>
            <div className="flex flex-wrap gap-2 items-center">
              {(assessments.length > 0 || heartAssessments.length > 0) && (
                <LiquidMetalButton onClick={() => { setCompareMode(!compareMode); setCompareIds([]); }} width={120} height={36}>
                  <GitCompare className="w-3.5 h-3.5" />
                  {isAr ? 'مقارنة' : isTr ? 'Karşılaştır' : 'Compare'}
                </LiquidMetalButton>
              )}
            </div>
          </div>

          {/* Type filter: All | Diabetes | Heart | CKD */}
          {!loading && totalAssessmentsCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { value: 'all', labelEn: 'All', labelTr: 'Tümü', labelAr: 'الكل', w: 72 },
                { value: 'diabetes', labelEn: 'Diabetes', labelTr: 'Diyabet', labelAr: 'السكري', w: 110 },
                { value: 'heart', labelEn: 'Heart', labelTr: 'Kalp', labelAr: 'القلب', w: 88 },
                { value: 'ckd', labelEn: 'Kidney (CKD)', labelTr: 'Böbrek (CKD)', labelAr: 'الكلى (CKD)', w: 148 },
              ].map(({ value, labelEn, labelTr, labelAr, w }) => {
                const active = assessmentTypeFilter === value;
                return (
                  <div key={value} className="relative" style={{ borderRadius: '100px', boxShadow: active ? '0 0 18px rgba(124,58,237,0.4)' : 'none' }}>
                    {active && (
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '100px', background: 'rgba(124,58,237,0.28)', border: '1px solid rgba(167,139,250,0.6)', zIndex: 50, pointerEvents: 'none' }} />
                    )}
                    <LiquidMetalButton
                      onClick={() => {
                        setAssessmentTypeFilter(value);
                        setSearchParams(prev => {
                          const p = Object.fromEntries(prev.entries());
                          p.tab = 'assessments';
                          if (value === 'all') delete p.type;
                          else p.type = value;
                          return p;
                        }, { replace: true });
                      }}
                      width={w}
                      height={36}
                    >
                      {isAr ? labelAr : isTr ? labelTr : labelEn}
                    </LiquidMetalButton>
                  </div>
                );
              })}
            </div>
          )}

          {/* Date + Search filters */}
          {!loading && totalAssessmentsCount > 0 && (
            <>
              <div className="flex flex-wrap gap-3 mb-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={assessmentSearch}
                    onChange={(e) => setAssessmentSearch(e.target.value)}
                    placeholder={isAr ? 'بحث (خطر، ملخص...)' : isTr ? 'Ara (risk, özet…)' : 'Search (risk, summary…)'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
                    aria-label={isAr ? 'البحث في التقييمات' : isTr ? 'Değerlendirme ara' : 'Search assessments'}
                  />
                </div>
                <DateRangePicker
                  from={assessmentDateFrom}
                  to={assessmentDateTo}
                  onFromChange={(e) => setAssessmentDateFrom(e.target.value)}
                  onToChange={(e) => setAssessmentDateTo(e.target.value)}
                  isTr={isTr}
                />
              </div>
              {(assessmentSearch || assessmentDateFrom || assessmentDateTo) && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  {assessmentSearch && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-300 text-xs border border-violet-500/25">
                      {isAr ? 'بحث' : isTr ? 'Ara' : 'Search'}: {assessmentSearch}
                      <button type="button" onClick={() => setAssessmentSearch('')} className="hover:bg-violet-500/20 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {assessmentDateFrom && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] text-gray-300 text-xs border border-white/[0.12]">
                      {isAr ? 'من' : isTr ? 'Başlangıç' : 'From'}: {assessmentDateFrom}
                      <button type="button" onClick={() => setAssessmentDateFrom('')} className="hover:bg-white/10 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {assessmentDateTo && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] text-gray-300 text-xs border border-white/[0.12]">
                      {isAr ? 'إلى' : isTr ? 'Bitiş' : 'To'}: {assessmentDateTo}
                      <button type="button" onClick={() => setAssessmentDateTo('')} className="hover:bg-white/10 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <button type="button" onClick={() => { setAssessmentSearch(''); setAssessmentDateFrom(''); setAssessmentDateTo(''); }} className="text-xs text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded px-2 py-1">
                    {isAr ? 'مسح الكل' : isTr ? 'Filtreleri temizle' : 'Clear all'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Loading skeleton — matches assessment card layout */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] border-l-4 border-l-white/10 animate-pulse">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-5 w-28 rounded-lg bg-white/[0.08]" />
                      <div className="h-3 w-full max-w-md rounded bg-white/[0.06]" />
                      <div className="h-3 w-3/4 max-w-xs rounded bg-white/[0.06]" />
                      <div className="h-3 w-32 rounded bg-white/[0.06] mt-1.5" />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <div className="h-8 w-8 rounded-lg bg-white/[0.06]" />
                      <div className="h-8 w-8 rounded-lg bg-white/[0.06]" />
                      <div className="h-8 w-8 rounded-lg bg-white/[0.06]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : totalAssessmentsCount === 0 ? (
            <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <h3 className="text-white font-semibold mb-1">{isAr ? 'لا توجد تقييمات بعد' : isTr ? 'Henüz değerlendirme yok' : 'No assessments yet'}</h3>
              <p className="text-gray-400 text-sm max-w-sm mx-auto">{isAr ? 'قم بإجراء فحص السكري، القلب، الكلى، أو الرنين المغناطيسي للدماغ — ستظهر نتائجك هنا.' : isTr ? 'Diyabet, kalp, böbrek veya beyin MRI testi yapın — sonuçlarınız burada görünecek.' : 'Run a diabetes, heart, kidney, or brain MRI test — your results will appear here.'}</p>
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Search className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">{isAr ? 'لا توجد تقييمات تطابق عوامل التصفية.' : isTr ? 'Filtreye uyan değerlendirme yok.' : 'No assessments match the filters.'}</p>
              <button type="button" onClick={() => { setAssessmentSearch(''); setAssessmentDateFrom(''); setAssessmentDateTo(''); }} className="text-sm text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-lg px-3 py-1.5">
                {isAr ? 'مسح عوامل التصفية' : isTr ? 'Filtreleri temizle' : 'Clear filters'}
              </button>
            </div>
          ) : (
            <>
              {/* Feature f6: Compare mode */}
              {compareMode && compareIds.length === 2 && comparedAssessments.length === 2 && (
                <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-violet-500/20">
                  <h3 className="text-sm font-semibold text-violet-400 mb-3">{isAr ? 'مقارنة' : isTr ? 'Karşılaştırma' : 'Comparison'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {comparedAssessments.map((a) => {
                      const isCKD = a._type === 'ckd';
                      const ckdPos = isCKD && (a.prediction || '').toLowerCase() === 'ckd';
                      return (
                        <div key={a.id} className="space-y-2">
                          <p className="text-xs text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US') : 'N/A'}</p>
                          {isCKD ? (
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border ${ckdPos ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-violet-500/20 text-violet-400 border-violet-500/30'}`}>
                              {ckdPredictionDisplay(a.prediction, isAr, isTr)} · {((a.confidence || 0) * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border ${getRiskBadgeClasses(a.risk_level)}`}>
                              {riskLevelDisplay(a.risk_level, isAr, isTr)} · {(a.probability * 100).toFixed(1)}%
                            </span>
                          )}
                          <div className="text-xs text-gray-400 line-clamp-3 mt-1 [&_strong]:font-semibold [&_strong]:text-gray-200">
                            <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span>, strong: ({ children }) => <strong>{children}</strong> }}>{a.executive_summary}</ReactMarkdown>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const [a0, a1] = comparedAssessments;
                    const v0 = a0._type === 'ckd' ? (a0.confidence || 0) : (a0.probability || 0);
                    const v1 = a1._type === 'ckd' ? (a1.confidence || 0) : (a1.probability || 0);
                    const diff = v1 - v0;
                    const improved = diff < 0;
                    const pct = (Math.abs(diff) * 100).toFixed(1);
                    return (
                      <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${improved ? 'bg-violet-500/10 text-violet-400' : diff > 0 ? 'bg-red-500/10 text-red-400' : 'bg-white/[0.05] text-gray-400'}`}>
                        {diff !== 0 && (
                          <span className="shrink-0" aria-hidden="true">
                            {improved ? <span className="text-violet-400">↓</span> : <span className="text-red-400">↑</span>}
                          </span>
                        )}
                        {improved
                          ? (isAr ? `انخفض الخطر بنسبة ${pct}% — تقدم جيد!` : isTr ? `Risk ${pct}% azaldı — İyi ilerleme!` : `Risk decreased by ${pct}% — Good progress!`)
                          : diff > 0
                            ? (isAr ? `ازداد الخطر بنسبة ${pct}%` : isTr ? `Risk ${pct}% arttı` : `Risk increased by ${pct}%`)
                            : (isAr ? 'لا يوجد تغيير' : isTr ? 'Değişiklik yok' : 'No change')}
                      </div>
                    );
                  })()}
                </div>
              )}
              {compareMode && compareIds.length < 2 && (
                <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <GitCompare className="w-5 h-5 text-amber-400 shrink-0" />
                  <p className="text-sm text-amber-200/90">
                    {isAr ? 'حدد تقييمين للمقارنة' : isTr ? 'Karşılaştırmak için 2 değerlendirme seçin' : 'Select 2 assessments to compare'}
                  </p>
                </div>
              )}

              <ul className="space-y-3">
                {filteredAssessments.map((a) => {
                  const isHeart = a._type === 'heart';
                  const isCKD = a._type === 'ckd';
                  const rowKey = isHeart ? `heart-${a.id}` : isCKD ? `ckd-${a.id}` : a.id;
                  const viewRoute = isHeart ? `${ROUTES.DASHBOARD_HEART_ASSESSMENT}/${a.id}` : isCKD ? `${ROUTES.DASHBOARD_CKD_ASSESSMENT}/${a.id}` : `${ROUTES.DASHBOARD_ASSESSMENT}/${a.id}`;
                  const ckdIsPositive = isCKD && (a.prediction || '').toLowerCase() === 'ckd';
                  const accentHover = isCKD ? 'hover:border-cyan-500/30 hover:text-cyan-400 focus:ring-cyan-500/50' : isHeart ? getRiskHoverClass(a.risk_level) : 'hover:border-violet-500/30 hover:text-violet-400 focus:ring-violet-500/50';
                  const borderCls = isCKD ? (ckdIsPositive ? 'border-l-red-500/50' : 'border-l-cyan-500/50') : getRiskBorderClass(a.risk_level);
                  const compareBorderCls = isCKD ? 'border-cyan-500/40 bg-cyan-500/5 border-l-cyan-500/60' : isHeart ? 'border-pink-500/40 bg-pink-500/5 border-l-pink-500/60' : 'border-violet-500/40 bg-violet-500/5 border-l-violet-500/60';
                  const shareLinkMatch = shareLink?.id === a.id && shareLink?.type === a._type;
                  return (
                    <li
                      key={rowKey}
                      className={`p-4 rounded-xl bg-white/[0.03] border border-l-4 transition ${compareMode && compareIds.includes(a.id) ? compareBorderCls : `border-white/[0.06] ${borderCls} ${!compareMode ? 'cursor-pointer ' + accentHover : ''}`}`}
                      onClick={!compareMode && viewRoute ? () => navigate(viewRoute, { state: { assessment: a } }) : undefined}
                      onKeyDown={!compareMode && viewRoute ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(viewRoute, { state: { assessment: a } }); } } : undefined}
                      role={!compareMode && viewRoute ? 'button' : undefined}
                      tabIndex={!compareMode && viewRoute ? 0 : undefined}
                      aria-label={!compareMode ? (isAr ? (isCKD ? 'عرض تقييم الكلى' : isHeart ? 'عرض تقييم القلب' : 'عرض التقييم') : isTr ? (isCKD ? 'Böbrek değerlendirmesini görüntüle' : isHeart ? 'Kalp değerlendirmesini görüntüle' : 'Değerlendirmeyi görüntüle') : (isCKD ? 'View CKD assessment' : isHeart ? 'View heart assessment' : 'View assessment')) : undefined}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {compareMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCompare(a.id, a._type); }}
                              className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition focus:outline-none focus:ring-2 ${isCKD ? 'focus:ring-cyan-500/50' : isHeart ? 'focus:ring-pink-500/50' : 'focus:ring-violet-500/50'} ${compareIds.includes(a.id) ? (isCKD ? 'bg-cyan-500 border-cyan-500' : isHeart ? 'bg-pink-500 border-pink-500' : 'bg-violet-500 border-violet-500') : `border-white/20 ${isCKD ? 'hover:border-cyan-500/50' : isHeart ? 'hover:border-pink-500/50' : 'hover:border-violet-500/50'}`}`}
                              aria-label={compareIds.includes(a.id) ? (isAr ? 'إلغاء التحديد من المقارنة' : isTr ? 'Karşılaştırmadan çıkar' : 'Deselect from compare') : (isAr ? 'اختر للمقارنة' : isTr ? 'Karşılaştırmaya ekle' : 'Select to compare')}
                            >
                              {compareIds.includes(a.id) && <Check className="w-3 h-3 text-white" />}
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${isCKD ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : isHeart ? getRiskBadgeClasses(a.risk_level) : 'bg-violet-500/10 text-violet-400 border-violet-500/30'}`}>
                                {isCKD ? <Droplets className="w-3 h-3" /> : isHeart ? <Heart className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                                {isAr ? (isCKD ? 'الكلى (CKD)' : isHeart ? 'القلب' : 'السكري') : isTr ? (isCKD ? 'Böbrek (CKD)' : isHeart ? 'Kalp' : 'Diyabet') : (isCKD ? 'Kidney (CKD)' : isHeart ? 'Heart' : 'Diabetes')}
                              </span>
                              {isCKD ? (
                                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${ckdIsPositive ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-violet-500/20 text-violet-400 border-violet-500/30'}`}>
                                  {ckdPredictionDisplay(a.prediction, isAr, isTr)} · {((a.confidence || 0) * 100).toFixed(0)}%
                                </span>
                              ) : (
                                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${getRiskBadgeClasses(a.risk_level)}`}>
                                  {riskLevelDisplay(a.risk_level, isAr, isTr)} · {(a.probability * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-400 mt-1 line-clamp-2 max-w-md [&_strong]:font-semibold [&_strong]:text-gray-200">
                              <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span>, strong: ({ children }) => <strong>{children}</strong> }}>{a.executive_summary || ''}</ReactMarkdown>
                            </div>
                            {a.created_at && (
                              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(a.created_at).toLocaleDateString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US', { dateStyle: 'medium' })} · {new Date(a.created_at).toLocaleTimeString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                        {!compareMode && (
                          <div className="shrink-0 ml-3">
                            <AnimatedActionMenu
                              loading={pdfLoading === a.id || pdfLoading === `ckd-${a.id}` || shareLoading === a.id || deletingId === `ckd-${a.id}` || deletingId === `h-${a.id}` || deletingId === `a-${a.id}`}
                              items={[
                                { label: isAr ? 'تنزيل PDF' : isTr ? 'PDF İndir' : 'Download PDF', icon: <Download className="w-4 h-4" />, onClick: () => isCKD ? exportSignedCKDPDF(a) : isHeart ? exportSignedHeartPDF(a) : exportSignedAssessmentPDF(a) },
                                { label: isAr ? 'مشاركة' : isTr ? 'Paylaş' : 'Share', icon: <Share2 className="w-4 h-4" />, onClick: () => isCKD ? handleShareCKD(a.id) : isHeart ? handleShareHeart(a.id) : handleShare(a.id) },
                                { separator: true },
                                { label: isAr ? 'حذف' : isTr ? 'Sil' : 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: () => isCKD ? handleDeleteCKDAssessment(a) : isHeart ? handleDeleteHeartAssessment(a) : handleDeleteAssessment(a), destructive: true },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                      {shareLinkMatch && (
                        <div className={`mt-2 p-2 rounded-lg border ${isCKD ? 'bg-cyan-500/10 border-cyan-500/20' : isHeart ? getRiskBadgeClasses(a.risk_level) : 'bg-violet-500/10 border-violet-500/20'}`}>
                          <p className={`text-xs ${isCKD ? 'text-cyan-400' : isHeart ? '' : 'text-violet-400'}`}>{isAr ? 'تم نسخ الرابط:' : isTr ? 'Link kopyalandı:' : 'Link copied:'}</p>
                          <p className={`text-xs break-all opacity-90 ${isCKD ? 'text-cyan-300' : isHeart ? '' : 'text-violet-300'}`}>{shareLink.link}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {activeTab === 'imaging' && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">{isAr ? 'تاريخ التصوير' : isTr ? 'Görüntüleme Geçmişi' : 'Imaging History'}</h2>
            <div className="flex flex-wrap gap-2 items-center">
              {brainMriAnalyses.length > 0 && (
                <LiquidMetalButton onClick={() => { setImagingCompareMode(!imagingCompareMode); setImagingCompareIds([]); }} width={120} height={36}>
                  <GitCompare className="w-3.5 h-3.5" />
                  {isAr ? 'مقارنة' : isTr ? 'Karşılaştır' : 'Compare'}
                </LiquidMetalButton>
              )}
            </div>
          </div>

          {/* Type filter: Brain MRI only */}
          {!loading && brainMriAnalyses.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { id: 'all', labelEn: 'All', labelTr: 'Tümü', labelAr: 'الكل', w: 72 },
                { id: 'mri', labelEn: 'Brain MRI', labelTr: 'Beyin MRI', labelAr: 'الرنين المغناطيسي', icon: <Brain className="w-3.5 h-3.5" />, w: isAr ? 160 : 120 },
              ].map(f => {
                const active = imagingTypeFilter === f.id;
                return (
                  <div key={f.id} className="relative" style={{ borderRadius: '100px', boxShadow: active ? '0 0 18px rgba(124,58,237,0.4)' : 'none' }}>
                    {active && (
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '100px', background: 'rgba(124,58,237,0.28)', border: '1px solid rgba(167,139,250,0.6)', zIndex: 50, pointerEvents: 'none' }} />
                    )}
                    <LiquidMetalButton onClick={() => setImagingTypeFilter(f.id)} width={f.w} height={36}>
                      {f.icon} {isAr ? f.labelAr : isTr ? f.labelTr : f.labelEn}
                    </LiquidMetalButton>
                  </div>
                );
              })}
            </div>
          )}

          {/* Date + Search filters */}
          {!loading && brainMriAnalyses.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3 mb-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={imagingSearch}
                    onChange={(e) => setImagingSearch(e.target.value)}
                    placeholder={isAr ? 'بحث (نتائج، ملخص...)' : isTr ? 'Ara (bulgular, ozet...)' : 'Search (findings, summary...)'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
                  />
                </div>
                <DateRangePicker
                  from={imagingDateFrom}
                  to={imagingDateTo}
                  onFromChange={(e) => setImagingDateFrom(e.target.value)}
                  onToChange={(e) => setImagingDateTo(e.target.value)}
                  isTr={isTr}
                />
              </div>
              {(imagingSearch || imagingDateFrom || imagingDateTo) && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  {imagingSearch && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-300 text-xs border border-violet-500/25">
                      {isAr ? 'بحث' : isTr ? 'Ara' : 'Search'}: {imagingSearch}
                      <button type="button" onClick={() => setImagingSearch('')} className="hover:bg-violet-500/20 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {(imagingDateFrom || imagingDateTo) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 text-xs border border-blue-500/25">
                      {isAr ? 'التاريخ' : isTr ? 'Tarih' : 'Date'}: {imagingDateFrom || '...'} – {imagingDateTo || '...'}
                      <button type="button" onClick={() => { setImagingDateFrom(''); setImagingDateTo(''); }} className="hover:bg-blue-500/20 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-[120px] bg-white/[0.03] border border-white/[0.06] rounded-xl animate-pulse" />)}
            </div>
          ) : combinedImagingAnalyses.length === 0 ? (
            <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Brain className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">{isAr ? 'لم يتم تسجيل أي تحليلات تصوير بعد.' : isTr ? 'Henüz görüntüleme analizi yok.' : 'No imaging analyses recorded yet.'}</p>
            </div>
          ) : filteredImagingAnalyses.length === 0 ? (
            <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Search className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">{isAr ? 'لا توجد تحليلات تطابق عوامل التصفية.' : isTr ? 'Filtreye uyan analiz yok.' : 'No analyses match the filters.'}</p>
              <button type="button" onClick={() => { setImagingSearch(''); setImagingDateFrom(''); setImagingDateTo(''); }} className="text-sm text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-lg px-3 py-1.5">
                {isAr ? 'مسح عوامل التصفية' : isTr ? 'Filtreleri temizle' : 'Clear filters'}
              </button>
            </div>
          ) : (
            <>
              {/* Feature f6: Compare mode */}
              {imagingCompareMode && imagingCompareIds.length === 2 && comparedImagingAnalyses.length === 2 && (
                <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-violet-500/20">
                  <h3 className="text-sm font-semibold mb-3 text-violet-400">{isAr ? 'مقارنة' : isTr ? 'Karşılaştırma' : 'Comparison'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {comparedImagingAnalyses.map((a) => (
                      <div key={a.id} className="space-y-2">
                        <p className="text-xs text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString() : 'N/A'}</p>
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border ${a.tumor_class === 'no tumor' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-violet-500/20 text-violet-400 border-violet-500/30'}`}>
                          {`${a.tumor_class || 'N/A'} ${a.confidence != null ? `· ${(a.confidence * 100).toFixed(0)}%` : ''}`}
                        </span>
                        <div className="text-xs text-gray-400 line-clamp-3 mt-1 [&_strong]:font-semibold [&_strong]:text-gray-200">
                          {a.executive_summary ? a.executive_summary.replace(/\*+/g, '') : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {imagingCompareMode && imagingCompareIds.length < 2 && (
                <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <GitCompare className="w-5 h-5 text-amber-400 shrink-0" />
                  <p className="text-sm text-amber-200/90">
                    {isAr ? 'حدد تحليلين للمقارنة' : isTr ? 'Karşılaştırmak için 2 analiz seçin' : 'Select 2 analyses to compare'}
                  </p>
                </div>
              )}

              <ul className="space-y-3">
                {filteredImagingAnalyses.map((a) => {
                  const rowKey = `mri-${a.id}`;
                  const borderCls = a.tumor_class === 'no tumor' ? 'border-l-violet-500/50' : 'border-l-violet-500/50';
                  return (
                    <li
                      key={rowKey}
                      className={`p-4 rounded-xl bg-white/[0.03] border border-l-4 transition ${imagingCompareMode && imagingCompareIds.includes(a.id) ? 'border-violet-500/40 bg-violet-500/5 border-l-violet-500/60' : `border-white/[0.06] ${borderCls} ${!imagingCompareMode ? 'cursor-pointer hover:border-violet-500/30 focus:ring-violet-500/50 hover:text-violet-400' : ''}`}`}
                      onClick={!imagingCompareMode ? () => navigate(ROUTES.BRAIN_MRI, { state: { assessment: a } }) : undefined}
                      onKeyDown={!imagingCompareMode ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(ROUTES.BRAIN_MRI, { state: { assessment: a } }); } } : undefined}
                      role={!imagingCompareMode ? 'button' : undefined}
                      tabIndex={!imagingCompareMode ? 0 : undefined}
                      aria-label={!imagingCompareMode ? (isAr ? 'عرض التصوير' : isTr ? 'MRI görüntüle' : 'View MRI') : undefined}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {imagingCompareMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleImagingCompare(a.id); }}
                              className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${imagingCompareIds.includes(a.id) ? 'bg-violet-500 border-violet-500' : 'border-white/20 hover:border-violet-500/50'}`}
                              aria-label={imagingCompareIds.includes(a.id) ? (isAr ? 'إلغاء التحديد' : isTr ? 'Çıkar' : 'Deselect') : (isAr ? 'تحديد' : isTr ? 'Seç' : 'Select')}
                            >
                              {imagingCompareIds.includes(a.id) && <Check className="w-3 h-3 text-white" />}
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-violet-500/10 text-violet-400 border-violet-500/25">
                                <Brain className="w-3 h-3" />
                                Brain MRI
                              </span>
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium border ${a.tumor_class === 'no tumor' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-violet-500/20 text-violet-400 border-violet-500/30'}`}>
                                {`${a.tumor_class || 'N/A'} ${a.confidence != null ? `· ${(a.confidence * 100).toFixed(0)}%` : ''}`}
                              </span>
                            </div>
                            <div className="text-sm text-gray-400 mt-1 line-clamp-2 max-w-md [&_strong]:font-semibold [&_strong]:text-gray-200">
                              {a.executive_summary ? a.executive_summary.replace(/\*+/g, '') : '—'}
                            </div>
                            {a.created_at && <p className="text-xs text-gray-500 mt-1.5">{new Date(a.created_at).toLocaleString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US')}</p>}
                          </div>
                        </div>
                        {!imagingCompareMode && (
                          <div className="shrink-0 ml-2">
                            <AnimatedActionMenu
                              loading={pdfLoading === `bm-${a.id}` || deletingId === `bmr-${a.id}`}
                              items={[
                                { label: isAr ? 'تنزيل PDF' : isTr ? 'PDF İndir' : 'Download PDF', icon: <Download className="w-4 h-4" />, onClick: () => exportSignedMriPDF(a) },
                                { separator: true },
                                { label: isAr ? 'حذف' : isTr ? 'Sil' : 'Delete', icon: <Trash2 className="w-4 h-4" />, destructive: true, onClick: async () => {
                                  if (!window.confirm(isAr ? 'هل تريد حذف هذا السجل؟' : isTr ? 'Bu kayıt silinsin mi?' : 'Delete this record?')) return;
                                  setDeletingId(`bmr-${a.id}`);
                                  try {
                                    await apiService.deleteBrainMriAnalysis(a.id);
                                    setBrainMriAnalyses(prev => prev.filter(x => x.id !== a.id));
                                  } catch(err) { alert(err.message); } finally { setDeletingId(null); }
                                }},
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {activeTab === 'diet-plans' && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">{isAr ? 'خطط النظام الغذائي الخاصة بي' : isTr ? 'Diyet Planlarım' : 'My Diet Plans'}</h2>
            <LiquidMetalButton onClick={() => navigate(ROUTES.DIET_PLAN)} width={130} height={36}>
              {isAr ? 'خطة جديدة' : isTr ? 'Yeni plan' : 'New plan'} <ArrowRight className="w-3.5 h-3.5" />
            </LiquidMetalButton>
          </div>

          {/* Date + Search filters for diet plans */}
          {!loading && dietPlans.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3 mb-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={dietPlanSearch}
                    onChange={(e) => setDietPlanSearch(e.target.value)}
                    placeholder={isAr ? 'بحث (هدف، نظرة عامة...)' : isTr ? 'Ara (hedef, özet…)' : 'Search (goal, overview…)'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
                    aria-label={isAr ? 'البحث في خطط النظام الغذائي' : isTr ? 'Diyet planı ara' : 'Search diet plans'}
                  />
                </div>
                <DateRangePicker
                  from={dietPlanDateFrom}
                  to={dietPlanDateTo}
                  onFromChange={(e) => setDietPlanDateFrom(e.target.value)}
                  onToChange={(e) => setDietPlanDateTo(e.target.value)}
                  isTr={isTr}
                />
              </div>
              {(dietPlanSearch || dietPlanDateFrom || dietPlanDateTo) && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  {dietPlanSearch && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 text-xs border border-cyan-500/25">
                      {isAr ? 'بحث' : isTr ? 'Ara' : 'Search'}: {dietPlanSearch}
                      <button type="button" onClick={() => setDietPlanSearch('')} className="hover:bg-cyan-500/20 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {dietPlanDateFrom && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] text-gray-300 text-xs border border-white/[0.12]">
                      {isAr ? 'من' : isTr ? 'Başlangıç' : 'From'}: {dietPlanDateFrom}
                      <button type="button" onClick={() => setDietPlanDateFrom('')} className="hover:bg-white/10 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {dietPlanDateTo && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] text-gray-300 text-xs border border-white/[0.12]">
                      {isAr ? 'إلى' : isTr ? 'Bitiş' : 'To'}: {dietPlanDateTo}
                      <button type="button" onClick={() => setDietPlanDateTo('')} className="hover:bg-white/10 rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50" aria-label={isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <button type="button" onClick={() => { setDietPlanSearch(''); setDietPlanDateFrom(''); setDietPlanDateTo(''); }} className="text-xs text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded px-2 py-1">
                    {isAr ? 'مسح الكل' : isTr ? 'Filtreleri temizle' : 'Clear all'}
                  </button>
                </div>
              )}
            </>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-40 rounded bg-white/[0.08]" />
                      <div className="h-3 w-full max-w-md rounded bg-white/[0.06]" />
                      <div className="h-3 w-36 rounded bg-white/[0.06] mt-1.5" />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <div className="h-9 w-9 rounded-lg bg-white/[0.06]" />
                      <div className="h-9 w-9 rounded-lg bg-white/[0.06]" />
                      <div className="h-9 w-9 rounded-lg bg-white/[0.06]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : dietPlans.length === 0 ? (
            <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <h3 className="text-white font-semibold mb-1">{isAr ? 'لا توجد خطط للنظام الغذائي بعد' : isTr ? 'Henüz diyet planı yok' : 'No diet plans yet'}</h3>
              <p className="text-gray-400 text-sm max-w-sm mx-auto">{isAr ? 'ستظهر خطط النظام الغذائي المخصصة التي يتم إنشاؤها بواسطة الذكاء الاصطناعي هنا.' : isTr ? 'Yapay zeka destekli kişiselleştirilmiş diyet planlarınız burada görünecek.' : 'Your AI-generated personalized diet plans will appear here.'}</p>
            </div>
          ) : filteredDietPlans.length === 0 ? (
            <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Search className="w-10 h-10 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">{isAr ? 'لا توجد خطط تطابق عوامل التصفية.' : isTr ? 'Filtreye uyan diyet planı yok.' : 'No diet plans match the filters.'}</p>
              <button type="button" onClick={() => { setDietPlanSearch(''); setDietPlanDateFrom(''); setDietPlanDateTo(''); }} className="text-sm text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-lg px-3 py-1.5">
                {isAr ? 'مسح عوامل التصفية' : isTr ? 'Filtreleri temizle' : 'Clear filters'}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredDietPlans.map((d) => {
                const payload = d.payload || {};
                return (
                  <li key={d.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] border-l-4 border-l-violet-500/50 hover:border-violet-500/30 transition">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{d.plan_name || dietGoalDisplay(d.goal, isAr, isTr)}</p>
                        <p className="text-sm text-gray-400 line-clamp-2 mt-1">{d.overview}</p>
                        {d.created_at && (
                          <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(d.created_at).toLocaleDateString(isAr ? 'ar-SA' : isTr ? 'tr-TR' : 'en-US', { dateStyle: 'medium' })} · {formatTime(d.created_at)}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <AnimatedActionMenu
                          loading={deletingId === `d-${d.id}`}
                          items={[
                            { label: isAr ? 'عرض الخطة' : isTr ? 'Planı görüntüle' : 'View plan', icon: <Eye className="w-4 h-4" />, onClick: () => navigate(`${ROUTES.DASHBOARD_DIET_PLAN}/${d.id}`, { state: { dietPlan: d } }) },
                            ...(payload.grocery_list ? [{
                              label: isAr ? 'قائمة البقالة' : isTr ? 'Alışveriş Listesi' : 'Grocery List',
                              icon: <Download className="w-4 h-4" />,
                              onClick: () => {
                                const text = typeof payload.grocery_list === 'string' ? payload.grocery_list : JSON.stringify(payload.grocery_list, null, 2);
                                const blob = new Blob([text], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const el = document.createElement('a');
                                el.href = url; el.download = `grocery-list-${d.id}.txt`; el.click();
                                URL.revokeObjectURL(url);
                              },
                            }] : []),
                            { separator: true },
                            { label: isAr ? 'حذف' : isTr ? 'Sil' : 'Delete', icon: <Trash2 className="w-4 h-4" />, destructive: true, onClick: () => handleDeleteDietPlan(d) },
                          ]}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'subscription' && (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white tracking-tight">{isAr ? 'خطتي' : isTr ? 'Aboneliğim' : 'My Plan'}</h2>
            <p className="text-gray-400 text-sm mt-1">{isAr ? 'إدارة خطتك الحالية وصلاحيات الوصول.' : isTr ? 'Mevcut planınızı görüntüleyin ve yönetin.' : 'Manage your current plan and access.'}</p>
          </div>

          {subscriptionConfirmError && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm px-4 py-3 flex items-center justify-between gap-3">
              <span>{subscriptionConfirmError}</span>
              <button type="button" onClick={() => setSubscriptionConfirmError(null)} className="shrink-0 p-1 rounded hover:bg-amber-500/20" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <FluidCard className={`overflow-hidden rounded-2xl border cursor-grab active:cursor-grabbing transition-all ${
            (user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly')
              ? 'bg-gradient-to-br from-violet-500/[0.08] via-white/[0.03] to-cyan-500/[0.06] border-violet-500/25 shadow-lg shadow-violet-500/5'
              : 'bg-gradient-to-br from-white/[0.04] to-white/[0.02] border-white/[0.08]'
          }`}>
            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    (user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly')
                      ? 'bg-violet-500/20 ring-2 ring-violet-500/30'
                      : 'bg-white/[0.08] ring-1 ring-white/[0.1]'
                  }`}>
                    {(user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly') ? (
                      <Sparkles className="w-7 h-7 text-violet-400" />
                    ) : (
                      <CreditCard className="w-7 h-7 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                        (user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly')
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                          : 'bg-white/[0.1] text-gray-200 border border-white/[0.12]'
                      }`}>
                        {(user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly')
                          ? (user.subscription_tier === 'pro_yearly' ? (isAr ? 'باقة برو (سنوية)' : isTr ? 'Pro (Yıllık) tier' : 'Pro (Yearly) tier') : (isAr ? 'باقة برو (شهرية)' : isTr ? 'Pro (Aylık) tier' : 'Pro (Monthly) tier'))
                          : (isAr ? 'باقة مجانية' : isTr ? 'Ücretsiz tier' : 'Free tier')}
                      </span>
                      {user?.subscription_status === 'active' && (user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly') && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/25">
                          {isAr ? 'نشط' : isTr ? 'Aktif' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-2">
                      {user?.subscription_status === 'active' && user?.current_period_end
                        ? (isAr ? `الفاتورة القادمة: ${new Date(user.current_period_end).toLocaleDateString('ar-SA')}` : isTr ? `Sonraki ödeme: ${new Date(user.current_period_end).toLocaleDateString('tr-TR')}` : `Next billing: ${new Date(user.current_period_end).toLocaleDateString('en-US')}`)
                        : (isAr ? 'جميع الأدوات مجانية. قم بالترقية إلى برو في أي وقت للوصول المبكر إلى الميزات الجديدة.' : isTr ? 'Tüm araçlar ücretsiz. İstediğiniz zaman Pro\'ya geçebilirsiniz.' : 'All tools are free. Upgrade to Pro anytime for early access to new features.')}
                    </p>
                    {(user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly') ? (
                      <p className="text-violet-400/90 text-xs mt-1.5">{isAr ? 'وصول مبكر إلى ميزات جديدة.' : isTr ? 'Yeni özelliklere erken erişim.' : 'Early access to new features.'}</p>
                    ) : (
                      <p className="text-gray-500 text-xs mt-1.5">{isAr ? 'التقييم، المحادثة، النظام الغذائي، الصوت والمزيد.' : isTr ? 'Assessment, Chat, Diyet, Ses ve daha fazlası.' : 'Assessment, Chat, Diet, Voice & more.'}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0">
                  {(user?.subscription_tier === 'pro_monthly' || user?.subscription_tier === 'pro_yearly') ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setPortalLoading(true);
                        try {
                          const { url } = await apiService.createPortalSession();
                          if (url) window.location.href = url;
                        } catch (err) {
                          alert(err.message || (isAr ? 'تعذر فتح البوابة.' : isTr ? 'Portal açılamadı.' : 'Could not open portal.'));
                        } finally {
                          setPortalLoading(false);
                        }
                      }}
                      disabled={portalLoading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.1] hover:bg-white/[0.15] text-white text-sm font-medium border border-white/[0.15] transition focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    >
                      {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {isAr ? 'إدارة الاشتراك' : isTr ? 'Aboneliği yönet' : 'Manage subscription'}
                    </button>
                  ) : (
                    <LiquidMetalButton onClick={() => navigate(ROUTES.PRICING)} width={180}>
                      <Sparkles className="w-4 h-4" />
                      {isAr ? "الترقية إلى برو" : isTr ? "Pro'ya geç" : 'Upgrade to Pro'}
                    </LiquidMetalButton>
                  )}
                </div>
              </div>
            </div>
          </FluidCard>

        </section>
      )}

      {activeTab === 'profile' && (
        <DashboardProfile
          language={language}
          user={user}
          refreshUser={refreshUser}
          setUserAvatar={setUserAvatar}
          handleExportData={handleExportData}
          exporting={exporting}
        />
      )}

    </div>
  );
}

/** Small helper: shows image or falls back to initials if image fails to load. */
function AvatarPreview({ url, initials }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [url]);
  if (!url || err) {
    return (
      <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center text-3xl font-bold text-violet-400 border-2 border-white/[0.08]">
        {initials}
      </div>
    );
  }
  return <img src={url} alt="Preview" className="w-32 h-32 rounded-2xl object-cover border-2 border-white/[0.08]" onError={() => setErr(true)} />;
}

function DashboardProfile({ language, user, refreshUser, setUserAvatar, handleExportData, exporting }) {
  const isTr = language === 'turkish';
  const isAr = language === 'arabic';
  const fileInputRef = useRef(null);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferred_language || 'english');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [avatarInput, setAvatarInput] = useState(user?.avatar_url || '');
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [saving, setSaving] = useState(false);

  // Feature f8: Diet preferences
  const [dietPref, setDietPref] = useState(user?.dietary_preference || '');
  const [allergies, setAllergies] = useState(user?.allergies || '');
  const [calorieGoal, setCalorieGoal] = useState(user?.calorie_goal || '');
  const [dietDropdownOpen, setDietDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const dietDropdownRef = useRef(null);
  const langDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dietDropdownRef.current && !dietDropdownRef.current.contains(e.target)) setDietDropdownOpen(false);
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) setLangDropdownOpen(false);
    }
    if (dietDropdownOpen || langDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dietDropdownOpen, langDropdownOpen]);

  // Feature f15: 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [twoFAData, setTwoFAData] = useState(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Face login
  const [hasFace, setHasFace] = useState(false);
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceEnrollLoading, setFaceEnrollLoading] = useState(false);
  const [faceEnrollOpen, setFaceEnrollOpen] = useState(false);
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [faceToggleLoading, setFaceToggleLoading] = useState(false);
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);

  useEffect(() => {
    setAvatarUrl(user?.avatar_url || '');
    setAvatarInput(user?.avatar_url || '');
    setFullName(user?.full_name || '');
    setPreferredLanguage(user?.preferred_language || 'english');
    setDietPref(user?.dietary_preference || '');
    setAllergies(user?.allergies || '');
    setCalorieGoal(user?.calorie_goal || '');
    setAvatarError(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    faceStatus().then((r) => {
      setHasFace(!!r.enrolled);
      setFaceEnabled(!!r.enabled);
    }).catch(() => { setHasFace(false); setFaceEnabled(false); });
  }, [user]);

  // Preload face models as soon as the modal opens so Capture is faster
  useEffect(() => {
    if (faceEnrollOpen) {
      import('../utils/faceEmbedding').then((m) => m.preloadFaceModels());
    }
  }, [faceEnrollOpen]);

  const handleFaceToggle = async () => {
    setFaceToggleLoading(true);
    setMessage('');
    try {
      const next = !faceEnabled;
      await faceToggleEnabled(next);
      setFaceEnabled(next);
      showMessage(next ? (isAr ? 'تم تفعيل تسجيل الدخول بالوجه.' : isTr ? 'Yüz girişi açıldı.' : 'Face login enabled.') : (isAr ? 'تم إيقاف تسجيل الدخول بالوجه.' : isTr ? 'Yüz girişi kapatıldı.' : 'Face login disabled.'));
      // Refetch so UI stays in sync with server
      faceStatus().then((r) => { setHasFace(!!r.enrolled); setFaceEnabled(!!r.enabled); }).catch(() => {});
    } catch (e) {
      const msg = (e && e.message) || '';
      const is404 = /404|not enrolled/i.test(msg);
      showMessage(is404 ? (isAr ? 'تسجيل الدخول بالوجه غير معد. قم بإعداده أولاً.' : isTr ? 'Yüz kaydı bulunamadı. Lütfen önce yüz kaydı oluşturun.' : 'Face login not set up. Set it up first.') : (msg || (isAr ? 'تعذر تحديث الإعداد.' : isTr ? 'Ayar güncellenemedi.' : 'Could not update setting.')), 'error');
      faceStatus().then((r) => { setHasFace(!!r.enrolled); setFaceEnabled(!!r.enabled); }).catch(() => {});
    } finally {
      setFaceToggleLoading(false);
    }
  };

  const startFaceEnrollCamera = async () => {
    if (!faceVideoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      faceStreamRef.current = stream;
      faceVideoRef.current.srcObject = stream;
      setFaceCameraActive(true);
    } catch (e) {
      showMessage(e.message || (isAr ? 'تم رفض الوصول إلى الكاميرا.' : isTr ? 'Kamera erişilemedi.' : 'Camera access denied.'), 'error');
    }
  };

  const captureAndEnrollFace = async () => {
    setFaceEnrollLoading(true);
    setMessage('');
    try {
      const { getEnrollmentEmbedding } = await import('../utils/faceEmbedding');
      const embedding = await getEnrollmentEmbedding(faceVideoRef.current);
      if (!embedding || embedding.length === 0) {
        showMessage(isAr ? 'لم يتم اكتشاف وجه. تحقق من الإضاءة وحاول مرة أخرى.' : isTr ? 'Yüz algılanamadı. Işığı kontrol edip tekrar deneyin.' : 'No face detected. Check lighting and try again.', 'error');
        setFaceEnrollLoading(false);
        return;
      }
      await faceEnroll(embedding);
      if (faceStreamRef.current) faceStreamRef.current.getTracks().forEach((t) => t.stop());
      setFaceCameraActive(false);
      setFaceEnrollOpen(false);
      setHasFace(true);
      showMessage(isAr ? 'تم اكتمال تسجيل الوجه.' : isTr ? 'Yüz kaydı tamamlandı.' : 'Face enrollment complete.');
    } catch (e) {
      showMessage(e.message || (isAr ? 'فشل تسجيل الوجه.' : isTr ? 'Yüz kaydı başarısız.' : 'Face enrollment failed.'), 'error');
    } finally {
      setFaceEnrollLoading(false);
    }
  };

  const closeFaceEnroll = () => {
    if (faceStreamRef.current) faceStreamRef.current.getTracks().forEach((t) => t.stop());
    setFaceCameraActive(false);
    setFaceEnrollOpen(false);
  };

  const showMessage = (msg, type = 'success') => {
    haptic(type === 'error' ? 'error' : 'success');
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const calorieNegative = calorieGoal !== '' && !isNaN(parseInt(calorieGoal)) && parseInt(calorieGoal) < 0;
    if (calorieNegative) {
      showMessage(isAr ? 'الرجاء إدخال رقم موجب.' : isTr ? 'Lütfen negatif olmayan bir sayı girin.' : 'Please enter a positive number.', 'error');
      return;
    }
    setMessage('');
    setSaving(true);
    try {
      await apiService.updateProfile({
        full_name: fullName,
        preferred_language: preferredLanguage,
        dietary_preference: dietPref,
        allergies,
        calorie_goal: calorieGoal ? parseInt(calorieGoal) : null,
      });
      await refreshUser();
      showMessage(isAr ? 'تم تحديث الملف الشخصي.' : isTr ? 'Profil güncellendi.' : 'Profile updated.', 'success');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل التحديث.' : isTr ? 'Güncelleme başarısız.' : 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAvatar = async () => {
    setSaving(true);
    try {
      const url = avatarInput.trim() || null;
      await apiService.updateProfile({ avatar_url: url });
      setAvatarError(false);
      setAvatarUrl(url || '');
      if (setUserAvatar) setUserAvatar(url);
      await refreshUser();
      setShowAvatarEdit(false);
      showMessage(isAr ? 'تم تحديث صورة الملف الشخصي.' : isTr ? 'Profil fotoğrafı güncellendi.' : 'Profile picture updated.', 'success');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل التحديث.' : isTr ? 'Güncelleme başarısız.' : 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setSaving(true);
    try {
      await apiService.updateProfile({ avatar_url: '' });
      if (setUserAvatar) setUserAvatar(null);
      await refreshUser();
      setAvatarUrl('');
      setAvatarInput('');
      setShowAvatarEdit(false);
      showMessage(isAr ? 'تمت إزالة صورة الملف الشخصي.' : isTr ? 'Profil fotoğrafı kaldırıldı.' : 'Profile picture removed.', 'success');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل الإزالة.' : isTr ? 'Kaldırma başarısız.' : 'Remove failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPresetAvatar = async (dataUrl) => {
    setSaving(true);
    try {
      await apiService.updateProfile({ avatar_url: dataUrl });
      setAvatarError(false);
      setAvatarUrl(dataUrl);
      setAvatarInput(dataUrl);
      if (setUserAvatar) setUserAvatar(dataUrl);
      await refreshUser();
      setShowAvatarEdit(false);
      showMessage(isAr ? 'تم تحديث الصورة الرمزية.' : isTr ? 'Avatar güncellendi.' : 'Avatar updated.', 'success');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل التحديث.' : isTr ? 'Güncelleme başarısız.' : 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setSaving(true);
    try {
      const result = await apiService.uploadAvatar(file);
      const url = result.avatar_url;
      setAvatarError(false);
      setAvatarUrl(url);
      setAvatarInput(url);
      if (setUserAvatar) setUserAvatar(url);
      await refreshUser();
      setShowAvatarEdit(false);
      showMessage(isAr ? 'تم تحميل صورة الملف الشخصي.' : isTr ? 'Profil fotoğrafı yüklendi.' : 'Profile picture uploaded.', 'success');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل التحميل.' : isTr ? 'Yükleme başarısız.' : 'Upload failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!currentPassword || !newPassword) {
      showMessage(isAr ? 'كلمة المرور الحالية والجديدة مطلوبة.' : isTr ? 'Mevcut ve yeni şifre gerekli.' : 'Current and new password required.', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiService.changePassword(currentPassword, newPassword);
      showMessage(isAr ? 'تم تحديث كلمة المرور.' : isTr ? 'Şifre güncellendi.' : 'Password updated.', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل تحديث كلمة المرور.' : isTr ? 'Şifre güncellenemedi.' : 'Password update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 2FA handlers
  const handle2FASetup = async () => {
    setTwoFALoading(true);
    try {
      const data = await apiService.setup2FA();
      setTwoFAData(data);
      setShow2FA(true);
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل إعداد المصادقة الثنائية' : isTr ? '2FA kurulumu başarısız.' : '2FA setup failed'), 'error');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handle2FAVerify = async () => {
    setTwoFALoading(true);
    try {
      await apiService.verify2FA(twoFACode);
      showMessage(isAr ? 'تم تفعيل المصادقة الثنائية بنجاح.' : isTr ? '2FA etkinleştirildi.' : '2FA enabled successfully.', 'success');
      setShow2FA(false);
      setTwoFACode('');
      setTwoFAData(null);
      refreshUser();
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل التحقق' : isTr ? 'Doğrulama başarısız.' : 'Verification failed'), 'error');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handle2FADisable = async () => {
    setTwoFALoading(true);
    try {
      await apiService.disable2FA();
      showMessage(isAr ? 'تم إيقاف المصادقة الثنائية.' : isTr ? '2FA devre dışı bırakıldı.' : '2FA disabled.', 'success');
      refreshUser();
    } catch (err) {
      showMessage(err.message || (isAr ? 'فشل في إيقاف المصادقة الثنائية' : isTr ? '2FA devre dışı bırakılamadı.' : 'Failed to disable 2FA'), 'error');
    } finally {
      setTwoFALoading(false);
    }
  };

  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8">
      {/* Avatar Section */}
      <div className="flex items-start gap-6">
        <div className="relative group">
          {avatarUrl && !avatarError ? (
            <img
              key={avatarUrl}
              src={getAvatarUrl(avatarUrl)}
              alt="Profile"
              className="w-24 h-24 rounded-2xl object-cover border-2 border-white/[0.08]"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center text-2xl font-bold text-violet-400 border-2 border-white/[0.08]">
              {initials}
            </div>
          )}
          <button
            onClick={() => { setShowAvatarEdit(true); setAvatarInput(avatarUrl); }}
            className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-violet-500 hover:bg-violet-600 flex items-center justify-center shadow-lg transition"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
        </div>
        <div>
          <h3 className="text-white font-medium text-lg">{user?.full_name || user?.email}</h3>
          <p className="text-gray-500 text-sm">{user?.email}</p>
          <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium
            ${user?.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-gray-400'}`}>
            {user?.role === 'admin' ? (isAr ? 'مسؤول' : isTr ? 'Yönetici' : 'admin') : (isAr ? 'مستخدم' : isTr ? 'Kullanıcı' : (user?.role || 'user'))}
          </span>
        </div>
      </div>

      {/* Avatar Edit Modal */}
      {showAvatarEdit && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowAvatarEdit(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
            <div className="bg-[#0e0e0e] border border-white/[0.08] rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{isAr ? 'صورة الملف الشخصي' : isTr ? 'Profil Fotoğrafı' : 'Profile Picture'}</h3>
                <button onClick={() => setShowAvatarEdit(false)} className="p-1 hover:bg-white/[0.05] rounded-lg">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="flex justify-center mb-4">
                {avatarInput ? (
                  <AvatarPreview url={getAvatarUrl(avatarInput)} initials={initials} />
                ) : (
                  <div className="w-32 h-32 rounded-2xl bg-white/[0.04] flex items-center justify-center text-3xl font-bold text-white/30 border border-white/[0.08]">
                    {initials}
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileSelect} />
              <div className="space-y-4">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] text-white/50 hover:bg-white/[0.07] hover:text-white/70 border border-white/[0.08] transition disabled:opacity-50">
                  <Upload className="w-5 h-5" />
                  {isAr ? 'تحميل من جهاز الكمبيوتر' : isTr ? 'Bilgisayardan yükle' : 'Upload from computer'}
                </button>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{isAr ? 'أو رابط الصورة' : isTr ? 'Veya resim URL' : 'Or image URL'}</label>
                  <input type="url" value={avatarInput} onChange={(e) => setAvatarInput(e.target.value)} placeholder="https://example.com/photo.jpg" className="w-full px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/20 focus:outline-none focus:border-white/20" />
                </div>
                <div className="flex gap-3">
                  {avatarUrl && (
                    <button onClick={handleRemoveAvatar} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition">
                      {isAr ? 'إزالة' : isTr ? 'Kaldır' : 'Remove'}
                    </button>
                  )}
                  <button onClick={() => setShowAvatarEdit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/[0.05] border border-white/[0.08] transition">
                    {isAr ? 'إلغاء' : isTr ? 'İptal' : 'Cancel'}
                  </button>
                  <button onClick={handleSaveAvatar} disabled={saving} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white/[0.08] hover:bg-white/[0.12] text-white/80 border border-white/[0.1] transition flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {isAr ? 'حفظ' : isTr ? 'Kaydet' : 'Save'}
                  </button>
                </div>

                {/* Preset illustration avatars */}
                <AvatarPicker onSelect={handleSelectPresetAvatar} saving={saving} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md pb-8">
        <h3 className="text-white font-medium">{isAr ? 'معلومات الملف الشخصي' : isTr ? 'Profil bilgileri' : 'Profile info'}</h3>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{isAr ? 'الاسم الكامل' : isTr ? 'Ad Soyad' : 'Full name'}</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50" />
        </div>
        <div ref={langDropdownRef} className="relative">
          <label className="block text-sm text-gray-400 mb-1">{isAr ? 'اللغة' : isTr ? 'Dil' : 'Language'}</label>
          <button
            type="button"
            onClick={() => setLangDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50 text-left"
          >
            <span>{preferredLanguage === 'arabic' ? 'العربية' : preferredLanguage === 'turkish' ? 'Türkçe' : 'English'}</span>
            <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {langDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1a2e] shadow-xl py-1">
              <button type="button" onClick={() => { setPreferredLanguage('english'); setLangDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm transition ${preferredLanguage === 'english' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-200 hover:bg-white/[0.06] hover:text-white'}`}>English</button>
              <button type="button" onClick={() => { setPreferredLanguage('turkish'); setLangDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm transition ${preferredLanguage === 'turkish' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-200 hover:bg-white/[0.06] hover:text-white'}`}>Türkçe</button>
              <button type="button" onClick={() => { setPreferredLanguage('arabic'); setLangDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm transition ${preferredLanguage === 'arabic' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-200 hover:bg-white/[0.06] hover:text-white'}`}>العربية</button>
            </div>
          )}
        </div>

        {/* Feature f8: Diet preferences */}
        <div className="pt-2">
          <h3 className="text-white font-medium mb-3">{isAr ? 'تفضيلات النظام الغذائي' : isTr ? 'Diyet Tercihleri' : 'Diet Preferences'}</h3>
          <div className="space-y-4">
            <div ref={dietDropdownRef} className="relative">
              <label className="block text-sm text-gray-400 mb-1">{isAr ? 'التفضيل الغذائي' : isTr ? 'Diyet tipi' : 'Dietary preference'}</label>
              <button
                type="button"
                onClick={() => setDietDropdownOpen((o) => !o)}
                className="w-full flex items-center justify-between pl-4 pr-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50 text-left"
              >
                <span className={dietPref ? 'text-white' : 'text-gray-500'}>
                  {dietPref === 'balanced' ? (isAr ? 'متوازن' : isTr ? 'Dengeli' : 'Balanced') : dietPref === 'vegetarian' ? (isAr ? 'نباتي' : isTr ? 'Vejetaryen' : 'Vegetarian') : dietPref === 'vegan' ? 'Vegan' : dietPref === 'mediterranean' ? (isAr ? 'البحر الأبيض المتوسط' : isTr ? 'Akdeniz' : 'Mediterranean') : dietPref === 'low_carb' ? (isAr ? 'منخفض الكربوهيدرات' : isTr ? 'Düşük Karbonhidrat' : 'Low Carb') : dietPref === 'diabetic_friendly' ? (isAr ? 'مناسب لمرضى السكري' : isTr ? 'Diyabet Dostu' : 'Diabetic Friendly') : (isAr ? 'اختر...' : isTr ? 'Seçin...' : 'Select...')}
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${dietDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {dietDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/[0.08] bg-[#1a1a2e] shadow-xl py-1 max-h-56 overflow-y-auto">
                  {[
                    { value: '', labelEn: 'Select...', labelTr: 'Seçin...', labelAr: 'اختر...' },
                    { value: 'balanced', labelEn: 'Balanced', labelTr: 'Dengeli', labelAr: 'متوازن' },
                    { value: 'vegetarian', labelEn: 'Vegetarian', labelTr: 'Vejetaryen', labelAr: 'نباتي' },
                    { value: 'vegan', labelEn: 'Vegan', labelTr: 'Vegan', labelAr: 'نباتي صرف (فيغان)' },
                    { value: 'mediterranean', labelEn: 'Mediterranean', labelTr: 'Akdeniz', labelAr: 'البحر الأبيض المتوسط' },
                    { value: 'low_carb', labelEn: 'Low Carb', labelTr: 'Düşük Karbonhidrat', labelAr: 'منخفض الكربوهيدرات' },
                    { value: 'diabetic_friendly', labelEn: 'Diabetic Friendly', labelTr: 'Diyabet Dostu', labelAr: 'مناسب لمرضى السكري' },
                  ].map((opt) => (
                    <button
                      key={opt.value || 'empty'}
                      type="button"
                      onClick={() => { setDietPref(opt.value); setDietDropdownOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition ${opt.value === dietPref ? 'bg-violet-500/20 text-violet-400' : 'text-gray-200 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      {isAr ? opt.labelAr : isTr ? opt.labelTr : opt.labelEn}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{isAr ? 'الحساسية / القيود' : isTr ? 'Alerjiler / kısıtlamalar' : 'Allergies / restrictions'}</label>
              <input type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder={isAr ? 'مثال: الغلوتين، اللاكتوز' : isTr ? 'örn. glüten, laktoz' : 'e.g. gluten, lactose'} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{isAr ? 'الهدف اليومي للسعرات' : isTr ? 'Günlük kalori hedefi' : 'Daily calorie goal'}</label>
              <input type="number" value={calorieGoal} onChange={(e) => setCalorieGoal(e.target.value)} placeholder={isAr ? 'مثال: 2000' : isTr ? 'örn. 2000' : 'e.g. 2000'} className={`w-full px-4 py-2 rounded-lg bg-white/[0.05] border text-white placeholder-gray-500 focus:outline-none ${calorieGoal !== '' && !isNaN(parseInt(calorieGoal)) && parseInt(calorieGoal) < 0 ? 'border-red-500/50 focus:border-red-500/70' : 'border-white/[0.08] focus:border-violet-500/50'}`} />
              {calorieGoal !== '' && !isNaN(parseInt(calorieGoal)) && parseInt(calorieGoal) < 0 && <p className="text-[11px] text-red-400 font-medium mt-1">{isAr ? 'الرجاء إدخال رقم موجب.' : isTr ? 'Lütfen negatif olmayan bir sayı girin.' : 'Please enter a positive number.'}</p>}
            </div>
          </div>
        </div>

        <div className="pt-4">
          <LiquidMetalButton type="submit" disabled={saving} width={120}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {isAr ? 'جارِ الحفظ...' : isTr ? 'Kaydediliyor…' : 'Saving…'}</> : (isAr ? 'حفظ' : isTr ? 'Kaydet' : 'Save')}
          </LiquidMetalButton>
        </div>
      </form>

      {/* Face login: full control */}
      <div className="space-y-4 max-w-md pt-8 pb-4">
        <h3 className="text-white font-medium">{isAr ? 'تسجيل الدخول بالوجه' : isTr ? 'Yüz ile giriş' : 'Face login'}</h3>
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-4">
          <div className="flex items-center gap-2">
            <ScanFace className="w-5 h-5 text-violet-400 shrink-0" />
            <span className="text-gray-300">{isAr ? 'سجل الدخول في صفحة تسجيل الدخول باستخدام وجهك.' : isTr ? 'Giriş sayfasında yüzünüzle otomatik giriş yapın.' : 'Sign in on the login page with your face.'}</span>
          </div>
          {!hasFace ? (
            <button type="button" onClick={() => setFaceEnrollOpen(true)} className="px-4 py-2 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30 text-sm font-medium hover:bg-violet-500/25 transition">
              {isAr ? 'إعداد تسجيل الدخول بالوجه' : isTr ? 'Yüz kaydı oluştur' : 'Set up face login'}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm px-2.5 py-1 rounded-lg ${faceEnabled ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'}`}>
                {faceEnabled ? (isAr ? 'تشغيل' : isTr ? 'Açık' : 'On') : (isAr ? 'إيقاف' : isTr ? 'Kapalı' : 'Off')}
              </span>
              <button type="button" onClick={handleFaceToggle} disabled={faceToggleLoading} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-300 hover:text-white border border-white/[0.08] text-sm font-medium disabled:opacity-50 transition">
                {faceToggleLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (faceEnabled ? (isAr ? 'إيقاف التشغيل' : isTr ? 'Kapat' : 'Turn off') : (isAr ? 'تشغيل' : isTr ? 'Aç' : 'Turn on'))}
              </button>
              <button type="button" onClick={() => setFaceEnrollOpen(true)} className="px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30 text-sm font-medium hover:bg-violet-500/25 transition">
                {isAr ? 'تحديث مسح الوجه' : isTr ? 'Yüz taramasını güncelle' : 'Update face scan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {faceEnrollOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={isAr ? 'تسجيل الوجه' : isTr ? 'Yüz kaydı' : 'Face enrollment'}>
          <div className="rounded-2xl bg-[#0c0c14] border border-white/10 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">{isAr ? 'إعداد تسجيل الدخول بالوجه' : isTr ? 'Yüzünüzü kaydedin' : 'Set up face login'}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {isAr ? 'قم بتشغيل الكاميرا، انظر إليها، ثم انقر فوق التقاط. قد تستغرق المرة الأولى بضع ثوانٍ.' : isTr ? 'Kamerayı açın, kameraya bakın ve Kaydet\'e tıklayın.' : 'Start camera, look at it, then click Capture. First time may take a few seconds.'}
            </p>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
              <video ref={faceVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              {!faceCameraActive ? (
                <button type="button" onClick={startFaceEnrollCamera} className="flex-1 py-2.5 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  {isAr ? 'تشغيل الكاميرا' : isTr ? 'Kamerayı aç' : 'Start camera'}
                </button>
              ) : (
                <button type="button" onClick={captureAndEnrollFace} disabled={faceEnrollLoading} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white font-medium disabled:opacity-50">
                  {faceEnrollLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isAr ? 'التقاط' : isTr ? 'Kaydet' : 'Capture')}
                </button>
              )}
              <button type="button" onClick={closeFaceEnroll} className="py-2.5 px-4 rounded-xl border border-white/20 text-gray-400 hover:text-white">
                {isAr ? 'إلغاء' : isTr ? 'İptal' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Form */}
      <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
        <h3 className="text-white font-medium">{isAr ? 'تغيير كلمة المرور' : isTr ? 'Şifre değiştir' : 'Change password'}</h3>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{isAr ? 'كلمة المرور الحالية' : isTr ? 'Mevcut şifre' : 'Current password'}</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{isAr ? 'كلمة المرور الجديدة' : isTr ? 'Yeni şifre' : 'New password'}</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50" />
        </div>
        <LiquidMetalButton type="submit" disabled={saving} width={180}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {isAr ? 'جارِ التحديث...' : isTr ? 'Güncelleniyor…' : 'Updating…'}</> : (isAr ? 'تحديث كلمة المرور' : isTr ? 'Şifreyi güncelle' : 'Update password')}
        </LiquidMetalButton>
      </form>

      {/* Feature f15: 2FA Section */}
      <div className="space-y-3 max-w-md">
        <h3 className="text-white font-medium">{isAr ? 'المصادقة الثنائية (2FA)' : isTr ? 'İki Aşamalı Doğrulama' : 'Two-Factor Authentication'}</h3>
        <p className="text-sm text-gray-500">{isAr ? 'أضف طبقة إضافية من الأمان إلى حسابك.' : isTr ? 'Hesabınıza ek güvenlik katmanı ekleyin.' : 'Add an extra layer of security to your account.'}</p>
        {user?.totp_enabled ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <Shield className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-violet-400">{isAr ? 'المصادقة الثنائية مفعلة' : isTr ? '2FA Etkin' : '2FA Enabled'}</span>
            </div>
            <button onClick={handle2FADisable} disabled={twoFALoading} className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20 transition">
              {isAr ? 'تعطيل' : isTr ? 'Kapat' : 'Disable'}
            </button>
          </div>
        ) : (
          <>
            <button onClick={handle2FASetup} disabled={twoFALoading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] text-white hover:bg-white/[0.08] border border-white/[0.08] transition">
              {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {isAr ? 'تفعيل المصادقة الثنائية' : isTr ? '2FA Etkinleştir' : 'Enable 2FA'}
            </button>
            {show2FA && twoFAData && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <p className="text-sm text-gray-400">{isAr ? 'استخدم أي تطبيق TOTP (مثل Google Authenticator أو Authy) وأضف هذا المفتاح السري:' : isTr ? 'Google Authenticator, Microsoft Authenticator veya Authy gibi bir uygulamada bu gizli anahtarı ekleyin:' : 'Use any TOTP app (e.g. Google Authenticator, Microsoft Authenticator, or Authy) and add this secret key:'}</p>
                <code className="block p-2 rounded-lg bg-white/[0.05] text-violet-400 text-xs break-all">{twoFAData.secret}</code>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{isAr ? 'رمز التحقق' : isTr ? 'Doğrulama kodu' : 'Verification code'}</label>
                  <div className="flex gap-2">
                    <input type="text" value={twoFACode} onChange={(e) => setTwoFACode(e.target.value)} placeholder="000000" maxLength={6} className="flex-1 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:border-violet-500/50" />
                    <button onClick={handle2FAVerify} disabled={twoFALoading || twoFACode.length < 6} className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium disabled:opacity-50 transition">
                      {isAr ? 'تحقق' : isTr ? 'Doğrula' : 'Verify'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Feature f11: Export my data */}
      <div className="space-y-3 max-w-md">
        <h3 className="text-white font-medium">{isAr ? 'بياناتي' : isTr ? 'Verilerim' : 'My Data'}</h3>
        <p className="text-sm text-gray-500">{isAr ? 'قم بتنزيل ملفك الشخصي وتقييماتك وخطط النظام الغذائي الخاصة بك.' : isTr ? 'Profilinizi, değerlendirmelerinizi ve diyet planlarınızı indirin.' : 'Download your profile, assessments, and diet plans.'}</p>
        <button onClick={handleExportData} disabled={exporting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] text-white hover:bg-white/[0.08] border border-white/[0.08] transition disabled:opacity-50">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {isAr ? 'تنزيل بياناتي' : isTr ? 'Verilerimi İndir' : 'Download My Data'}
        </button>
      </div>

      {/* Message Toast (profile-specific: save success, avatar, etc.) */}
      {message && (
        <div role="status" aria-live={messageType === 'success' ? 'polite' : 'assertive'} aria-atomic="true" className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border animate-pulse
          ${messageType === 'success' ? 'bg-violet-500/20 border-violet-500/30 text-violet-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
          {messageType === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span className="text-sm font-medium">{message}</span>
        </div>
      )}
    </div>
  );
}


