import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Wrench } from 'lucide-react';

import ErrorBoundary from './components/ErrorBoundary';
import LoadingFallback from './components/LoadingFallback';
import NotFoundPage from './components/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import VoiceAgent from './components/VoiceAgent';
import UXSettingsModal from './components/UXSettingsModal';
import Preloader from './components/ui/Preloader';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UXSettingsProvider, useUXSettings } from './context/UXSettingsContext';
import { ROUTES } from './config/constants';
import { TourProvider } from './tour/TourContext';
import TourOverlay from './tour/TourOverlay';

function UXSettingsModalGate({ language }) {
  const { uxModalOpen, setUxModalOpen } = useUXSettings();
  return <UXSettingsModal isOpen={uxModalOpen} onClose={() => setUxModalOpen(false)} language={language} />;
}

/**
 * Wrapper that redirects admin users to /admin when they try to access
 * user-only pages (test, chat, diet, dashboard, etc.)
 */
function BlockIfAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.role === 'admin') {
    return <Navigate to={ROUTES.ADMIN} replace />;
  }
  return children;
}

/**
 * Full-page maintenance screen shown to non-admin users when the backend
 * returns 503 (maintenance_mode is enabled in site settings).
 */
function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center relative">
      <div className="fixed inset-0 gradient-mesh pointer-events-none" />
      <div className="fixed inset-0 grid-pattern pointer-events-none" />
      <div className="relative z-10 text-center max-w-lg mx-auto px-6">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
          <Wrench className="w-10 h-10 text-amber-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">{language === 'arabic' ? 'تحت الصيانة' : language === 'turkish' ? 'Bakımda' : 'Under Maintenance'}</h1>
        <p className="text-gray-400 text-lg mb-6">
          {language === 'arabic' ? 'نقوم حالياً بصيانة مجدولة لتحسين تجربتك. يرجى المحاولة مرة أخرى قريباً.' : language === 'turkish' ? 'Deneyiminizi iyileştirmek için planlı bakım yapıyoruz. Lütfen kısa süre sonra tekrar kontrol edin.' : "We're currently performing scheduled maintenance to improve your experience. Please check back shortly."}
        </p>
        <div className="flex items-center justify-center gap-2 text-amber-400/80 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{language === 'arabic' ? 'سيتم استعادة جميع الخدمات قريباً' : language === 'turkish' ? 'Tüm hizmetler yakında geri yüklenecek' : 'All services will be restored soon'}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-3 rounded-xl bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/30 font-medium transition"
        >
          {language === 'arabic' ? 'تحديث الصفحة' : language === 'turkish' ? 'Sayfayı Yenile' : 'Refresh Page'}
        </button>
      </div>
    </div>
  );
}

/**
 * Inner app that has access to AuthContext and can check maintenance mode.
 */
function AppContent({ language, setLanguage }) {
  const { maintenanceMode, isAdmin, user, loading } = useAuth();
  const location = useLocation();
  const hideVoiceAgent = [ROUTES.LOGIN, ROUTES.REGISTER, ROUTES.CHAT, ROUTES.VOICE_CHAT, ROUTES.LOCAL_AI, ROUTES.ADMIN].includes(location.pathname);

  // Show preloader on every fresh login / signup (user transitions null → non-null)
  const prevUserRef = useRef('initial'); // 'initial' = sentinel for first mount
  const [showPreloader, setShowPreloader] = useState(false);
  useEffect(() => {
    if (loading) return;
    const prev = prevUserRef.current;
    prevUserRef.current = user;
    // Only trigger after initial auth resolves AND user just became non-null
    if (prev !== 'initial' && !prev && user) {
      setShowPreloader(true);
    }
  }, [user, loading]);
  const handlePreloaderComplete = () => setShowPreloader(false);

  // If maintenance mode is on and user is NOT admin, show maintenance page
  // but still allow the /login route so an admin can sign in.
  if (maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen noise" style={{ background: '#050508', color: 'white' }}>
        {!location.pathname.startsWith('/admin') && (
          <Suspense fallback={null}>
            <SideNav language={language} setLanguage={setLanguage} />
          </Suspense>
        )}
        <main className="relative">
          <div className="relative z-10">
            <Suspense fallback={<LoadingFallback language={language} />}>
              <Routes>
                <Route path={ROUTES.LOGIN} element={<Login language={language} />} />
                <Route path="/shared/:token" element={<SharedAssessment language={language} />} />
                <Route path="*" element={<MaintenancePage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen noise" dir={language === 'arabic' ? 'rtl' : 'ltr'} style={{ background: '#050508', color: 'white', fontFamily: language === 'arabic' ? "'Tajawal','Figtree','Inter',sans-serif" : "'Figtree','Inter',sans-serif" }}>
      {showPreloader && <Preloader onComplete={handlePreloaderComplete} />}
      {!location.pathname.startsWith('/admin') && (
        <Suspense fallback={null}>
          <SideNav language={language} setLanguage={setLanguage} />
        </Suspense>
      )}

      <main className="relative">
        <Suspense fallback={<LoadingFallback language={language} />}>
          <ErrorBoundary language={language}>
            <Routes>
              <Route path={ROUTES.HOME} element={<Home language={language} setLanguage={setLanguage} />} />
              <Route path={ROUTES.LOGIN} element={<Login language={language} />} />
              <Route path={ROUTES.REGISTER} element={<Register language={language} />} />
              <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword language={language} />} />
              <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword language={language} />} />

              {/* User-only pages: admin gets redirected to /admin */}
              <Route path={ROUTES.TEST} element={<BlockIfAdmin><DiabetesTest language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.HEART_TEST} element={<BlockIfAdmin><HeartTest language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.CHAT} element={<BlockIfAdmin><ChatBot language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.VOICE_CHAT} element={<BlockIfAdmin><VoiceChat language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.DIET_PLAN} element={<BlockIfAdmin><DietPlan language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.SYMPTOM_CHECKER} element={<BlockIfAdmin><SymptomChecker language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.HOSPITALS} element={<BlockIfAdmin><FindHospitals language={language} /></BlockIfAdmin>} />
              <Route path={`${ROUTES.DASHBOARD_ASSESSMENT}/:id`} element={<BlockIfAdmin><ProtectedRoute><AssessmentReportPage language={language} /></ProtectedRoute></BlockIfAdmin>} />
              <Route path={`${ROUTES.DASHBOARD_HEART_ASSESSMENT}/:id`} element={<BlockIfAdmin><ProtectedRoute><HeartReportPage language={language} /></ProtectedRoute></BlockIfAdmin>} />
              <Route path={`${ROUTES.DASHBOARD_CKD_ASSESSMENT}/:id`} element={<BlockIfAdmin><ProtectedRoute><CKDReportPage language={language} /></ProtectedRoute></BlockIfAdmin>} />
              <Route path={`${ROUTES.DASHBOARD_DIET_PLAN}/:id`} element={<BlockIfAdmin><ProtectedRoute><DietPlanReportPage language={language} /></ProtectedRoute></BlockIfAdmin>} />
              <Route path={ROUTES.DASHBOARD} element={<BlockIfAdmin><ProtectedRoute><Dashboard language={language} /></ProtectedRoute></BlockIfAdmin>} />

              {/* Admin-only pages */}
              <Route path={ROUTES.STUDIO} element={<ProtectedRoute requireAdmin><MicroInteractionStudio language={language} /></ProtectedRoute>} />
              <Route path={`${ROUTES.ADMIN}/*`} element={<ProtectedRoute requireAdmin><AdminPanel language={language} /></ProtectedRoute>} />

              {/* Verify signed report (public) */}
              <Route path={ROUTES.VERIFY} element={<VerifyReport language={language} />} />
              <Route path={ROUTES.MEAL_PHOTO} element={<BlockIfAdmin><MealPhotoAnalyzer language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.SPORT} element={<BlockIfAdmin><WorkoutVideos language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.LOCAL_AI} element={<BlockIfAdmin><LocalAI language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.PRICING} element={<Pricing language={language} />} />
              <Route path={ROUTES.BRAIN_MRI} element={<BlockIfAdmin><BrainMRI language={language} /></BlockIfAdmin>} />
              <Route path={ROUTES.CKD_TEST} element={<BlockIfAdmin><CKDTest language={language} /></BlockIfAdmin>} />

              {/* Public shared assessment views */}
              <Route path="/shared/heart/:token" element={<SharedHeart language={language} />} />
              <Route path="/shared/ckd/:token" element={<SharedCKD language={language} />} />
              <Route path="/shared/:token" element={<SharedAssessment language={language} />} />

              <Route path="*" element={<NotFoundPage language={language} />} />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </main>

      {!hideVoiceAgent && (
        <ErrorBoundary language={language}>
          <VoiceAgent language={language} />
        </ErrorBoundary>
      )}
    </div>
  );
}

const SideNav = lazy(() => import('./components/SideNav'));
const Home = lazy(() => import('./pages/Home'));
const DiabetesTest = lazy(() => import('./pages/DiabetesTest'));
const HeartTest = lazy(() => import('./pages/HeartTest'));
const ChatBot = lazy(() => import('./pages/ChatBot'));
const VoiceChat = lazy(() => import('./pages/VoiceChat'));
const DietPlan = lazy(() => import('./pages/DietPlan'));
const SymptomChecker = lazy(() => import('./pages/SymptomChecker'));
const FindHospitals = lazy(() => import('./pages/FindHospitals'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AssessmentReportPage = lazy(() => import('./pages/AssessmentReportPage'));
const HeartReportPage = lazy(() => import('./pages/HeartReportPage'));
const CKDReportPage = lazy(() => import('./pages/CKDReportPage'));
const DietPlanReportPage = lazy(() => import('./pages/DietPlanReportPage'));
const SharedHeart = lazy(() => import('./pages/SharedHeart'));
const SharedCKD = lazy(() => import('./pages/SharedCKD'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const MicroInteractionStudio = lazy(() => import('./pages/MicroInteractionStudio'));
const SharedAssessment = lazy(() => import('./pages/SharedAssessment'));
const VerifyReport = lazy(() => import('./pages/VerifyReport'));
const MealPhotoAnalyzer = lazy(() => import('./pages/MealPhotoAnalyzer'));
const WorkoutVideos = lazy(() => import('./pages/WorkoutVideos'));
const LocalAI = lazy(() => import('./pages/LocalAI'));
const Pricing = lazy(() => import('./pages/Pricing'));
const BrainMRI = lazy(() => import('./pages/BrainMRI'));
const CKDTest = lazy(() => import('./pages/CKDTest'));

function App() {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('appLanguage') || 'english';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
    const titles = { arabic: 'Bonus Life AI - الوقاية من السكري', turkish: 'Bonus Life AI - Diyabet Önleme', english: 'Bonus Life AI - Diabetes Prevention' };
    document.title = titles[language] || titles.english;
    document.documentElement.dir = language === 'arabic' ? 'rtl' : 'ltr';
    document.documentElement.lang = language === 'arabic' ? 'ar' : language === 'turkish' ? 'tr' : 'en';
  }, [language]);

  return (
    <ErrorBoundary language={language}>
      <UXSettingsProvider>
        <Router>
          <TourProvider>
            <AuthProvider>
              <AppContent language={language} setLanguage={setLanguage} />
            </AuthProvider>
            <TourOverlay language={language} />
          </TourProvider>
        </Router>
        <UXSettingsModalGate language={language} />
      </UXSettingsProvider>
    </ErrorBoundary>
  );
}

export default React.memo(App);
