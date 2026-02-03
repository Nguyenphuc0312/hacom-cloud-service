/**
 * @fileoverview useAuth hook
 * Custom hook cho authentication operations
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores";
import type { User } from "../stores";
import { disconnectSocket } from "../lib/socket";
import { toast } from "../components/ui";
import type { LoginFormData, RegisterFormData } from "../lib/validations";

export interface UseAuthReturn {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
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
    logout: storeLogout,
    updateStatus: storeUpdateStatus,
    clearError,
  } = useAuthStore();

  // Login với navigation
  const login = useCallback(
    async (data: LoginFormData) => {
      await storeLogin(data);
      navigate("/chat", { replace: true });
    },
    [storeLogin, navigate],
  );

  // Register với navigation
  const register = useCallback(
    async (data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">) => {
      await storeRegister(data);
      navigate("/chat", { replace: true });
    },
    [storeRegister, navigate],
  );

  // Logout với cleanup
  const logout = useCallback(async () => {
    // Disconnect socket trước
    disconnectSocket();

    // Logout from store
    await storeLogout();

    // Navigate to login
    navigate("/login", { replace: true });

    toast.success("Đã đăng xuất");
  }, [storeLogout, navigate]);

  // Update status
  const updateStatus = useCallback(
    async (status: User["status"]) => {
      try {
        await storeUpdateStatus(status);
        toast.success(`Đã cập nhật trạng thái: ${getStatusLabel(status)}`);
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

// Helper function to get status label
const getStatusLabel = (status: User["status"]): string => {
  const labels: Record<User["status"], string> = {
    online: "Trực tuyến",
    offline: "Ngoại tuyến",
    away: "Vắng mặt",
    dnd: "Không làm phiền",
  };
  return labels[status];
};

export default useAuth;
