import type { ApiResponse } from "@hacom/chat-shared-types";
import { authClient } from "../../../lib/axios";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { AUTH_ENDPOINTS } from "../../../lib/authEndpoints";

export interface ActivationOtpRequestPayload {
  activationTicket: string;
}

export interface ActivationOtpRequestResult {
  sent: boolean;
  maskedEmail: string | null;
  resendAvailableAt: string | null;
  nextAction: "VERIFY_OTP" | "SET_PASSWORD";
}

export interface ActivationVerifyPayload {
  activationTicket: string;
  otp?: string;
  password?: string;
  confirmPassword?: string;
  verificationProof?: string;
}

export interface ActivationVerifyResult {
  user?: unknown;
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const resolveAuthEndpoint = (
  knownKey:
    | "activationRequest"
    | "activationResend"
    | "activationVerify"
    | "setInitialPassword",
  fallbackPath: string,
): string => {
  const knownEndpoints = AUTH_ENDPOINTS as Record<string, unknown>;
  const endpoint = asString(knownEndpoints[knownKey]);
  return endpoint || fallbackPath;
};

const normalizeActivationOtpResult = (
  payload: unknown,
): ActivationOtpRequestResult => {
  const record = asRecord(payload) || {};

  return {
    sent: Boolean(record.sent ?? true),
    maskedEmail: asString(record.maskedEmail) || asString(record.masked_email),
    resendAvailableAt:
      asString(record.resendAvailableAt) ||
      asString(record.resend_available_at),
    nextAction:
      record.nextAction === "SET_PASSWORD" ? "SET_PASSWORD" : "VERIFY_OTP",
  };
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
    const response = await authClient.post<ApiResponse<unknown>>(
      resolveAuthEndpoint("activationResend", "/activation/resend"),
      payload,
    );
    return normalizeActivationOtpResult(unwrapApiSuccess(response.data));
  },

  verifyOtp: async (
    payload: ActivationVerifyPayload,
  ): Promise<ActivationVerifyResult> => {
    const response = await authClient.post<ApiResponse<ActivationVerifyResult>>(
      resolveAuthEndpoint("activationVerify", "/activation/verify"),
      payload,
    );
    return unwrapApiSuccess(response.data);
  },

  setInitialPassword: async (
    payload: ActivationVerifyPayload,
  ): Promise<ActivationVerifyResult> => {
    const explicitEndpoint = resolveAuthEndpoint(
      "setInitialPassword",
      "/activation/set-password",
    );

    try {
      const response = await authClient.post<
        ApiResponse<ActivationVerifyResult>
      >(explicitEndpoint, payload);
      return unwrapApiSuccess(response.data);
    } catch {
      // Backward-compatible fallback: some backends complete password step via /activation/verify.
      const response = await authClient.post<
        ApiResponse<ActivationVerifyResult>
      >(resolveAuthEndpoint("activationVerify", "/activation/verify"), payload);
      return unwrapApiSuccess(response.data);
    }
  },
};
