export type AuthStatus =
  | "anonymous"
  | "authenticating"
  | "activation_required"
  | "otp_verifying"
  | "authenticated"
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
  code: string;
  message: string;
}

export const isAuthenticatedStatus = (status: AuthStatus): boolean =>
  status === "authenticated";
