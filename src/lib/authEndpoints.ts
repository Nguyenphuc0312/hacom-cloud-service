// Canonical auth endpoint fragments resolved against AUTH_BASE_URL (/api/v1/auth).
export const AUTH_ENDPOINTS = {
  login: "/login",
  register: "/register",
  activationRequest: "/activation/request",
  activationResend: "/activation/resend",
  activationVerify: "/activation/verify",
  setInitialPassword: "/activation/set-password",
  requestEmailOtpChallenge: "/email-verification/challenges/request",
  confirmEmailOtpChallenge: "/email-verification/challenges/confirm",
  resendEmailOtpChallenge: "/email-verification/challenges/resend",
  logout: "/logout",
  refresh: "/refresh",
  me: "/me",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  changePassword: "/change-password",
  changeRequiredPassword: "/change-required-password",
  qrLoginCreateSession: "/qr-login/sessions",
  qrLoginSessionStatus: (sessionId: string): string =>
    `/qr-login/sessions/${sessionId}/status`,
  qrLoginSessionExchange: (sessionId: string): string =>
    `/qr-login/sessions/${sessionId}/exchange`,
} as const;

export default AUTH_ENDPOINTS;
