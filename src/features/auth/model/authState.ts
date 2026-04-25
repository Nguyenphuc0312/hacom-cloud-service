import { ErrorCode } from "@hacom/chat-shared-types/core";

export type AuthStatus =
  | "idle"
  | "loading"
  | "anonymous"
  | "authenticated"
  | "activation_required"
  | "verifying_activation"
  | "locked"
  | "disabled"
  | "bootstrap_error";

export type PersistedAuthStatus =
  | AuthStatus
  | "authenticating"
  | "otp_verifying"
  | "locked_or_disabled";

export type ActivationNextAction = "VERIFY_OTP" | "SET_PASSWORD";

export interface ActivationContext {
  activationTicket: string;
  maskedEmail: string | null;
  nextAction: ActivationNextAction;
  verificationProof?: string | null;
  requiresPasswordSetup?: boolean;
  resendAvailableAt?: string | null;
}

export interface LockedAccountContext {
  status: "locked" | "disabled";
  code: string;
  message: string;
}

export const isAuthenticatedStatus = (status: AuthStatus): boolean =>
  status === "authenticated";

export const isBlockedAuthStatus = (status: AuthStatus): boolean =>
  status === "locked" || status === "disabled";

export const resolveLockedAccountStatus = (
  code: string | null | undefined,
): LockedAccountContext["status"] =>
  code === ErrorCode.ACCOUNT_DISABLED ? "disabled" : "locked";

export const normalizePersistedAuthStatus = (
  status: PersistedAuthStatus | null | undefined,
  lockedAccount?: LockedAccountContext | null,
): AuthStatus => {
  if (!status) {
    return "anonymous";
  }

  if (status === "authenticating") {
    return "loading";
  }

  if (status === "otp_verifying") {
    return "verifying_activation";
  }

  if (status === "locked_or_disabled") {
    return lockedAccount?.status ?? "locked";
  }

  return status;
};
