/**
 * Centralized route paths to keep navigation and route config consistent.
 */
export const ROUTE_PATHS = {
  ROOT: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  CHAT: "/chat",
  CHAT_DETAIL: "/chat/:conversationId?",
  SETTINGS: "/settings",
} as const;
