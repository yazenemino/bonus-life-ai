import { API_BASE_URL } from '../config/constants';

const AUTH_TOKEN_KEY = 'morelife_token';

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Maintenance-mode callback — AuthContext registers a listener
let _maintenanceCb = null;
export function onMaintenanceMode(cb) {
  _maintenanceCb = cb;
}

const REQUEST_TIMEOUT_MS = 15000;
/** Local AI (Ollama) can take 30–60s to generate; use longer timeout for /api/v1/local-ai */
const LOCAL_AI_TIMEOUT_MS = 60000;

async function apiRequest(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const timeoutMs = options.timeoutMs ?? (endpoint.startsWith('/api/v1/local-ai') ? LOCAL_AI_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const { timeoutMs: _skip, ...fetchOptions } = options;
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      ...fetchOptions,
    });
    clearTimeout(timeoutId);

    if (response.status === 503) {
      // Don't treat symptom-checker or local-ai 503 as platform maintenance
      const isLocalAIUnavailable = endpoint.startsWith('/api/v1/local-ai');
      const isSymptomCheckerUnavailable = endpoint.includes('symptom-checker');
      if (!isLocalAIUnavailable && !isSymptomCheckerUnavailable && _maintenanceCb) _maintenanceCb();
      let message = 'HTTP 503: Platform is under maintenance';
      if (isLocalAIUnavailable) message = 'Service unavailable run llama3.2:3b';
      else if (isSymptomCheckerUnavailable) {
        try {
          const body = await response.json();
          message = (body && typeof body.detail === 'string') ? body.detail : 'Symptom checker is temporarily unavailable. Please try again.';
        } catch (_) {
          message = 'Symptom checker is temporarily unavailable. Please try again.';
        }
      }
      throw new Error(message);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let message = `HTTP ${response.status}: ${errorText}`;
      try {
        const body = JSON.parse(errorText);
        if (body && typeof body.detail === 'string') message = body.detail;
      } catch (_) {}
      throw new Error(message);
    }

    const data = await response.json();
    console.log(`API Response from ${endpoint}:`, data);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const isLocalAI = endpoint.startsWith('/api/v1/local-ai');
      const msg = isLocalAI
        ? 'Local AI is taking too long. Ollama may be slow; try again or use a smaller model.'
        : 'Request timed out. Is the backend running at ' + (API_BASE_URL || 'the server') + '?';
      const timeoutError = new Error(msg);
      console.error(`API request failed for ${endpoint}:`, timeoutError);
      throw timeoutError;
    }
    // "Failed to fetch" = network error (backend not running, wrong port, or CORS)
    if (error.message === 'Failed to fetch' || (error.name === 'TypeError' && error.message && error.message.includes('fetch'))) {
      const friendly = new Error(
        import.meta.env.DEV
          ? 'Cannot reach the server. Make sure the backend is running on port 8001.'
          : 'Cannot reach the server. Please try again in a moment.'
      );
      console.error(`API request failed for ${endpoint} (base: ${API_BASE_URL || '(same-origin)'}):`, error);
      throw friendly;
    }
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

// CORRECTED ENDPOINTS - Match your backend
export async function predictDiabetesRisk(formData) {
  return apiRequest('/api/v1/diabetes-assessment', {
    method: 'POST',
    body: JSON.stringify(formData),
  });
}

export async function runHeartAssessment(formData) {
  return apiRequest('/api/v1/heart-assessment', {
    method: 'POST',
    body: JSON.stringify(formData),
  });
}

export async function runCKDAssessment(formData) {
  return apiRequest('/api/v1/ckd-assessment', {
    method: 'POST',
    body: JSON.stringify(formData),
  });
}

export async function chatWithAI(message, language = 'english', conversation_id = null) {
  return apiRequest('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ 
      message, 
      language,
      conversation_id,
      require_llm: true 
    }),
  });
}

export async function voiceChat(text, language = 'english', userId = 'voice-user', isVoice = true) {
  return apiRequest('/api/v1/voice-chat/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text: String(text),
      language: String(language),
      user_id: String(userId),
      is_voice: isVoice ? '1' : '0',
    }).toString(),
  });
}

export async function generateDietPlan(userData, language = 'english') {
  return apiRequest('/api/v1/diet-plan/generate', {
    method: 'POST',
    body: JSON.stringify({ ...userData, language }),
  });
}

/** ML symptom checker: 8 inputs -> top-3 condition groups with probabilities */
export async function symptomCheckerPredict(payload) {
  return apiRequest('/api/v1/symptom-checker/predict', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getChatTopics() {
  return apiRequest('/api/v1/health-topics');
}

export async function getWorkoutVideos(goal = 'beginner', refreshKey = null) {
  const params = new URLSearchParams({ goal: goal.trim().toLowerCase().replace(/\s+/g, '_') });
  if (refreshKey != null && refreshKey !== '') params.set('refresh_key', String(refreshKey));
  return apiRequest(`/api/v1/workout-videos?${params}`);
}

export async function clearChatHistory() {
  return apiRequest('/api/v1/chat/clear', {
    method: 'POST',
  });
}

export async function healthCheck() {
  return apiRequest('/health');
}

/** Check maintenance and signup status (public endpoint, no auth). Returns { maintenance, allow_signups }. */
export async function checkMaintenanceStatus() {
  try {
    const url = `${API_BASE_URL}/api/v1/auth/maintenance-status`;
    const response = await fetch(url);
    if (!response.ok) return { maintenance: false, allow_signups: true };
    const data = await response.json();
    return {
      maintenance: !!data.maintenance,
      allow_signups: data.allow_signups !== false && data.allow_signups !== 'false',
    };
  } catch {
    return { maintenance: false, allow_signups: true };
  }
}

// Auth
export async function login(email, password) {
  return apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email, password, full_name = '') {
  return apiRequest('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name }),
  });
}

export async function fetchMe() {
  return apiRequest('/api/v1/auth/me');
}

export async function forgotPassword(email) {
  return apiRequest('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function resetPassword(token, new_password) {
  return apiRequest('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password }),
  });
}

// ---- Passkey (WebAuthn) ----
export async function webauthnRegisterOptions() {
  return apiRequest('/api/v1/webauthn/register/options');
}

export async function webauthnRegisterComplete(stateKey, credential) {
  return apiRequest('/api/v1/webauthn/register/complete', {
    method: 'POST',
    body: JSON.stringify({ state_key: stateKey, credential }),
  });
}

export async function webauthnLoginOptions() {
  return apiRequest('/api/v1/webauthn/login/options');
}

export async function webauthnLoginComplete(stateKey, credential) {
  return apiRequest('/api/v1/webauthn/login/complete', {
    method: 'POST',
    body: JSON.stringify({ state_key: stateKey, credential }),
  });
}

export async function webauthnStatus() {
  return apiRequest('/api/v1/webauthn/status');
}

// ---- Face login ----
export async function faceEnroll(embedding) {
  return apiRequest('/api/v1/face-auth/enroll', {
    method: 'POST',
    body: JSON.stringify({ embedding }),
  });
}

export async function faceVerify(embedding) {
  return apiRequest('/api/v1/face-auth/verify', {
    method: 'POST',
    body: JSON.stringify({ embedding }),
  });
}

export async function faceStatus() {
  return apiRequest('/api/v1/face-auth/status');
}

export async function faceToggleEnabled(enabled) {
  return apiRequest('/api/v1/face-auth/settings', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function faceRemoveEnrollment() {
  return apiRequest('/api/v1/face-auth/enroll', { method: 'DELETE' });
}

// User-scoped
export async function getMyAssessments(limit = 50) {
  return apiRequest(`/api/v1/users/me/assessments?limit=${limit}`);
}

export async function getMyDietPlans(limit = 50) {
  return apiRequest(`/api/v1/users/me/diet-plans?limit=${limit}`);
}

export async function updateProfile(data) {
  return apiRequest('/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Subscription (Stripe): no feature gating; Pro = early access to new features
export async function getMySubscription() {
  return apiRequest('/api/v1/users/me/subscription');
}

/** plan: "pro_monthly" | "pro_yearly". Returns { url }. Redirect user to url for Stripe Checkout. */
export async function createCheckout(plan) {
  return apiRequest('/api/v1/users/me/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

/** Confirm subscription after Stripe redirect. session_id from URL (e.g. cs_xxx). Returns updated subscription. */
export async function confirmSubscription(sessionId) {
  return apiRequest('/api/v1/users/me/subscription/confirm', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** Sync subscription from Stripe (use if you paid but still show Free). Returns updated subscription. */
export async function syncSubscription() {
  return apiRequest('/api/v1/users/me/subscription/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Returns { url }. Redirect user to url for Stripe Customer Portal (manage/cancel). */
export async function createPortalSession() {
  return apiRequest('/api/v1/users/me/customer-portal', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Upload profile picture from file. Returns { avatar_url }. Backend also updates user.avatar_url. */
export async function uploadAvatar(file) {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('file', file);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${API_BASE_URL}/api/v1/users/me/avatar`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

export async function changePassword(current_password, new_password) {
  return apiRequest('/api/v1/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  });
}

// Admin
export async function adminGetUserProfile(userId) {
  return apiRequest(`/api/v1/admin/users/${userId}/profile`);
}

export async function adminResetUserPassword(userId, newPassword) {
  return apiRequest(`/api/v1/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function adminGetUsers(skip = 0, limit = 100) {
  return apiRequest(`/api/v1/admin/users?skip=${skip}&limit=${limit}`);
}

export async function adminGetStats() {
  return apiRequest('/api/v1/admin/stats');
}

export async function adminGetAssessments(skip = 0, limit = 100) {
  return apiRequest(`/api/v1/admin/assessments?skip=${skip}&limit=${limit}`);
}

export async function adminDeleteAssessment(id) {
  return apiRequest(`/api/v1/admin/assessments/${id}`, { method: 'DELETE' });
}

export async function adminClearAssessments() {
  return apiRequest('/api/v1/admin/assessments', { method: 'DELETE' });
}

export async function adminDeleteCKDAssessment(id) {
  return apiRequest(`/api/v1/admin/ckd-assessments/${id}`, { method: 'DELETE' });
}

export async function adminClearCKDAssessments() {
  return apiRequest('/api/v1/admin/ckd-assessments', { method: 'DELETE' });
}

export async function adminDeleteHeartAssessment(id) {
  return apiRequest(`/api/v1/admin/heart-assessments/${id}`, { method: 'DELETE' });
}
export async function adminClearHeartAssessments() {
  return apiRequest('/api/v1/admin/heart-assessments', { method: 'DELETE' });
}

export async function adminDeleteBrainMRI(id) {
  return apiRequest(`/api/v1/admin/brain-mri-analyses/${id}`, { method: 'DELETE' });
}
export async function adminClearBrainMRI() {
  return apiRequest('/api/v1/admin/brain-mri-analyses', { method: 'DELETE' });
}

export async function adminDeleteDietPlan(id) {
  return apiRequest(`/api/v1/admin/diet-plans/${id}`, { method: 'DELETE' });
}
export async function adminClearDietPlans() {
  return apiRequest('/api/v1/admin/diet-plans', { method: 'DELETE' });
}

export async function adminDeleteUser(userId) {
  return apiRequest(`/api/v1/admin/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function adminUpdateUser(userId, data) {
  return apiRequest(`/api/v1/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminCreateUser(data) {
  return apiRequest('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminBulkAction(user_ids, action) {
  return apiRequest('/api/v1/admin/users/bulk', {
    method: 'POST',
    body: JSON.stringify({ user_ids, action }),
  });
}

export async function adminGetChartData(days = 30) {
  return apiRequest(`/api/v1/admin/stats/charts?days=${days}`);
}

export async function adminGetAuditLog(skip = 0, limit = 100) {
  return apiRequest(`/api/v1/admin/audit-log?skip=${skip}&limit=${limit}`);
}

export async function adminClearAuditLog() {
  return apiRequest('/api/v1/admin/audit-log/clear', { method: 'POST' });
}

export async function adminGetAnnouncements() {
  return apiRequest('/api/v1/admin/announcements');
}

export async function adminCreateAnnouncement(data) {
  return apiRequest('/api/v1/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminUpdateAnnouncement(id, data) {
  return apiRequest(`/api/v1/admin/announcements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function adminDeleteAnnouncement(id) {
  return apiRequest(`/api/v1/admin/announcements/${id}`, {
    method: 'DELETE',
  });
}

export async function adminGetSettings() {
  return apiRequest('/api/v1/admin/settings');
}

export async function adminUpdateSetting(key, value) {
  return apiRequest('/api/v1/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ key, value }),
  });
}

export async function adminGetSystemHealth() {
  return apiRequest('/api/v1/admin/system-health');
}

export async function adminGetSubscriptionStats() {
  return apiRequest('/api/v1/admin/subscriptions/stats');
}

export async function adminGetSubscriptions(params = {}) {
  const { status, tier, skip = 0, limit = 500 } = params;
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (tier) q.set('tier', tier);
  q.set('skip', String(skip));
  q.set('limit', String(limit));
  return apiRequest(`/api/v1/admin/subscriptions?${q.toString()}`);
}

export async function getActiveAnnouncements() {
  return apiRequest('/api/v1/announcements/active');
}

// ---- Export my data (feature f11) ----
export async function exportMyData() {
  return apiRequest('/api/v1/users/me/export');
}

// ---- Share assessment with doctor (feature f16) ----
export async function signAssessmentReport(assessmentId) {
  return apiRequest(`/api/v1/reports/sign-assessment/${assessmentId}`, { method: 'POST' });
}

export async function verifyReportSignature(payload_hash, signature_b64) {
  return apiRequest('/api/v1/reports/verify', {
    method: 'POST',
    body: JSON.stringify({ payload_hash, signature_b64 }),
  });
}

export async function getReportPublicKey() {
  return apiRequest('/api/v1/reports/public-key');
}

export async function shareAssessment(assessmentId) {
  return apiRequest(`/api/v1/users/me/assessments/${assessmentId}/share`, { method: 'POST' });
}

export async function revokeShare(assessmentId) {
  return apiRequest(`/api/v1/users/me/assessments/${assessmentId}/share`, { method: 'DELETE' });
}

export async function deleteAssessment(assessmentId) {
  return apiRequest(`/api/v1/users/me/assessments/${assessmentId}`, { method: 'DELETE' });
}

export async function deleteDietPlan(dietPlanId) {
  return apiRequest(`/api/v1/users/me/diet-plans/${dietPlanId}`, { method: 'DELETE' });
}

export async function getSharedAssessment(token) {
  return apiRequest(`/api/v1/shared/assessment/${token}`);
}

// ---- Heart assessments (mirror diabetes: list, share, delete, sign) ----
export async function getMyHeartAssessments(limit = 50) {
  return apiRequest(`/api/v1/users/me/heart-assessments?limit=${limit}`);
}

export async function shareHeartAssessment(heartAssessmentId) {
  return apiRequest(`/api/v1/users/me/heart-assessments/${heartAssessmentId}/share`, { method: 'POST' });
}

export async function revokeHeartShare(heartAssessmentId) {
  return apiRequest(`/api/v1/users/me/heart-assessments/${heartAssessmentId}/share`, { method: 'DELETE' });
}

export async function deleteHeartAssessment(heartAssessmentId) {
  return apiRequest(`/api/v1/users/me/heart-assessments/${heartAssessmentId}`, { method: 'DELETE' });
}

export async function signHeartAssessmentReport(heartAssessmentId) {
  return apiRequest(`/api/v1/reports/sign-heart-assessment/${heartAssessmentId}`, { method: 'POST' });
}

export async function getSharedHeartAssessment(token) {
  return apiRequest(`/api/v1/shared/heart/${token}`);
}

export async function getSharedCKDAssessment(token) {
  return apiRequest(`/api/v1/shared/ckd/${token}`);
}

// ---- CKD assessments (mirror heart/diabetes: list, share, delete, sign) ----
export async function getMyCKDAssessments(limit = 50) {
  return apiRequest(`/api/v1/users/me/ckd-assessments?limit=${limit}`);
}

export async function shareCKDAssessment(ckdAssessmentId) {
  return apiRequest(`/api/v1/users/me/ckd-assessments/${ckdAssessmentId}/share`, { method: 'POST' });
}

export async function revokeCKDShare(ckdAssessmentId) {
  return apiRequest(`/api/v1/users/me/ckd-assessments/${ckdAssessmentId}/share`, { method: 'DELETE' });
}

export async function deleteCKDAssessment(ckdAssessmentId) {
  return apiRequest(`/api/v1/users/me/ckd-assessments/${ckdAssessmentId}`, { method: 'DELETE' });
}

export async function signCKDAssessmentReport(ckdAssessmentId) {
  return apiRequest(`/api/v1/reports/sign-ckd-assessment/${ckdAssessmentId}`, { method: 'POST' });
}

export async function signMriAssessmentReport(mriAssessmentId) {
  return apiRequest(`/api/v1/reports/sign-mri-assessment/${mriAssessmentId}`, { method: 'POST' });
}

export async function adminGetCKDAssessments(skip = 0, limit = 500) {
  return apiRequest(`/api/v1/admin/ckd-assessments?skip=${skip}&limit=${limit}`);
}

export async function adminGetHeartAssessments(skip = 0, limit = 500) {
  return apiRequest(`/api/v1/admin/heart-assessments?skip=${skip}&limit=${limit}`);
}

export async function adminGetBrainMRIAnalyses(skip = 0, limit = 500) {
  return apiRequest(`/api/v1/admin/brain-mri-analyses?skip=${skip}&limit=${limit}`);
}

export async function adminGetDietPlans(skip = 0, limit = 500) {
  return apiRequest(`/api/v1/admin/diet-plans?skip=${skip}&limit=${limit}`);
}

// ---- Brain MRI imaging history ----
export async function getMyBrainMriAnalyses(limit = 50) {
  return apiRequest(`/api/v1/users/me/brain-mri-analyses?limit=${limit}`);
}

export async function deleteBrainMriAnalysis(id) {
  return apiRequest(`/api/v1/users/me/brain-mri-analyses/${id}`, { method: 'DELETE' });
}

// ---- 2FA (feature f15) ----
export async function setup2FA() {
  return apiRequest('/api/v1/users/me/2fa/setup', { method: 'POST' });
}

export async function verify2FA(code) {
  return apiRequest(`/api/v1/users/me/2fa/verify?code=${encodeURIComponent(code)}`, { method: 'POST' });
}

export async function disable2FA() {
  return apiRequest('/api/v1/users/me/2fa/disable', { method: 'POST' });
}

// ---- Notifications (feature f17) ----
export async function getNotifications(limit = 50) {
  return apiRequest(`/api/v1/users/me/notifications?limit=${limit}`);
}

export async function markNotificationRead(notifId) {
  return apiRequest(`/api/v1/users/me/notifications/${notifId}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return apiRequest('/api/v1/users/me/notifications/read-all', { method: 'POST' });
}

export async function deleteNotification(notifId) {
  return apiRequest(`/api/v1/users/me/notifications/${notifId}`, { method: 'DELETE' });
}

export async function createReminder(title, message = '') {
  return apiRequest('/api/v1/users/me/notifications/reminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message }),
  });
}

// ---- Admin: user notes (feature f12) ----
export async function adminUpdateUserNotes(userId, admin_notes) {
  return apiRequest(`/api/v1/admin/users/${userId}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ admin_notes }),
  });
}

// ---- Admin: send email (feature f13) ----
export async function adminSendEmail(userId, subject, body) {
  return apiRequest(`/api/v1/admin/users/${userId}/email`, {
    method: 'POST',
    body: JSON.stringify({ subject, body }),
  });
}

// ---- Admin: bulk email (feature f14) ----
export async function adminBulkEmail(subject, body, user_ids = null, role_filter = null) {
  return apiRequest('/api/v1/admin/users/bulk-email', {
    method: 'POST',
    body: JSON.stringify({ subject, body, user_ids, role_filter }),
  });
}

// ---- Meal Photo Analyzer ----
export async function analyzeMealPhoto(imageBase64, saveToLog = false, language = 'english') {
  return apiRequest('/api/v1/meal-photo/analyze', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64, save_to_log: saveToLog, language }),
  });
}

export async function getMealLog(limit = 50) {
  return apiRequest(`/api/v1/meal-photo/log?limit=${limit}`);
}

export async function clearMealLog() {
  return apiRequest('/api/v1/meal-photo/log/clear', { method: 'POST', body: '{}' });
}

// Local AI (one module, no external API)
export async function localAIGetHealthTip(language = 'english') {
  return apiRequest(`/api/v1/local-ai/health-tip?language=${encodeURIComponent(language)}`);
}
export async function localAIAnswerScenario(scenario, assessment = null, language = 'english') {
  return apiRequest(`/api/v1/local-ai/scenario?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    body: JSON.stringify({ scenario, assessment }),
  });
}

const apiService = {
  predictDiabetesRisk,
  runCKDAssessment,
  chatWithAI,
  voiceChat,
  generateDietPlan,
  symptomCheckerPredict,
  getChatTopics,
  clearChatHistory,
  healthCheck,
  login,
  register,
  fetchMe,
  forgotPassword,
  resetPassword,
  getMyAssessments,
  getMyHeartAssessments,
  getMyDietPlans,
  updateProfile,
  getMySubscription,
  createCheckout,
  confirmSubscription,
  syncSubscription,
  createPortalSession,
  uploadAvatar,
  changePassword,
  adminGetUsers,
  adminGetStats,
  adminGetAssessments,
  adminDeleteUser,
  adminUpdateUser,
  adminCreateUser,
  adminBulkAction,
  adminGetChartData,
  adminGetAuditLog,
  adminClearAuditLog,
  adminGetAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  adminGetSettings,
  adminUpdateSetting,
  adminGetSystemHealth,
  adminGetSubscriptionStats,
  adminGetSubscriptions,
  getActiveAnnouncements,
  checkMaintenanceStatus,
  exportMyData,
  signAssessmentReport,
  verifyReportSignature,
  getReportPublicKey,
  shareAssessment,
  revokeShare,
  deleteAssessment,
  shareHeartAssessment,
  revokeHeartShare,
  deleteHeartAssessment,
  signHeartAssessmentReport,
  getSharedHeartAssessment,
  getSharedCKDAssessment,
  deleteDietPlan,
  getSharedAssessment,
  setup2FA,
  verify2FA,
  disable2FA,
  adminUpdateUserNotes,
  adminSendEmail,
  adminBulkEmail,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  analyzeMealPhoto,
  getMealLog,
  // History Brain MRI
  getMyBrainMriAnalyses,
  deleteBrainMriAnalysis,
  // CKD assessments
  getMyCKDAssessments,
  shareCKDAssessment,
  revokeCKDShare,
  deleteCKDAssessment,
  signCKDAssessmentReport,
  signMriAssessmentReport,
  adminGetCKDAssessments,
};

export default apiService;