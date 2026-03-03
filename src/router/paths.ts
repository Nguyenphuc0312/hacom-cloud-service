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
  FRIENDS: "/friends",
  JOIN_BY_TOKEN: "/join/:token",
  SETTINGS: "/settings",
} as const;
