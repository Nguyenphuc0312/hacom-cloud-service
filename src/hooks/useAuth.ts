/**
 * @fileoverview useAuth hook
 */

import { useCallback } from "react";
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
        toast.success(`Da cap nhat trang thai: ${getStatusLabel(status)}`);
      } catch (err) {
        toast.error((err as Error).message);
        throw err;
      }
    },
    [storeUpdateStatus],
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

const getStatusLabel = (status: User["status"]): string => {
  const labels: Record<User["status"], string> = {
    online: "Truc tuyen",
    offline: "Ngoai tuyen",
    away: "Vang mat",
    dnd: "Khong lam phien",
  };
  return labels[status];
};

export default useAuth;
