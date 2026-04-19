import axios from "axios";
import { ErrorCode, type ApiFailure } from "@hacom/chat-shared-types/core";
import type {
  ActivationContext,
  ActivationNextAction,
} from "../model/authState";
import { resolveLockedAccountStatus } from "../model/authState";

interface ApiErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export type AuthFailureKind =
  | "activation_required"
  | "locked"
  | "disabled"
  | "otp_invalid"
  | "otp_expired"
  | "otp_rate_limited"
  | "unknown";

export interface AuthFailureResolution {
  kind: AuthFailureKind;
  code: string;
  message: string;
  activationContext?: ActivationContext;
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

const resolveActivationNextAction = (value: unknown): ActivationNextAction =>
  value === "SET_PASSWORD" ? "SET_PASSWORD" : "VERIFY_OTP";

const readApiFailureEnvelope = (error: unknown): ApiErrorEnvelope | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const payload = error.response?.data as ApiFailure | undefined;
  if (!payload || payload.success !== false) {
    return null;
  }

  return {
    statusCode: payload.statusCode,
    code: payload.error.code,
    message: payload.message,
    details: payload.error.details,
  };
};

const resolveActivationContext = (
  envelope: ApiErrorEnvelope,
): ActivationContext | null => {
  if (envelope.code !== ErrorCode.ACCOUNT_ACTIVATION_REQUIRED) {
    return null;
  }

  const details = asRecord(envelope.details);
  const activationTicket =
    asString(details?.activationTicket) ||
    asString(details?.ticket) ||
    asString(details?.activation_token);

  if (!activationTicket) {
    return null;
  }

  return {
    activationTicket,
    maskedEmail:
      asString(details?.maskedEmail) || asString(details?.masked_email),
    nextAction: resolveActivationNextAction(
      details?.nextAction ?? details?.next_action,
    ),
    requiresPasswordSetup:
      details?.requiresPasswordSetup === true ||
      details?.requires_password_setup === true,
    resendAvailableAt:
      asString(details?.resendAvailableAt) ||
      asString(details?.resend_available_at),
  };
};

export const mapAuthErrorMessage = (
  code: string,
  fallbackMessage: string,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (!t) {
    return fallbackMessage;
  }

  if (code === ErrorCode.ACCOUNT_DISABLED) {
    return t("auth:activation.locked.accountDisabled");
  }

  if (code === ErrorCode.AUTH_ACCOUNT_LOCKED) {
    return t("auth:activation.locked.accountLocked");
  }

  if (code === ErrorCode.OTP_INVALID) {
    return t("auth:activation.verifyOtp.invalidCode");
  }

  if (code === ErrorCode.OTP_EXPIRED) {
    return t("auth:activation.verifyOtp.expiredCode");
  }

  if (
    code === ErrorCode.RATE_LIMITED ||
    code === ErrorCode.OTP_RESEND_BLOCKED ||
    code === ErrorCode.OTP_TOO_MANY_ATTEMPTS
  ) {
    return t("auth:activation.verifyOtp.rateLimited");
  }

  if (code === ErrorCode.USER_PROFILE_FORBIDDEN_FIELD) {
    return t("auth:activation.profileFieldForbidden");
  }

  return fallbackMessage;
};

export const resolveAuthFailure = (
  error: unknown,
  t?: (key: string, options?: Record<string, unknown>) => string,
): AuthFailureResolution => {
  const envelope = readApiFailureEnvelope(error);
  if (!envelope) {
    const fallbackMessage =
      error instanceof Error
        ? error.message
        : t?.("error:auth.loginFailed") || "Login failed";
    return {
      kind: "unknown",
      code: ErrorCode.INTERNAL_ERROR,
      message: fallbackMessage,
    };
  }

  const message = mapAuthErrorMessage(envelope.code, envelope.message, t);
  const activationContext = resolveActivationContext(envelope);

  if (activationContext) {
    return {
      kind: "activation_required",
      code: envelope.code,
      message,
      activationContext,
    };
  }

  if (
    envelope.code === ErrorCode.AUTH_ACCOUNT_LOCKED ||
    envelope.code === ErrorCode.ACCOUNT_DISABLED
  ) {
    const kind = resolveLockedAccountStatus(envelope.code);
    return {
      kind,
      code: envelope.code,
      message,
    };
  }

  if (envelope.code === ErrorCode.OTP_INVALID) {
    return {
      kind: "otp_invalid",
      code: envelope.code,
      message,
    };
  }

  if (envelope.code === ErrorCode.OTP_EXPIRED) {
    return {
      kind: "otp_expired",
      code: envelope.code,
      message,
    };
  }

  if (
    envelope.code === ErrorCode.RATE_LIMITED ||
    envelope.code === ErrorCode.OTP_RESEND_BLOCKED ||
    envelope.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS
  ) {
    return {
      kind: "otp_rate_limited",
      code: envelope.code,
      message,
    };
  }

  return {
    kind: "unknown",
    code: envelope.code,
    message,
  };
};
