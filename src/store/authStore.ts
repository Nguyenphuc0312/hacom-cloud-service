import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CurrentUser } from '@/api/types';

interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  setAuth: (payload: { accessToken: string; user: CurrentUser | null }) => void;
  setUser: (user: CurrentUser | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: ({ accessToken, user }) => set({ accessToken, user }),
      setUser: (user) => set({ user }),
      clearAuth: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'chat-admin-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ accessToken: state.accessToken, user: state.user }),
    },
  ),
);

export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
