import axios from "axios";
import { ErrorCode } from "@hacom/chat-shared-types/core";
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
  /** Số giây phải chờ trước khi thử lại (rate-limit), nếu backend cung cấp. */
  retryAfterSeconds?: number;
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
  /** Số giây phải chờ trước khi thử lại (rate-limit), nếu xác định được. */
  retryAfterSeconds?: number;
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

const asPositiveInt = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(asString(value));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
};

/**
 * Số giây phải chờ trước khi thử lại. Ưu tiên header `Retry-After`
 * (giây hoặc HTTP-date), sau đó tới các field trong details của envelope.
 */
const readRetryAfterSeconds = (
  headers: unknown,
  details: unknown,
): number | undefined => {
  const headerValue = asRecord(headers)?.["retry-after"];
  if (headerValue !== undefined && headerValue !== null) {
    const asSeconds = asPositiveInt(headerValue);
    if (asSeconds) {
      return asSeconds;
    }
    const asDate = Date.parse(String(headerValue));
    if (!Number.isNaN(asDate)) {
      const diff = Math.ceil((asDate - Date.now()) / 1000);
      if (diff > 0) {
        return diff;
      }
    }
  }

  const detailRecord = asRecord(details);
  if (detailRecord) {
    const fromSeconds =
      asPositiveInt(detailRecord.retryAfter) ??
      asPositiveInt(detailRecord.retryAfterSeconds) ??
      asPositiveInt(detailRecord.retry_after);
    if (fromSeconds) {
      return fromSeconds;
    }
    const fromMs =
      asPositiveInt(detailRecord.retryAfterMs) ??
      asPositiveInt(detailRecord.retry_after_ms);
    if (fromMs) {
      return Math.ceil(fromMs / 1000);
    }
  }

  return undefined;
};

const readApiFailureEnvelope = (error: unknown): ApiErrorEnvelope | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const response = error.response;
  if (!response) {
    return null;
  }

  const payload = asRecord(response.data);
  if (payload && payload.success === false) {
    // Hỗ trợ CẢ HAI shape envelope:
    //  - Chuẩn:  { success:false, statusCode, message, error:{ code, details } }
    //  - Phẳng:  { success:false, code, error:"<message>", details } (vd 429 RATE_LIMITED)
    const errorField = payload.error;
    const errorRecord = asRecord(errorField);

    const code =
      asString(payload.code) ?? asString(errorRecord?.code) ?? `HTTP_${response.status}`;
    const message =
      asString(payload.message) ??
      asString(typeof errorField === "string" ? errorField : errorRecord?.message) ??
      "";
    const details = payload.details ?? errorRecord?.details;
    const statusCode =
      asPositiveInt(payload.statusCode) ?? response.status;

    return {
      statusCode,
      code,
      message,
      details,
      retryAfterSeconds: readRetryAfterSeconds(response.headers, details),
    };
  }

  // Lỗi không có cờ success:false (vd: rate-limit từ throttler trả body
  // { statusCode, message }). Tổng hợp từ HTTP status để vẫn map đúng thông
  // báo theo trạng thái thay vì rơi về fallback "sai mật khẩu".
  return {
    statusCode: response.status,
    code: `HTTP_${response.status}`,
    message: asString(payload?.message) ?? "",
    details: payload,
    retryAfterSeconds: readRetryAfterSeconds(response.headers, payload),
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
  statusCode?: number,
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

  // Rate-limit theo NGỮ CẢNH OTP/gửi lại mã — giữ thông báo dành riêng cho OTP.
  if (
    code === ErrorCode.OTP_RESEND_BLOCKED ||
    code === ErrorCode.OTP_TOO_MANY_ATTEMPTS
  ) {
    return t("auth:activation.verifyOtp.rateLimited");
  }

  // Sai tài khoản/mật khẩu khi đăng nhập.
  if (
    code === ErrorCode.INVALID_CREDENTIALS ||
    code === ErrorCode.AUTH_INVALID_CREDENTIALS
  ) {
    return t("auth:login.invalidCredentials");
  }

  // Quá nhiều yêu cầu (đăng nhập): RATE_LIMITED / RATE_LIMIT_EXCEEDED hoặc bất
  // kỳ phản hồi HTTP 429 nào — KHÔNG được hiển thị thành "sai mật khẩu".
  if (
    statusCode === 429 ||
    code === ErrorCode.RATE_LIMITED ||
    code === ErrorCode.RATE_LIMIT_EXCEEDED
  ) {
    return t("auth:login.rateLimited");
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

  const message = mapAuthErrorMessage(
    envelope.code,
    envelope.message,
    t,
    envelope.statusCode,
  );
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
    envelope.statusCode === 429 ||
    envelope.code === ErrorCode.RATE_LIMITED ||
    envelope.code === ErrorCode.RATE_LIMIT_EXCEEDED ||
    envelope.code === ErrorCode.OTP_RESEND_BLOCKED ||
    envelope.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS
  ) {
    return {
      kind: "otp_rate_limited",
      code: envelope.code,
      message,
      retryAfterSeconds: envelope.retryAfterSeconds,
    };
  }

  return {
    kind: "unknown",
    code: envelope.code,
    message,
  };
};
