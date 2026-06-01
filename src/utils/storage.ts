/**
 * Storage utilities for admin panel auth
 * Handles both sessionStorage and localStorage based on rememberMe preference
 */

const REMEMBER_ME_KEY = 'chat-admin-remember-me';

/**
 * Get the remember me preference from storage
 * Default is false (session-only)
 */
export const getRememberMePreference = (): boolean => {
  if (typeof window === 'undefined') return false;

  const stored = localStorage.getItem(REMEMBER_ME_KEY);
  if (stored === null) return false;

  try {
    return JSON.parse(stored) === true;
  } catch {
    return false;
  }
};

/**
 * Save the remember me preference
 */
export const setRememberMePreference = (remember: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify(remember));
};

/**
 * Clear the remember me preference
 */
export const clearRememberMePreference = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REMEMBER_ME_KEY);
};

/**
 * Determine which storage to use based on remember me preference
 */
export const getAuthStorage = (
  rememberMe: boolean,
): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void } => {
  const storage = rememberMe ? localStorage : sessionStorage;
  return {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => storage.setItem(key, value),
    removeItem: (key: string) => storage.removeItem(key),
  };
};

/**
 * Check if user has a valid session (either persistent or session)
 */
export const hasValidSession = (): boolean => {
  const localSession = localStorage.getItem('chat-admin-auth');
  const sessionSession = sessionStorage.getItem('chat-admin-session-v2');
  return !!(localSession || sessionSession);
};

/**
 * Clear all auth-related storage
 */
export const clearAllAuthStorage = (): void => {
  localStorage.removeItem('chat-admin-auth');
  localStorage.removeItem('chat-admin-session-v2');
  localStorage.removeItem('chat-admin-remember-me');
  sessionStorage.removeItem('chat-admin-auth');
  sessionStorage.removeItem('chat-admin-session-v2');
};
