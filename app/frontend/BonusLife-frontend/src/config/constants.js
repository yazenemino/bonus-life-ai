// Bonus Life AI - Central Configuration
// Authors: Muhammed Jalahej, Yazen Emino

// API Base URL. Dev: '' so the Vite proxy forwards /api to the local backend.
// Production: must come from VITE_API_URL (set in Vercel project settings) — pointed at the
// Railway backend's public HTTPS URL. Never fall back to localhost here: that would silently
// point a real visitor's browser at their own machine instead of surfacing the misconfiguration.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Full URL for avatar image (handles relative paths from backend /avatars). */
export function getAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:')) return avatarUrl;
  const base = API_BASE_URL.replace(/\/$/, '');
  return base + (avatarUrl.startsWith('/') ? avatarUrl : '/' + avatarUrl);
}

// Application info
export const APP_NAME = 'Bonus Life AI';
export const APP_DESCRIPTION = 'Type 2 Diabetes Early Detection Platform';

// Route paths (single source of truth for navigation)
export const ROUTES = {
  HOME: '/',
  TEST: '/test',
  HEART_TEST: '/heart-test',
  CHAT: '/chat',
  VOICE_CHAT: '/voice-chat',
  DIET_PLAN: '/diet-plan',
  SYMPTOM_CHECKER: '/symptom-checker',
  HOSPITALS: '/hospitals',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DASHBOARD: '/dashboard',
  DASHBOARD_ASSESSMENT: '/dashboard/assessment',
  DASHBOARD_HEART_ASSESSMENT: '/dashboard/heart-assessment',
  DASHBOARD_CKD_ASSESSMENT: '/dashboard/ckd-assessment',
  DASHBOARD_DIET_PLAN: '/dashboard/diet-plan',
  ADMIN: '/admin',
  STUDIO: '/studio',
  VERIFY: '/verify',
  MEAL_PHOTO: '/meal-photo',
  SPORT: '/sport',
  LOCAL_AI: '/local-ai',
  LOCAL_AI_TIP: '/local-ai?section=tip',
  LOCAL_AI_SCENARIO: '/local-ai?section=scenario',
  PRICING: '/pricing',
  BRAIN_MRI: '/brain-mri',
  CKD_TEST: '/ckd-test',
};
