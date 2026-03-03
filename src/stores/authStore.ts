/**
 * @fileoverview Auth Store (Zustand)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import apiClient, {
  resetAuthFailureState,
  setAuthFailureHandler,
} from "../lib/axios";
import type { ApiResponse } from "@hacom/chat-shared-types";
import type { LoginFormData, RegisterFormData } from "../lib/validations";
import { getAccessToken, storeTokens } from "../services/tokenService";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import {
  initializeAuthSync,
  notifyLogoutAcrossTabs,
  redirectToLogin,
  requestServerLogout,
  runClientLogoutCleanup,
} from "../services/authService";
import i18n from "../i18n";

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  status: "online" | "offline" | "away" | "dnd";
  role?: string;
  isVerified?: boolean;
  createdAt?: string;
}

interface AuthResponse {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
}

interface LogoutOptions {
  reason: string;
  notifyServer: boolean;
  broadcast: boolean;
  redirect: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  login: (data: LoginFormData) => Promise<void>;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  updateStatus: (status: User["status"]) => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<void>;

  handleAuthFailure: (reason?: string) => Promise<void>;
  handleRemoteLogout: (reason?: string) => Promise<void>;
}

let logoutFlowPromise: Promise<void> | null = null;

const resolveTokens = (
  payload: AuthResponse,
): { accessToken: string | null; refreshToken: string | null } => {
  const accessToken =
    payload.tokens?.accessToken ?? payload.accessToken ?? null;
  const refreshToken =
    payload.tokens?.refreshToken ?? payload.refreshToken ?? null;
  return { accessToken, refreshToken };
};

const resetChatState = async (): Promise<void> => {
  const { useChatStore } = await import("./chatStore");
  useChatStore.getState().reset();
  const { usePresenceStore } = await import("./presenceStore");
  usePresenceStore.getState().clearAll();
  const { useGroupStore } = await import("./groupStore");
  useGroupStore.getState().reset();
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const runLogoutFlow = async (options: LogoutOptions): Promise<void> => {
        if (logoutFlowPromise) {
          return logoutFlowPromise;
        }

        logoutFlowPromise = (async () => {
          set({ isLoading: true });

          if (options.notifyServer) {
            try {
              await requestServerLogout();
            } catch {
              // Local logout still continues even when server call fails.
            }
          }

          runClientLogoutCleanup(options.reason);
          await resetChatState();

          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            isInitialized: true,
          });

          if (options.broadcast) {
            notifyLogoutAcrossTabs(options.reason);
          }

          if (options.redirect) {
            redirectToLogin();
          }
        })().finally(() => {
          logoutFlowPromise = null;
        });

        return logoutFlowPromise;
      };

      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false,
        error: null,

        login: async (data: LoginFormData) => {
          set({ isLoading: true, error: null });

          try {
            const response = await apiClient.post<ApiResponse<AuthResponse>>(
              "/auth/login",
              {
                email: data.email,
                password: data.password,
              },
            );

            const payload = unwrapApiSuccess(response.data);
            const { user } = payload;
            const { accessToken, refreshToken } = resolveTokens(payload);

            if (!accessToken) {
              throw new Error(i18n.t("error:auth.loginTokenMissing"));
            }

            storeTokens(
              accessToken,
              refreshToken ?? undefined,
              data.rememberMe,
            );
            resetAuthFailureState();

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.loginFailed");

            set({
              isLoading: false,
              error: errorMessage,
              isAuthenticated: false,
              user: null,
              isInitialized: true,
            });
            throw new Error(errorMessage);
          }
        },

        register: async (data) => {
          set({ isLoading: true, error: null });

          try {
            const response = await apiClient.post<ApiResponse<AuthResponse>>(
              "/auth/register",
              data,
            );

            const payload = unwrapApiSuccess(response.data);
            const { user } = payload;
            const { accessToken, refreshToken } = resolveTokens(payload);

            if (!accessToken) {
              throw new Error(i18n.t("error:auth.registerTokenMissing"));
            }

            storeTokens(accessToken, refreshToken ?? undefined, false);
            resetAuthFailureState();

            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
              error: null,
            });
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.registerFailed");
            set({
              isLoading: false,
              error: errorMessage,
              isInitialized: true,
            });
            throw new Error(errorMessage);
          }
        },

        logout: async () => {
          await runLogoutFlow({
            reason: "manual_logout",
            notifyServer: true,
            broadcast: true,
            redirect: true,
          });
        },

        refreshUser: async () => {
          const token = getAccessToken();

          if (!token) {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
            });
            return;
          }

          set({ isLoading: true });

          try {
            const response = await apiClient.get<ApiResponse<User>>("/auth/me");
            const user = unwrapApiSuccess(response.data);
            set({
              user,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
            });
            resetAuthFailureState();
          } catch {
            runClientLogoutCleanup("refresh_user_failed");
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
            });
          }
        },

        updateUser: (data: Partial<User>) => {
          const currentUser = get().user;
          if (currentUser) {
            set({ user: { ...currentUser, ...data } });
          }
        },

        updateStatus: async (status: User["status"]) => {
          try {
            await apiClient.put("/users/status", { status });
            const currentUser = get().user;
            if (currentUser) {
              set({ user: { ...currentUser, status } });
            }
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.statusUpdateFailed");
            throw new Error(errorMessage);
          }
        },

        clearError: () => set({ error: null }),

        initialize: async () => {
          const token = getAccessToken();

          if (token) {
            await get().refreshUser();
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isInitialized: true,
            });
          }
        },

        handleAuthFailure: async (reason = "refresh_failed") => {
          await runLogoutFlow({
            reason,
            notifyServer: false,
            broadcast: true,
            redirect: true,
          });
        },

        handleRemoteLogout: async (reason = "remote_logout") => {
          await runLogoutFlow({
            reason,
            notifyServer: false,
            broadcast: false,
            redirect: true,
          });
        },
      };
    },
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

setAuthFailureHandler((reason) => {
  void useAuthStore.getState().handleAuthFailure(reason);
});

initializeAuthSync((reason) => {
  void useAuthStore.getState().handleRemoteLogout(reason);
});
