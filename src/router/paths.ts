/**
 * Centralized route paths to keep navigation and route config consistent.
 */
export const ROUTE_PATHS = {
  ROOT: "/",
  LOGIN: "/login",
  ACTIVATION: "/activation",
  VERIFY_EMAIL: "/verify-email",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  FORCE_CHANGE_PASSWORD: "/force-change-password",
  CHAT: "/chat",
  CHAT_DETAIL: "/chat/:conversationId?",
  FRIENDS: "/friends",
  FRIEND_DISCOVERY: "/friend-discovery/:shareCode",
  JOIN_BY_TOKEN: "/join/:token",
  SETTINGS: "/settings",
  MAINTENANCE: "/maintenance",
  TASKS: "/tasks",
  CALENDAR: "/calendar",
  ARCHIVE: "/archive",
  NOTIFICATIONS: "/notifications",
  HELP: "/help",
} as const;
