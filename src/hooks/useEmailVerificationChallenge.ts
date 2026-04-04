import { useEffect, useMemo } from "react";
import { useAuthStore } from "../stores/authStore";

const AUTH_STORAGE_KEY = "auth-storage";

interface PersistedAuthState {
  state?: {
    pendingVerificationEmail?: string | null;
    emailVerificationChallenge?: unknown;
  };
}

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
        useAuthStore.setState({
          pendingVerificationEmail:
            parsed.state?.pendingVerificationEmail ?? null,
          emailVerificationChallenge:
            (parsed.state?.emailVerificationChallenge as
              | typeof emailVerificationChallenge
              | null
              | undefined) ?? null,
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
        pendingVerificationEmail:
          persisted.state?.pendingVerificationEmail ?? null,
        emailVerificationChallenge:
          (persisted.state?.emailVerificationChallenge as
            | typeof emailVerificationChallenge
            | null
            | undefined) ?? null,
      });
    },
  };
};

export default useEmailVerificationChallenge;
