import { create } from 'zustand';

import type { AccessStatus } from '@/api/types/access/access';
import type { CurrentAdmin } from '@/api/types/auth/auth';

export type AccessBootstrapStatus = 'unknown' | 'loading' | 'approved' | 'blocked';

const AUTH_STORAGE_KEY = 'chat-admin-auth';
const SESSION_KEY = 'chat-admin-session-v2';

interface AuthStoragePayload {
  accessToken: string | null;
  user: CurrentAdmin | null;
  access: AccessStatus | null;
  accessBootstrapStatus: AccessBootstrapStatus;
  rememberMe: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: CurrentAdmin | null;
  access: AccessStatus | null;
  accessBootstrapStatus: AccessBootstrapStatus;
  rememberMe: boolean;
  isInitialized: boolean;
  setInitialized: (isInitialized: boolean) => void;
  setAuth: (payload: {
    accessToken: string;
    user: CurrentAdmin | null;
    rememberMe?: boolean;
  }) => void;
  setUser: (user: CurrentAdmin | null) => void;
  setAccess: (access: AccessStatus | null) => void;
  setAccessBootstrapStatus: (status: AccessBootstrapStatus) => void;
  clearAuth: () => void;
  syncFromStorage: () => void;
}

const getStorage = (rememberMe: boolean): Storage => {
  return rememberMe ? localStorage : sessionStorage;
};

const loadFromStorage = (): AuthStoragePayload => {
  const localData = localStorage.getItem(AUTH_STORAGE_KEY);
  const sessionData = sessionStorage.getItem(SESSION_KEY);

  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      return { ...parsed, accessToken: null, rememberMe: true };
    } catch {
      // Invalid data, clear it
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData);
      return { ...parsed, accessToken: null, rememberMe: false };
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  return {
    accessToken: null,
    user: null,
    access: null,
    accessBootstrapStatus: 'unknown',
    rememberMe: false,
  };
};

const saveToStorage = (state: AuthStoragePayload): void => {
  const { rememberMe, accessToken, ...rest } = state;
  void accessToken;
  const storage = getStorage(rememberMe);
  const storageKey = rememberMe ? AUTH_STORAGE_KEY : SESSION_KEY;

  // Clear the other storage
  if (rememberMe) {
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  storage.setItem(storageKey, JSON.stringify(rest));
};

const clearAllStorage = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
};

// BroadcastChannel for multi-tab sync
let broadcastChannel: BroadcastChannel | null = null;

const getBroadcastChannel = (): BroadcastChannel => {
  if (!broadcastChannel && typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('chat-admin-auth');
  }
  return broadcastChannel!;
};

export const AUTH_EVENTS = {
  LOGOUT: 'chat-admin-logout',
  TOKEN_UPDATED: 'chat-admin-token-updated',
} as const;

export const useAuthStore = create<AuthState>()((set, get) => ({
  accessToken: null,
  user: null,
  access: null,
  accessBootstrapStatus: 'unknown',
  rememberMe: false,
  isInitialized: false,

  setInitialized: (isInitialized) => set({ isInitialized }),

  setAuth: ({ accessToken, user, rememberMe = false }) => {
    const currentState = get();
    const shouldRemember = rememberMe || currentState.rememberMe;

    const newState: AuthStoragePayload = {
      accessToken,
      user,
      access: null,
      accessBootstrapStatus: accessToken ? 'loading' : 'unknown',
      rememberMe: shouldRemember,
    };

    // Save to appropriate storage
    saveToStorage(newState);

    // Update store
    set({
      accessToken,
      user,
      access: null,
      accessBootstrapStatus: accessToken ? 'loading' : 'unknown',
      rememberMe: shouldRemember,
    });

    // Broadcast to other tabs
    try {
      const channel = getBroadcastChannel();
      channel?.postMessage({
        type: AUTH_EVENTS.TOKEN_UPDATED,
        payload: { accessToken, user },
      });
    } catch {
      // BroadcastChannel not supported
    }
  },

  setUser: (user) => {
    const currentState = get();
    const storagePayload: AuthStoragePayload = {
      accessToken: currentState.accessToken,
      user,
      access: currentState.access,
      accessBootstrapStatus: currentState.accessBootstrapStatus,
      rememberMe: currentState.rememberMe,
    };
    saveToStorage(storagePayload);
    set({ user });
  },

  setAccess: (access) => {
    const currentState = get();
    const storagePayload: AuthStoragePayload = {
      accessToken: currentState.accessToken,
      user: currentState.user,
      access,
      accessBootstrapStatus: access?.status === 'approved' ? 'approved' : access ? 'blocked' : 'unknown',
      rememberMe: currentState.rememberMe,
    };
    saveToStorage(storagePayload);
    set({
      access,
      accessBootstrapStatus: access?.status === 'approved' ? 'approved' : access ? 'blocked' : 'unknown',
    });
  },

  setAccessBootstrapStatus: (accessBootstrapStatus) => {
    const currentState = get();
    const storagePayload: AuthStoragePayload = {
      accessToken: currentState.accessToken,
      user: currentState.user,
      access: currentState.access,
      accessBootstrapStatus,
      rememberMe: currentState.rememberMe,
    };
    saveToStorage(storagePayload);
    set({ accessBootstrapStatus });
  },

  clearAuth: () => {
    clearAllStorage();
    set({
      accessToken: null,
      user: null,
      access: null,
      accessBootstrapStatus: 'unknown',
      rememberMe: false,
    });

    // Broadcast logout to other tabs
    try {
      const channel = getBroadcastChannel();
      channel?.postMessage({ type: AUTH_EVENTS.LOGOUT });
    } catch {
      // BroadcastChannel not supported
    }
  },

  syncFromStorage: () => {
    const stored = loadFromStorage();
    set({
      accessToken: stored.accessToken,
      user: stored.user,
      access: stored.access,
      accessBootstrapStatus: stored.accessBootstrapStatus,
      rememberMe: stored.rememberMe,
      isInitialized: true,
    });
  },
}));

// Initialize auth state from storage on module load
if (typeof window !== 'undefined') {
  const stored = loadFromStorage();
  useAuthStore.setState({
    accessToken: stored.accessToken,
    user: stored.user,
    access: stored.access,
    accessBootstrapStatus: stored.accessBootstrapStatus,
    rememberMe: stored.rememberMe,
    isInitialized: false,
  });

  // Listen for logout events from other tabs
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = getBroadcastChannel();
    channel?.addEventListener('message', (event) => {
      if (event.data?.type === AUTH_EVENTS.LOGOUT) {
        // Clear local state and storage
        clearAllStorage();
        useAuthStore.setState({
          accessToken: null,
          user: null,
          access: null,
          accessBootstrapStatus: 'unknown',
          rememberMe: false,
        });

        // Redirect to login if not already there
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          window.location.replace('/login');
        }
      } else if (event.data?.type === AUTH_EVENTS.TOKEN_UPDATED) {
        // Sync token from another tab
        const { accessToken, user } = event.data.payload;
        useAuthStore.setState({ accessToken, user });
      }
    });
  }
}

export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;

/**
 * Hook to get current auth state with initialization check
 */
export const useAuthState = () => {
  return useAuthStore((state) => ({
    accessToken: state.accessToken,
    user: state.user,
    access: state.access,
    accessBootstrapStatus: state.accessBootstrapStatus,
    rememberMe: state.rememberMe,
    isInitialized: state.isInitialized,
  }));
};
