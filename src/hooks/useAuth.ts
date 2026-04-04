/**
 * @fileoverview useAuth hook
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores";
import type { User } from "../stores";
import { toast } from "../components/ui";
import type { LoginFormData, RegisterFormData } from "../lib/validations";
import { useLogout } from "./useLogout";

export interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (data: LoginFormData) => Promise<void>;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateStatus: (status: User["status"]) => Promise<void>;
  clearError: () => void;
}

export const useAuth = (): UseAuthReturn => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: storeLogin,
    register: storeRegister,
    updateStatus: storeUpdateStatus,
    clearError,
  } = useAuthStore();
  const { logout } = useLogout();

  const login = useCallback(
    async (data: LoginFormData) => {
      await storeLogin(data);
      navigate("/chat", { replace: true });
    },
    [storeLogin, navigate],
  );

  const register = useCallback(
    async (data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">) => {
      await storeRegister(data);
      navigate("/chat", { replace: true });
    },
    [storeRegister, navigate],
  );

  const updateStatus = useCallback(
    async (status: User["status"]) => {
      try {
        await storeUpdateStatus(status);
        toast.success(
          t("chat:toast.statusUpdated", {
            status: getStatusLabel(status, t),
          }),
        );
      } catch (err) {
        toast.error((err as Error).message);
        throw err;
      }
    },
    [storeUpdateStatus, t],
  );

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    updateStatus,
    clearError,
  };
};

const getStatusLabel = (
  status: User["status"],
  t: (key: string) => string,
): string => {
  const labelMap: Record<string, string> = {
    online: "common:status.online",
    offline: "common:status.offline",
    away: "common:status.away",
    dnd: "common:status.dnd",
  };

  if (!status) {
    return t("common:status.offline");
  }

  return t(labelMap[status] || "common:status.offline");
};

export default useAuth;
