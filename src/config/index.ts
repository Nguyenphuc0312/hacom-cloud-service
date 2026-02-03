/**
 * @fileoverview Cấu hình ứng dụng
 * Quản lý tất cả các biến môi trường và cấu hình
 */

// API Base URLs
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

export const WEBSOCKET_URL =
  import.meta.env.VITE_WEBSOCKET_URL || "ws://localhost:8080";

// Authentication
export const AUTH_CONFIG = {
  // Token refresh threshold (in ms) - refresh 1 minute before expiry
  TOKEN_REFRESH_THRESHOLD: 60 * 1000,
  // Remember me expiry (in days)
  REMEMBER_ME_DAYS: 30,
  // Session storage keys
  ACCESS_TOKEN_KEY: "accessToken",
  REFRESH_TOKEN_KEY: "refreshToken",
  USER_KEY: "user",
  REMEMBER_ME_KEY: "rememberMe",
};

// Pagination
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MESSAGES_PAGE_SIZE: 50,
};

// File Upload
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_FILE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
  ],
};

// WebSocket
export const WEBSOCKET_CONFIG = {
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 1000, // Base delay in ms
  RECONNECT_DELAY_MAX: 30000, // Max delay in ms
  PING_INTERVAL: 30000, // 30 seconds
  PONG_TIMEOUT: 5000, // 5 seconds
};

// UI
export const UI_CONFIG = {
  DEBOUNCE_DELAY: 300, // Search debounce
  TYPING_TIMEOUT: 3000, // Typing indicator timeout
  TOAST_DURATION: 3000, // Toast notification duration
  ANIMATION_DURATION: 200, // Default animation duration
};

// Validation
export const VALIDATION_CONFIG = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  BIO_MAX_LENGTH: 500,
  MESSAGE_MAX_LENGTH: 4000,
};
