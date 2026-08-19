import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "../../stores/authStore";

interface AuthBootstrapProps {
  children: ReactNode;
}

/** The sole application-level owner of session restoration and /auth/me. */
export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const initialize = useAuthStore((state) => state.initialize);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
    }
  }, [initialize, isInitialized]);

  return <>{children}</>;
}
