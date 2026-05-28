/**
 * @fileoverview Auth Store (Zustand)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import apiClient, {
  authenticatedAuthClient,
  resetAuthFailureState,
  setAuthFailureHandler,
} from "../lib/axios";
import { ErrorCode, type ApiResponse } from "@hacom/chat-shared-types/core";
import type { LoginFormData, RegisterFormData } from "../lib/validations";
import {
  getAccessToken,
  getRefreshToken,
  isRefreshTokenCookieMode,
  parseMustChangePasswordFromToken,
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
import type {
  ActivationContext,
  AuthStatus,
  LockedAccountContext,
  PersistedAuthStatus,
} from "../features/auth/model/authState";
import {
  normalizePersistedAuthStatus,
  resolveLockedAccountStatus,
} from "../features/auth/model/authState";
import {
  loginAuthApi,
  normalizeAuthResponse,
} from "../features/auth/api/authApi";
import { resolveAuthFailure } from "../features/auth/utils/authErrorMapper";
import { authApi } from "../services/api";
import { runRegisteredStoreResets } from "./storeResetRegistry";
import { toVietnameseMessage } from "../utils/userMessages";

export interface User {
  id: string;
  username: string;
  email?: string;
  corporateEmail?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  effectiveDisplayName?: string;
  fullName?: string | null;
  fullNameFromHR?: string;
  fullNameFromHr?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  hrLinked?: boolean;
  accountType?: "employee" | "exception" | "bot" | string;
  hrLegalName?: string;
  avatar?: string;
  backgroundImageUrl?: string;
  bio?: string;
  phone?: string;
  departmentName?: string;
  companyName?: string;
  company_name?: string;
  orgUnit?: string;
  title?: string;
  unitCode?: string;
  loginIdentifier?: string;
  avatarFileId?: string | null;
  avatarVersion?: number | null;
  backgroundFileId?: string | null;
  status?: "online" | "offline" | "away" | "dnd" | string;
  role?: string;
  isVerified?: boolean;
  createdAt?: string;
  accountState?: string;
  account_state?: string;
  activationStatus?: string;
  activation_status?: string;
  mustChangePassword?: boolean;
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
  message?: string;
}

export type LoginResult =
  | { status: "authenticated"; message?: string }
  | "activation_required"
  | "locked"
  | "disabled";

interface AuthState {
  user: User | null;
  authStatus: AuthStatus;
  isBootstrappingAuth: boolean;
  activationContext: ActivationContext | null;
  lockedAccount: LockedAccountContext | null;
  pendingVerificationEmail: string | null;
  pendingVerificationSource: VerificationFlowSource | null;
  emailVerificationChallenge: EmailVerificationChallengeSnapshot | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  registrationStatus: RegistrationStatus;
  error: string | null;

  login: (data: LoginFormData) => Promise<LoginResult>;
  applyLoginResponse: (payload: unknown, rememberMe?: boolean) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setActivationContext: (context: ActivationContext | null) => void;
  setLockedAccount: (locked: LockedAccountContext | null) => void;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<RegisterFlowResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<User | null>;
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

  handleAuthFailure: (input?: AuthFailureInput) => Promise<void>;
  handleRemoteLogout: (reason?: string) => Promise<void>;
}

export type AuthFailureInput =
  | string
  | {
      reason: string;
      /** Force broadcast/redirect. Defaults derived from whether the reason is definitive. */
      broadcast?: boolean;
      redirect?: boolean;
      definitive?: boolean;
    };

// Reasons that represent a transient (network/429/5xx) failure — these must NOT
// clear the session, redirect to /login, or broadcast a logout to other tabs.
const TRANSIENT_AUTH_FAILURE_REASONS = new Set<string>([
  "network",
  "transient",
  "refresh_transient",
  "ws_refresh_transient",
  "refresh_429",
  "refresh_5xx",
  "refresh_timeout",
]);

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
  const response = await apiClient.get<ApiResponse<User>>("/users/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = normalizeAuthResponse({
    user: unwrapApiSuccess(response.data),
    accessToken,
  }).user as unknown as User;
  user.mustChangePassword = parseMustChangePasswordFromToken(accessToken);
  return user;
};

const normalizeLoginPayload = (payload: unknown): AuthResponse =>
  normalizeAuthResponse(payload) as unknown as AuthResponse;

const resetChatState = async (): Promise<void> => {
  await runRegisteredStoreResets();
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

const normalizeStatusMarker = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized || null;
};

const resolveBlockedStatusFromUser = (
  user: User | null | undefined,
): LockedAccountContext["status"] | null => {
  if (!user) {
    return null;
  }

  const userRecord = user as unknown as Record<string, unknown>;
  const candidates = [
    userRecord.accountState,
    userRecord.account_state,
    userRecord.activationStatus,
    userRecord.activation_status,
    userRecord.status,
  ];

  for (const value of candidates) {
    const normalized = normalizeStatusMarker(value);
    if (!normalized) {
      continue;
    }

    if (normalized === "DISABLED") {
      return "disabled";
    }

    if (normalized === "LOCKED") {
      return "locked";
    }
  }

  return null;
};

const resolveBlockedAuthMessage = (
  status: LockedAccountContext["status"],
): string =>
  status === "disabled"
    ? i18n.t("auth:activation.locked.accountDisabled")
    : i18n.t("auth:activation.locked.accountLocked");

const resolveBlockedAuthCode = (
  status: LockedAccountContext["status"],
): string =>
  status === "disabled"
    ? ErrorCode.ACCOUNT_DISABLED
    : ErrorCode.AUTH_ACCOUNT_LOCKED;

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
            authStatus: "anonymous",
            isBootstrappingAuth: false,
            activationContext: null,
            lockedAccount: null,
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
        authStatus: "idle",
        isBootstrappingAuth: false,
        activationContext: null,
        lockedAccount: null,
        pendingVerificationEmail: null,
        pendingVerificationSource: null,
        emailVerificationChallenge: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false,
        registrationStatus: "idle",
        error: null,

        applyLoginResponse: (payload, rememberMe = false) => {
          const normalizedPayload = normalizeLoginPayload(payload);
          const { user } = normalizedPayload;
          const { accessToken, refreshToken } =
            resolveTokens(normalizedPayload);
          const blockedStatus = resolveBlockedStatusFromUser(user);

          if (!accessToken) {
            throw new Error(i18n.t("error:auth.loginTokenMissing"));
          }

          if (blockedStatus) {
            const blockedMessage = resolveBlockedAuthMessage(blockedStatus);
            runClientLogoutCleanup("login_blocked_account_state");
            set({
              user: null,
              authStatus: blockedStatus,
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: {
                status: blockedStatus,
                code: resolveBlockedAuthCode(blockedStatus),
                message: blockedMessage,
              },
              pendingVerificationEmail: null,
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
              error: blockedMessage,
            });
            return;
          }

          storeTokens(accessToken, refreshToken ?? undefined, rememberMe);
          resetAuthFailureState();

          const mustChangePassword = parseMustChangePasswordFromToken(accessToken);
          const userWithFlag: User = { ...user, mustChangePassword };

          set({
            user: userWithFlag,
            authStatus: "authenticated",
            isBootstrappingAuth: false,
            activationContext: null,
            lockedAccount: null,
            pendingVerificationEmail: null,
            pendingVerificationSource: null,
            emailVerificationChallenge: null,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
            registrationStatus: "idle",
            error: null,
          });

          void get().refreshProfile().catch(() => null);
        },

        setAuthStatus: (status) =>
          set({
            authStatus: status,
            isAuthenticated: status === "authenticated",
          }),

        setActivationContext: (context) =>
          set({
            activationContext: context,
            authStatus: context ? "activation_required" : get().authStatus,
            isAuthenticated: context ? false : get().isAuthenticated,
          }),

        setLockedAccount: (locked) =>
          set({
            lockedAccount: locked,
            authStatus: locked ? locked.status : get().authStatus,
            isAuthenticated: locked ? false : get().isAuthenticated,
          }),

        login: async (data: LoginFormData) => {
          set({
            isLoading: true,
            error: null,
            lockedAccount: null,
          });

          try {
            const payload = await loginAuthApi.login({
              loginIdentifier: data.loginIdentifier,
              email: data.loginIdentifier.includes("@")
                ? data.loginIdentifier
                : undefined,
              password: data.password,
              rememberMe: data.rememberMe,
            });
            get().applyLoginResponse(payload, data.rememberMe);
            return {
              status: "authenticated",
              message: payload.message,
            };
          } catch (error: unknown) {
            const failure = resolveAuthFailure(error, i18n.t.bind(i18n));

            if (
              failure.kind === "activation_required" &&
              failure.activationContext
            ) {
              set({
                isLoading: false,
                error: null,
                authStatus: "activation_required",
                isBootstrappingAuth: false,
                activationContext: failure.activationContext,
                lockedAccount: null,
                isAuthenticated: false,
                user: null,
                pendingVerificationEmail: null,
                pendingVerificationSource: null,
                emailVerificationChallenge: null,
                isInitialized: true,
                registrationStatus: "idle",
              });
              return "activation_required";
            }

            if (failure.kind === "locked" || failure.kind === "disabled") {
              const lockedStatus = resolveLockedAccountStatus(failure.code);
              const lockedMessage = toVietnameseMessage(
                failure.message,
                i18n.t("auth:activation.locked.defaultMessage"),
              );
              set({
                isLoading: false,
                error: lockedMessage,
                authStatus: lockedStatus,
                isBootstrappingAuth: false,
                lockedAccount: {
                  status: lockedStatus,
                  code: failure.code,
                  message: lockedMessage,
                },
                activationContext: null,
                isAuthenticated: false,
                user: null,
                pendingVerificationEmail: null,
                pendingVerificationSource: null,
                emailVerificationChallenge: null,
                isInitialized: true,
                registrationStatus: "idle",
              });
              return lockedStatus;
            }

            const errorMessage = toVietnameseMessage(
              failure.message,
              i18n.t("error:auth.loginFailed"),
            );

            set({
              isLoading: false,
              error: errorMessage,
              authStatus: "anonymous",
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: null,
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
          set({
            isLoading: true,
            error: null,
            authStatus: "anonymous",
            activationContext: null,
            lockedAccount: null,
          });

          try {
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
                authStatus: "anonymous",
                isBootstrappingAuth: false,
                activationContext: null,
                lockedAccount: null,
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
                authStatus: "anonymous",
                isBootstrappingAuth: false,
                activationContext: null,
                lockedAccount: null,
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
              message: response.message,
            };
          } catch (error: unknown) {
            const apiError = extractApiError(error);
            const errorMessage = toVietnameseMessage(
              apiError.message,
              i18n.t("error:auth.registerFailed"),
            );
            set({
              isLoading: false,
              error: errorMessage,
              authStatus: "anonymous",
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: null,
              pendingVerificationEmail: null,
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
              isAuthenticated: false,
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
              authStatus: "anonymous",
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: null,
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

          set({ isLoading: true, authStatus: "loading" });

          try {
            const response = await authenticatedAuthClient.get<ApiResponse<User>>(
              AUTH_ENDPOINTS.me,
            );
            const user = unwrapApiSuccess(response.data);
            const blockedStatus = resolveBlockedStatusFromUser(user);

            if (blockedStatus) {
              const blockedMessage = resolveBlockedAuthMessage(blockedStatus);
              runClientLogoutCleanup("refresh_user_blocked_state");
              set({
                user: null,
                authStatus: blockedStatus,
                isBootstrappingAuth: false,
                activationContext: null,
                lockedAccount: {
                  status: blockedStatus,
                  code: resolveBlockedAuthCode(blockedStatus),
                  message: blockedMessage,
                },
                pendingVerificationEmail: null,
                pendingVerificationSource: null,
                emailVerificationChallenge: null,
                isAuthenticated: false,
                isLoading: false,
                isInitialized: true,
                registrationStatus: "idle",
                error: blockedMessage,
              });
              return;
            }

            set({
              user,
              authStatus: "authenticated",
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: null,
              pendingVerificationEmail: null,
              pendingVerificationSource: null,
              emailVerificationChallenge: null,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
              registrationStatus: "idle",
            });
            resetAuthFailureState();
          } catch (refreshUserErr: unknown) {
            const apiErr = extractApiError(refreshUserErr);
            if (apiErr.statusCode === 401 || apiErr.statusCode === 403) {
              // Genuine auth rejection — log out and clear session.
              runClientLogoutCleanup("refresh_user_auth_failure");
              set({
                user: null,
                authStatus: "anonymous",
                isBootstrappingAuth: false,
                activationContext: null,
                lockedAccount: null,
                pendingVerificationEmail: null,
                pendingVerificationSource: null,
                emailVerificationChallenge: null,
                isAuthenticated: false,
                isLoading: false,
                isInitialized: true,
                registrationStatus: "idle",
              });
            } else {
              // Network / server error — keep session, just stop the loading state.
              set({ isLoading: false, isBootstrappingAuth: false });
            }
          }
        },

        refreshProfile: async () => {
          const token = getAccessToken();
          if (!token) {
            return null;
          }

          const user = await fetchCurrentUser(token);
          set((state) => ({
            user,
            authStatus:
              state.authStatus === "authenticated"
                ? state.authStatus
                : "authenticated",
            isBootstrappingAuth: false,
            isAuthenticated: true,
          }));
          return user;
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
            set({
              isLoading: true,
              error: null,
              authStatus: "loading",
              isBootstrappingAuth: true,
            });

            const accessToken = getAccessToken();
            if (accessToken) {
              try {
                const user = await fetchCurrentUser(accessToken);
                const blockedStatus = resolveBlockedStatusFromUser(user);

                if (blockedStatus) {
                  const blockedMessage =
                    resolveBlockedAuthMessage(blockedStatus);
                  runClientLogoutCleanup("bootstrap_blocked_account_state");
                  set({
                    user: null,
                    authStatus: blockedStatus,
                    isBootstrappingAuth: false,
                    activationContext: null,
                    lockedAccount: {
                      status: blockedStatus,
                      code: resolveBlockedAuthCode(blockedStatus),
                      message: blockedMessage,
                    },
                    pendingVerificationEmail: null,
                    pendingVerificationSource: null,
                    emailVerificationChallenge: null,
                    isAuthenticated: false,
                    isLoading: false,
                    isInitialized: true,
                    registrationStatus: "idle",
                    error: blockedMessage,
                  });
                  return;
                }

                set({
                  user,
                  authStatus: "authenticated",
                  isBootstrappingAuth: false,
                  activationContext: null,
                  lockedAccount: null,
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
                    authStatus: "bootstrap_error",
                    isBootstrappingAuth: false,
                    activationContext: null,
                    lockedAccount: null,
                    pendingVerificationEmail: null,
                    pendingVerificationSource: null,
                    emailVerificationChallenge: null,
                    isAuthenticated: false,
                    isLoading: false,
                    isInitialized: true,
                    registrationStatus: "idle",
                    error: apiError.message || i18n.t("error:auth.loginFailed"),
                  });
                  return;
                }
              }
            }

            if (isRefreshTokenCookieMode() || getRefreshToken()) {
              // Split refresh and profile-fetch into separate try-catch blocks so
              // that a network/server error on the profile endpoint doesn't cause
              // the session to be cleared when we just successfully refreshed.
              let bootstrapToken: string | null = null;
              let bootstrapRefreshError: unknown = null;

              try {
                bootstrapToken = await refreshAccessTokenShared("bootstrap");
              } catch (err) {
                bootstrapRefreshError = err;
              }

              if (bootstrapToken) {
                try {
                  const user = await fetchCurrentUser(bootstrapToken);
                  const blockedStatus = resolveBlockedStatusFromUser(user);

                  if (blockedStatus) {
                    const blockedMessage =
                      resolveBlockedAuthMessage(blockedStatus);
                    runClientLogoutCleanup(
                      "bootstrap_refresh_blocked_account_state",
                    );
                    set({
                      user: null,
                      authStatus: blockedStatus,
                      isBootstrappingAuth: false,
                      activationContext: null,
                      lockedAccount: {
                        status: blockedStatus,
                        code: resolveBlockedAuthCode(blockedStatus),
                        message: blockedMessage,
                      },
                      pendingVerificationEmail: null,
                      pendingVerificationSource: null,
                      emailVerificationChallenge: null,
                      isAuthenticated: false,
                      isLoading: false,
                      isInitialized: true,
                      registrationStatus: "idle",
                      error: blockedMessage,
                    });
                    return;
                  }

                  set({
                    user,
                    authStatus: "authenticated",
                    isBootstrappingAuth: false,
                    activationContext: null,
                    lockedAccount: null,
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
                } catch (profileErr: unknown) {
                  const profileApiErr = extractApiError(profileErr);
                  if (
                    profileApiErr.statusCode !== 401 &&
                    profileApiErr.statusCode !== 403
                  ) {
                    // Network/server error on profile fetch, but we have a fresh
                    // token — restore from persisted user rather than logging out.
                    const cachedUser = get().user;
                    set({
                      user: cachedUser,
                      authStatus: "authenticated",
                      isBootstrappingAuth: false,
                      activationContext: null,
                      lockedAccount: null,
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
                  }
                  // 401/403 with a fresh token = genuine session invalidation,
                  // fall through to logout below.
                }
              }

              // If the refresh itself failed due to a network/server error,
              // do NOT clear the stored refresh token — the session may still be
              // valid and will be retried on the next page load.
              if (bootstrapRefreshError !== null) {
                const refreshApiErr = extractApiError(bootstrapRefreshError);
                if (
                  refreshApiErr.isNetworkError ||
                  refreshApiErr.statusCode === 0 ||
                  refreshApiErr.statusCode === 408 ||
                  refreshApiErr.statusCode === 429 ||
                  refreshApiErr.statusCode >= 500
                ) {
                  set({
                    user: null,
                    authStatus: "anonymous",
                    isBootstrappingAuth: false,
                    activationContext: null,
                    lockedAccount: null,
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

            // Definitive auth failure — clear everything and redirect to login.
            runClientLogoutCleanup("bootstrap_auth_failed");
            set({
              user: null,
              authStatus: "anonymous",
              isBootstrappingAuth: false,
              activationContext: null,
              lockedAccount: null,
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

        handleAuthFailure: async (input = "refresh_failed") => {
          const normalized =
            typeof input === "string" ? { reason: input } : input;

          const definitive =
            normalized.definitive ??
            !TRANSIENT_AUTH_FAILURE_REASONS.has(normalized.reason);

          // Transient failures keep the session intact: do not clear tokens,
          // do not redirect, do not broadcast a logout to other tabs.
          if (!definitive) {
            set({ isLoading: false, isBootstrappingAuth: false });
            return;
          }

          await runLogoutFlow({
            reason: normalized.reason,
            notifyServer: false,
            broadcast: normalized.broadcast ?? true,
            redirect: normalized.redirect ?? true,
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
        authStatus: state.authStatus,
        activationContext: state.activationContext,
        lockedAccount: state.lockedAccount,
        pendingVerificationEmail: state.pendingVerificationEmail,
        pendingVerificationSource: state.pendingVerificationSource,
        emailVerificationChallenge: state.emailVerificationChallenge,
        isAuthenticated: state.isAuthenticated,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AuthState> & {
          authStatus?: PersistedAuthStatus;
        };
        const merged = {
          ...currentState,
          ...persisted,
        };

        return {
          ...merged,
          authStatus: normalizePersistedAuthStatus(
            persisted.authStatus,
            persisted.lockedAccount ?? null,
          ),
          isAuthenticated:
            normalizePersistedAuthStatus(
              persisted.authStatus,
              persisted.lockedAccount ?? null,
            ) === "authenticated",
        };
      },
    },
  ),
);

setAuthFailureHandler((reason) => {
  void useAuthStore.getState().handleAuthFailure(reason);
});

initializeAuthSync((reason) => {
  void useAuthStore.getState().handleRemoteLogout(reason);
});
