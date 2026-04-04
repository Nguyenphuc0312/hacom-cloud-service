import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CurrentAdmin } from '@/api/types';

interface AuthState {
  accessToken: string | null;
  user: CurrentAdmin | null;
  setAuth: (payload: { accessToken: string; user: CurrentAdmin | null }) => void;
  setUser: (user: CurrentAdmin | null) => void;
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
