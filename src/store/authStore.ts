import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AccessStatus, CurrentAdmin } from '@/api/types';

export type AccessBootstrapStatus = 'unknown' | 'loading' | 'approved' | 'blocked';

interface AuthState {
  accessToken: string | null;
  user: CurrentAdmin | null;
  access: AccessStatus | null;
  accessBootstrapStatus: AccessBootstrapStatus;
  setAuth: (payload: { accessToken: string; user: CurrentAdmin | null }) => void;
  setUser: (user: CurrentAdmin | null) => void;
  setAccess: (access: AccessStatus | null) => void;
  setAccessBootstrapStatus: (status: AccessBootstrapStatus) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      access: null,
      accessBootstrapStatus: 'unknown',
      setAuth: ({ accessToken, user }) =>
        set({
          accessToken,
          user,
          access: null,
          accessBootstrapStatus: accessToken ? 'loading' : 'unknown',
        }),
      setUser: (user) => set({ user }),
      setAccess: (access) =>
        set({
          access,
          accessBootstrapStatus: access?.status === 'approved' ? 'approved' : access ? 'blocked' : 'unknown',
        }),
      setAccessBootstrapStatus: (accessBootstrapStatus) => set({ accessBootstrapStatus }),
      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          access: null,
          accessBootstrapStatus: 'unknown',
        }),
    }),
    {
      name: 'chat-admin-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        access: state.access,
        accessBootstrapStatus: state.accessBootstrapStatus,
      }),
    },
  ),
);

export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
