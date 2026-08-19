import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../components/ui";
import { useAuthStore } from "../stores";

interface UseLogoutReturn {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
}

export const useLogout = (): UseLogoutReturn => {
  const { t } = useTranslation();
  const storeLogout = useAuthStore((state) => state.logout);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isMountedRef = useRef(true);
  const logoutInFlightRef = useRef(false);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const logout = useCallback(async () => {
    if (logoutInFlightRef.current) {
      return;
    }

    logoutInFlightRef.current = true;
    if (isMountedRef.current) {
      setIsLoggingOut(true);
    }

    try {
      await storeLogout();
      toast.success(t("chat:toast.logoutSuccess"));
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t("error:auth.logoutFailed");
      toast.error(message);
      throw error;
    } finally {
      logoutInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsLoggingOut(false);
      }
    }
  }, [storeLogout, t]);

  return {
    logout,
    isLoggingOut,
  };
};

export default useLogout;
