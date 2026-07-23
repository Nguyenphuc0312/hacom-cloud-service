import type { ApiResponse } from "@hacom/chat-shared-types/core";
import { authClient } from "../../../lib/axios";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { AUTH_ENDPOINTS } from "../../../lib/authEndpoints";
import { asRecord } from "../../../utils/payloadGuards";

export interface ActivationOtpRequestPayload {
  activationTicket: string;
}

export interface ActivationOtpRequestResult {
  sent: boolean;
  accepted: boolean;
  maskedEmail: string | null;
  resendAvailableAt: string | null;
  nextAction: "VERIFY_OTP" | "SET_PASSWORD";
}

export interface ActivationVerifyPayload {
  activationTicket: string;
  otp?: string;
  newPassword?: string;
  password?: string;
  confirmPassword?: string;
  verificationProof?: string;
}

export interface ActivationVerifyResult {
  user?: Record<string, unknown>;
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
  nextAction?: "VERIFY_OTP" | "SET_PASSWORD";
  requiresPasswordSetup?: boolean;
  verificationProof?: string | null;
}

export interface LoginPayload {
  loginIdentifier: string;
  email?: string;
  password: string;
  rememberMe?: boolean;
}

export interface NormalizedAuthResponse {
  user: Record<string, unknown>;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
}


const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
};

const normalizeAccessToken = (value: unknown): string | undefined =>
  asString(value) || undefined;

const normalizeUser = (value: unknown): Record<string, unknown> => {
  const user = asRecord(value) || {};
  const id = asString(user.id) || asString(user.userId) || "unknown-user";
  const username =
    asString(user.username) ||
    asString(user.fullName) ||
    asString(user.fullNameFromHr) ||
    asString(user.email) ||
    asString(user.employeeCode) ||
    asString(user.employee_code) ||
    id;

  return {
    ...user,
    id,
    username,
  };
};

const resolveAuthEndpoint = (
  knownKey: keyof typeof AUTH_ENDPOINTS,
  fallbackPath: string,
): string => {
  const endpoint = AUTH_ENDPOINTS[knownKey];
  return asString(endpoint) || fallbackPath;
};

export const normalizeAuthResponse = (
  payload: unknown,
): NormalizedAuthResponse => {
  const record = asRecord(payload) || {};
  const tokens = asRecord(record.tokens);
  const accessToken =
    normalizeAccessToken(tokens?.accessToken) ||
    normalizeAccessToken(record.accessToken);
  const refreshToken =
    normalizeAccessToken(tokens?.refreshToken) ||
    normalizeAccessToken(record.refreshToken);

  return {
    user: normalizeUser(record.user),
    message: asString(record.message) || undefined,
    accessToken,
    refreshToken,
    tokens:
      accessToken || refreshToken
        ? {
            accessToken,
            refreshToken,
          }
        : undefined,
  };
};

export const normalizeActivationOtpResult = (
  payload: unknown,
): ActivationOtpRequestResult => {
  const record = asRecord(payload) || {};

  return {
    sent: asBoolean(record.sent) ?? true,
    accepted: asBoolean(record.accepted) ?? true,
    maskedEmail: asString(record.maskedEmail) || asString(record.masked_email),
    resendAvailableAt:
      asString(record.resendAvailableAt) ||
      asString(record.resend_available_at),
    nextAction:
      record.nextAction === "SET_PASSWORD" ? "SET_PASSWORD" : "VERIFY_OTP",
  };
};

export const normalizeActivationVerifyPayload = (
  payload: ActivationVerifyPayload,
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {
    activationTicket: payload.activationTicket,
  };
  const otp = asString(payload.otp);
  const verificationProof = asString(payload.verificationProof);
  const newPassword = asString(payload.newPassword) || asString(payload.password);

  if (otp) {
    normalized.otp = otp;
  }

  if (newPassword) {
    normalized.newPassword = newPassword;
  }

  if (verificationProof) {
    normalized.verificationProof = verificationProof;
  }

  return normalized;
};

export const normalizeActivationVerifyResult = (
  payload: unknown,
): ActivationVerifyResult => {
  const normalizedAuth = normalizeAuthResponse(payload);
  const record = asRecord(payload) || {};

  return {
    user:
      Object.keys(normalizedAuth.user).length > 0 ? normalizedAuth.user : undefined,
    accessToken: normalizedAuth.accessToken,
    refreshToken: normalizedAuth.refreshToken,
    tokens: normalizedAuth.tokens,
    nextAction:
      record.nextAction === "SET_PASSWORD" ? "SET_PASSWORD" : "VERIFY_OTP",
    requiresPasswordSetup:
      asBoolean(record.requiresPasswordSetup) ??
      asBoolean(record.requires_password_setup) ??
      false,
    verificationProof:
      asString(record.verificationProof) ||
      asString(record.verification_proof),
  };
};

export const hasAuthenticatedSession = (payload: unknown): boolean => {
  const normalized = normalizeAuthResponse(payload);
  return Boolean(normalized.accessToken);
};

export const loginAuthApi = {
  login: async (payload: LoginPayload): Promise<NormalizedAuthResponse> => {
    const response = await authClient.post<ApiResponse<unknown>>(
      AUTH_ENDPOINTS.login,
      {
        loginIdentifier: payload.loginIdentifier,
        email: payload.email,
        password: payload.password,
        rememberMe: payload.rememberMe,
      },
    );

    const normalized = normalizeAuthResponse(unwrapApiSuccess(response.data));
    return {
      ...normalized,
      message: response.data.message || normalized.message,
    };
  },
};

export const activationAuthApi = {
  requestOtp: async (
    payload: ActivationOtpRequestPayload,
  ): Promise<ActivationOtpRequestResult> => {
    const response = await authClient.post<ApiResponse<unknown>>(
      resolveAuthEndpoint("activationRequest", "/activation/request"),
      payload,
    );
    return normalizeActivationOtpResult(unwrapApiSuccess(response.data));
  },

  resendOtp: async (
    payload: ActivationOtpRequestPayload,
  ): Promise<ActivationOtpRequestResult> => {
    // Backend currently reuses the same request endpoint for both initial send
    // and resend. Keep the call shape stable for the UI layer.
    return activationAuthApi.requestOtp(payload);
  },

  verifyOtp: async (
    payload: ActivationVerifyPayload,
  ): Promise<ActivationVerifyResult> => {
    const response = await authClient.post<ApiResponse<unknown>>(
      resolveAuthEndpoint("activationVerify", "/activation/verify"),
      normalizeActivationVerifyPayload(payload),
    );
    return normalizeActivationVerifyResult(unwrapApiSuccess(response.data));
  },

  setInitialPassword: async (
    payload: ActivationVerifyPayload,
  ): Promise<ActivationVerifyResult> => {
    const explicitEndpoint = resolveAuthEndpoint(
      "setInitialPassword",
      "/activation/set-password",
    );
    const requestBody = {
      activationTicket: payload.activationTicket,
      otp: asString(payload.otp) || undefined,
      password: asString(payload.password) || asString(payload.newPassword) || "",
      confirmPassword:
        asString(payload.confirmPassword) ||
        asString(payload.password) ||
        asString(payload.newPassword) ||
        "",
      verificationProof: asString(payload.verificationProof) || undefined,
    };

    try {
      const response = await authClient.post<ApiResponse<unknown>>(
        explicitEndpoint,
        requestBody,
      );
      return normalizeActivationVerifyResult(unwrapApiSuccess(response.data));
    } catch {
      // Backward-compatible fallback for environments that complete activation
      // via /activation/verify with otp + newPassword in one request.
      return activationAuthApi.verifyOtp(payload);
    }
  },
};
