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
import type { ApiResponse } from "@hacom/chat-shared-types";
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
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
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
export type VerificationFlowSource = "signup" | "external";

export interface EmailVerificationChallengeSnapshot {
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  purpose: "signup";
  verificationState:
    | "pending_otp"
    | "expired"
    | "invalidated"
    | "locked"
    | "verified"
    | "recoverable_error"
    | "missing_context";
  lockedReason?: string | null;
  attemptCount?: number | null;
  maxAttempts?: number | null;
  lastResolvedAt?: string | null;
}

export interface RegisterFlowResult {
  verificationRequired: boolean;
  email: string;
  challengeId: string | null;
  expiresAt: string | null;
}

interface AuthState {
  user: User | null;
  pendingVerificationEmail: string | null;
  pendingVerificationSource: VerificationFlowSource | null;
  emailVerificationChallenge: EmailVerificationChallengeSnapshot | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  registrationStatus: RegistrationStatus;
  error: string | null;

  login: (data: LoginFormData) => Promise<void>;
  applyLoginResponse: (payload: AuthResponse, rememberMe?: boolean) => void;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<RegisterFlowResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  updateStatus: (status: User["status"]) => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setPendingVerificationEmail: (
    email: string | null,
    source?: VerificationFlowSource,
  ) => void;
  clearPendingVerificationEmail: () => void;
  setEmailVerificationChallenge: (
    challenge: EmailVerificationChallengeSnapshot | null,
  ) => void;
  clearEmailVerificationChallenge: () => void;

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
  const response = await authClient.get<ApiResponse<User>>(AUTH_ENDPOINTS.me, {
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

const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const normalizeIsoDateValue = (value: unknown): string | null => {
  const normalized = normalizeStringValue(value);
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
};

const normalizeTtlSeconds = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
};

const normalizeBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
};

const pickChallengeContainer = (
  payload: unknown,
): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const challengeCandidates: unknown[] = [
    root.emailVerificationChallenge,
    root.verificationChallenge,
    root.challenge,
    root,
  ];

  for (const candidate of challengeCandidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    if (normalizeStringValue(record.challengeId)) {
      return record;
    }
  }

  return null;
};

const buildRegisterChallengeSnapshot = (
  payload: unknown,
  email: string,
): EmailVerificationChallengeSnapshot | null => {
  const challenge = pickChallengeContainer(payload);
  if (!challenge) {
    return null;
  }

  const challengeId = normalizeStringValue(challenge.challengeId);
  if (!challengeId) {
    return null;
  }

  const nowMs = Date.now();
  const ttlSeconds = normalizeTtlSeconds(challenge.ttlSeconds) ?? 600;
  const expiresAt =
    normalizeIsoDateValue(challenge.expiresAt) ??
    new Date(nowMs + ttlSeconds * 1000).toISOString();
  const resendAvailableAt =
    normalizeIsoDateValue(challenge.resendAvailableAt) ??
    new Date(nowMs + 60 * 1000).toISOString();

  return {
    challengeId,
    email,
    expiresAt,
    resendAvailableAt,
    purpose: "signup",
    verificationState: "pending_otp",
    lockedReason: null,
    attemptCount: null,
    maxAttempts: null,
    lastResolvedAt: new Date().toISOString(),
  };
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
            pendingVerificationSource: null,
            emailVerificationChallenge: null,
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
        pendingVerificationSource: null,
        emailVerificationChallenge: null,
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
            pendingVerificationSource: null,
            emailVerificationChallenge: null,
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
              AUTH_ENDPOINTS.login,
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
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
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
            const registerPayload = unwrapApiSuccess(response);
            const payloadRecord = registerPayload as unknown as Record<
              string,
              unknown
            >;
            const payloadEmail = normalizeStringValue(payloadRecord.email);
            const pendingEmail =
              payloadEmail || data.email.trim().toLowerCase();
            const challengeContainer = pickChallengeContainer(registerPayload);
            const challengeId = normalizeStringValue(
              challengeContainer?.challengeId,
            );
            const expiresAt = normalizeIsoDateValue(
              challengeContainer?.expiresAt,
            );
            const verificationRequired =
              normalizeBooleanValue(payloadRecord.verificationRequired) ?? true;
            const challengeSnapshot = buildRegisterChallengeSnapshot(
              registerPayload,
              pendingEmail,
            );

            if (verificationRequired) {
              set({
                user: null,
                pendingVerificationEmail: pendingEmail,
                pendingVerificationSource: "signup",
                emailVerificationChallenge: challengeSnapshot,
                isAuthenticated: false,
                isLoading: false,
                isInitialized: true,
                registrationStatus: "verification_required",
                error: null,
              });
            } else {
              set({
                user: null,
                pendingVerificationEmail: null,
                pendingVerificationSource: null,
                emailVerificationChallenge: null,
                isAuthenticated: false,
                isLoading: false,
                isInitialized: true,
                registrationStatus: "idle",
                error: null,
              });
            }

            return {
              verificationRequired,
              email: pendingEmail,
              challengeId,
              expiresAt,
            };
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage =
              apiError.message || i18n.t("error:auth.registerFailed");
            set({
              isLoading: false,
              error: errorMessage,
              pendingVerificationEmail: null,
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
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
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
            });
            return;
          }

          set({ isLoading: true });

          try {
            // /api/v1/auth/me needs Bearer token — use authClient with explicit header.
            const response = await authClient.get<ApiResponse<User>>(
              AUTH_ENDPOINTS.me,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const user = unwrapApiSuccess(response.data);
            set({
              user,
              pendingVerificationEmail: null,
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
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
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
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

        setPendingVerificationEmail: (email, source) =>
          set((state) => {
            const normalizedEmail = email?.trim().toLowerCase() || null;
            const keepChallenge =
              normalizedEmail &&
              state.emailVerificationChallenge &&
              state.emailVerificationChallenge.email === normalizedEmail
                ? state.emailVerificationChallenge
                : null;
            const nextSource = normalizedEmail
              ? source || state.pendingVerificationSource || "external"
              : null;

            return {
              pendingVerificationEmail: normalizedEmail,
              pendingVerificationSource: nextSource,
              emailVerificationChallenge: keepChallenge,
              registrationStatus: normalizedEmail
                ? "verification_required"
                : "idle",
            };
          }),

        clearPendingVerificationEmail: () =>
          set({
            pendingVerificationEmail: null,
            pendingVerificationSource: null,
            registrationStatus: "idle",
          }),

        setEmailVerificationChallenge: (challenge) =>
          set((state) => ({
            emailVerificationChallenge: challenge,
            pendingVerificationSource:
              challenge && !state.pendingVerificationSource
                ? "external"
                : state.pendingVerificationSource,
          })),

        clearEmailVerificationChallenge: () =>
          set({
            emailVerificationChallenge: null,
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
                  pendingVerificationSource: null,
                  emailVerificationChallenge: null,
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
                    pendingVerificationSource: null,
                    emailVerificationChallenge: null,
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
                const newAccessToken =
                  await refreshAccessTokenShared("bootstrap");
                const user = await fetchCurrentUser(newAccessToken);
                set({
                  user,
                  pendingVerificationEmail: null,
                  pendingVerificationSource: null,
                  emailVerificationChallenge: null,
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
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
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
        pendingVerificationSource: state.pendingVerificationSource,
        emailVerificationChallenge: state.emailVerificationChallenge,
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
