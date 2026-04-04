export const AUTH_ENDPOINTS = {
  login: "/login",
  register: "/register",
  requestEmailVerification: "/request-email-verification",
  verifyEmail: "/verify-email",
  logout: "/logout",
  refresh: "/refresh",
  me: "/me",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  changePassword: "/change-password",
  qrLoginCreateSession: "/qr-login/sessions",
  qrLoginSessionStatus: (sessionId: string): string =>
    `/qr-login/sessions/${sessionId}/status`,
  qrLoginSessionExchange: (sessionId: string): string =>
    `/qr-login/sessions/${sessionId}/exchange`,
} as const;

export default AUTH_ENDPOINTS;
