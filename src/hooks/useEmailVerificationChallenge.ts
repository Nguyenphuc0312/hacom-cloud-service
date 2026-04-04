import { useEffect, useMemo } from "react";
import type { EmailVerificationChallengeSnapshot } from "../stores/authStore";
import { useAuthStore } from "../stores/authStore";

const AUTH_STORAGE_KEY = "auth-storage";

interface PersistedAuthState {
  state?: {
    pendingVerificationEmail?: string | null;
    emailVerificationChallenge?: unknown;
  };
}

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeVerificationState = (
  value: unknown,
): EmailVerificationChallengeSnapshot["verificationState"] => {
  switch (value) {
    case "expired":
    case "invalidated":
    case "locked":
    case "verified":
    case "recoverable_error":
    case "missing_context":
    case "pending_otp":
      return value;
    default:
      return "pending_otp";
  }
};

const normalizeChallengeSnapshot = (
  value: unknown,
): EmailVerificationChallengeSnapshot | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EmailVerificationChallengeSnapshot>;
  const challengeId =
    typeof candidate.challengeId === "string"
      ? candidate.challengeId.trim()
      : "";
  const email = normalizeEmail(candidate.email);
  const expiresAt =
    typeof candidate.expiresAt === "string" ? candidate.expiresAt : "";
  const resendAvailableAt =
    typeof candidate.resendAvailableAt === "string"
      ? candidate.resendAvailableAt
      : "";

  if (!challengeId || !email || !expiresAt || !resendAvailableAt) {
    return null;
  }

  return {
    challengeId,
    email,
    expiresAt,
    resendAvailableAt,
    purpose: "signup",
    verificationState: normalizeVerificationState(candidate.verificationState),
    lockedReason:
      typeof candidate.lockedReason === "string"
        ? candidate.lockedReason
        : null,
    attemptCount:
      typeof candidate.attemptCount === "number"
        ? candidate.attemptCount
        : null,
    maxAttempts:
      typeof candidate.maxAttempts === "number" ? candidate.maxAttempts : null,
    lastResolvedAt:
      typeof candidate.lastResolvedAt === "string"
        ? candidate.lastResolvedAt
        : null,
  };
};

const readPersistedAuthState = (): PersistedAuthState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PersistedAuthState;
  } catch {
    return null;
  }
};

export const useEmailVerificationChallenge = () => {
  const pendingVerificationEmail = useAuthStore(
    (state) => state.pendingVerificationEmail,
  );
  const emailVerificationChallenge = useAuthStore(
    (state) => state.emailVerificationChallenge,
  );
  const setPendingVerificationEmail = useAuthStore(
    (state) => state.setPendingVerificationEmail,
  );
  const clearPendingVerificationEmail = useAuthStore(
    (state) => state.clearPendingVerificationEmail,
  );
  const setEmailVerificationChallenge = useAuthStore(
    (state) => state.setEmailVerificationChallenge,
  );
  const clearEmailVerificationChallenge = useAuthStore(
    (state) => state.clearEmailVerificationChallenge,
  );

  const challengeContext = useMemo(
    () => ({
      pendingVerificationEmail,
      emailVerificationChallenge,
    }),
    [emailVerificationChallenge, pendingVerificationEmail],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromPersistedState = (nextValue: string | null): void => {
      if (!nextValue) {
        return;
      }

      try {
        const parsed = JSON.parse(nextValue) as PersistedAuthState;
        const normalizedPendingEmail = normalizeEmail(
          parsed.state?.pendingVerificationEmail,
        );
        const normalizedChallenge = normalizeChallengeSnapshot(
          parsed.state?.emailVerificationChallenge,
        );
        useAuthStore.setState({
          pendingVerificationEmail: normalizedPendingEmail,
          emailVerificationChallenge:
            normalizedChallenge &&
            (!normalizedPendingEmail ||
              normalizedChallenge.email === normalizedPendingEmail)
              ? normalizedChallenge
              : null,
        });
      } catch {
        // Ignore malformed persisted payloads.
      }
    };

    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      syncFromPersistedState(event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [emailVerificationChallenge]);

  return {
    ...challengeContext,
    setPendingVerificationEmail,
    clearPendingVerificationEmail,
    setEmailVerificationChallenge,
    clearEmailVerificationChallenge,
    refreshFromStorage: () => {
      const persisted = readPersistedAuthState();
      if (!persisted) {
        return;
      }

      useAuthStore.setState({
        pendingVerificationEmail: normalizeEmail(
          persisted.state?.pendingVerificationEmail,
        ),
        emailVerificationChallenge: normalizeChallengeSnapshot(
          persisted.state?.emailVerificationChallenge,
        ),
      });
    },
  };
};

export default useEmailVerificationChallenge;
