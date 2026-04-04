/**
 * @fileoverview Auth Store (Zustand)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import apiClient, {
  authClient,
  resetAuthFailureState,
  setAuthFailureHandler,
} from "../lib/axios";
import type {
  ApiResponse,
} from "@hacom/chat-shared-types";
import type { LoginFormData, RegisterFormData } from "../lib/validations";
import {
  getAccessToken,
  getRefreshToken,
  isRefreshTokenCookieMode,
  storeTokens,
} from "../services/tokenService";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { toast } from "../components/ui";
import {
  initializeAuthSync,
  notifyLogoutAcrossTabs,
  redirectToLogin,
  requestServerLogout,
  runClientLogoutCleanup,
} from "../services/authService";
import i18n from "../i18n";
import { refreshAccessTokenShared } from "../services/authRefreshCoordinator";

export interface User {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  status?: "online" | "offline" | "away" | "dnd" | string;
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

type RegistrationStatus = "idle" | "verification_required";

interface AuthState {
  user: User | null;
  pendingVerificationEmail: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  registrationStatus: RegistrationStatus;
  error: string | null;

  login: (data: LoginFormData) => Promise<void>;
  applyLoginResponse: (payload: AuthResponse, rememberMe?: boolean) => void;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  updateStatus: (status: User["status"]) => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setPendingVerificationEmail: (email: string | null) => void;
  clearPendingVerificationEmail: () => void;

  handleAuthFailure: (reason?: string) => Promise<void>;
  handleRemoteLogout: (reason?: string) => Promise<void>;
}

let logoutFlowPromise: Promise<void> | null = null;
let initializePromise: Promise<void> | null = null;

const resolveTokens = (
  payload: AuthResponse,
): { accessToken: string | null; refreshToken: string | null } => {
  const accessToken =
    payload.tokens?.accessToken ?? payload.accessToken ?? null;
  const refreshToken =
    payload.tokens?.refreshToken ?? payload.refreshToken ?? null;
  return { accessToken, refreshToken };
};

const fetchCurrentUser = async (accessToken: string): Promise<User> => {
  const response = await authClient.get<ApiResponse<User>>("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return unwrapApiSuccess(response.data);
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
              toast.warning("Logout server failed, local logout applied");
            }
          }

          runClientLogoutCleanup(options.reason);
          await resetChatState();

          set({
            user: null,
            pendingVerificationEmail: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            isInitialized: true,
            registrationStatus: "idle",
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
        pendingVerificationEmail: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false,
        registrationStatus: "idle",
        error: null,

        applyLoginResponse: (payload, rememberMe = false) => {
          const { user } = payload;
          const { accessToken, refreshToken } = resolveTokens(payload);

          if (!accessToken) {
            throw new Error(i18n.t("error:auth.loginTokenMissing"));
          }

          storeTokens(accessToken, refreshToken ?? undefined, rememberMe);
          resetAuthFailureState();

          set({
            user,
            pendingVerificationEmail: null,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
            registrationStatus: "idle",
            error: null,
          });
        },

        login: async (data: LoginFormData) => {
          set({ isLoading: true, error: null });

          try {
            const response = await authClient.post<ApiResponse<AuthResponse>>(
              "/auth/login",
              {
                email: data.email,
                password: data.password,
              },
            );

            const payload = unwrapApiSuccess(response.data);
            get().applyLoginResponse(payload, data.rememberMe);
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.loginFailed");

            set({
              isLoading: false,
              error: errorMessage,
              isAuthenticated: false,
              user: null,
              pendingVerificationEmail: null,
              isInitialized: true,
              registrationStatus: "idle",
            });
            throw new Error(errorMessage);
          }
        },

        register: async (data) => {
          set({ isLoading: true, error: null });

          try {
            const { authApi } = await import("../services/api");
            const response = await authApi.register(data);
            unwrapApiSuccess(response);
            const pendingEmail = data.email.trim().toLowerCase();

            set({
              user: null,
              pendingVerificationEmail: pendingEmail,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "verification_required",
              error: null,
            });
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.registerFailed");
            set({
              isLoading: false,
              error: errorMessage,
              pendingVerificationEmail: null,
              isInitialized: true,
              registrationStatus: "idle",
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
              pendingVerificationEmail: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
            });
            return;
          }

          set({ isLoading: true });

          try {
            // /auth/me needs Bearer token — use authClient with explicit header.
            const response = await authClient.get<ApiResponse<User>>(
              "/auth/me",
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const user = unwrapApiSuccess(response.data);
            set({
              user,
              pendingVerificationEmail: null,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
            });
            resetAuthFailureState();
          } catch {
            runClientLogoutCleanup("refresh_user_failed");
            set({
              user: null,
              pendingVerificationEmail: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
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

        setPendingVerificationEmail: (email) =>
          set({
            pendingVerificationEmail: email?.trim().toLowerCase() || null,
            registrationStatus: email ? "verification_required" : "idle",
          }),

        clearPendingVerificationEmail: () =>
          set({
            pendingVerificationEmail: null,
            registrationStatus: "idle",
          }),

        initialize: async () => {
          if (initializePromise) {
            return initializePromise;
          }

          initializePromise = (async () => {
            set({ isLoading: true, error: null });

            const accessToken = getAccessToken();
            if (accessToken) {
              try {
                const user = await fetchCurrentUser(accessToken);
                set({
                  user,
                  pendingVerificationEmail: null,
                  isAuthenticated: true,
                  isLoading: false,
                  isInitialized: true,
                  registrationStatus: "idle",
                  error: null,
                });
                resetAuthFailureState();
                return;
              } catch (error: unknown) {
                const apiError = extractApiError(error);
                if (apiError.statusCode !== 401) {
                  runClientLogoutCleanup("bootstrap_me_failed");
                  set({
                    user: null,
                    pendingVerificationEmail: null,
                    isAuthenticated: false,
                    isLoading: false,
                    isInitialized: true,
                    registrationStatus: "idle",
                    error: null,
                  });
                  return;
                }
              }
            }

            if (isRefreshTokenCookieMode() || getRefreshToken()) {
              try {
                const newAccessToken = await refreshAccessTokenShared("bootstrap");
                const user = await fetchCurrentUser(newAccessToken);
                set({
                  user,
                  pendingVerificationEmail: null,
                  isAuthenticated: true,
                  isLoading: false,
                  isInitialized: true,
                  registrationStatus: "idle",
                  error: null,
                });
                resetAuthFailureState();
                return;
              } catch {
                // Fallback to local logout below.
              }
            }

            runClientLogoutCleanup("bootstrap_auth_failed");
            set({
              user: null,
              pendingVerificationEmail: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
              error: null,
            });
          })().finally(() => {
            initializePromise = null;
          });

          return initializePromise;
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
        pendingVerificationEmail: state.pendingVerificationEmail,
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
