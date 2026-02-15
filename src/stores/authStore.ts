/**
 * @fileoverview Auth Store (Zustand)
 * Quản lý state xác thực người dùng
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import apiClient, { storeTokens, clearTokens } from "../lib/axios";
import type { ApiResponse } from "../lib/axios";
import type { LoginFormData, RegisterFormData } from "../lib/validations";
import { AUTH_CONFIG } from "../config";

// ============================================
// TYPES
// ============================================

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  status: "online" | "offline" | "away" | "dnd";
  role?: string;
  isVerified?: boolean;
  createdAt?: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (data: LoginFormData) => Promise<void>;
  register: (
    data: Omit<RegisterFormData, "confirmPassword" | "acceptTerms">,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  updateStatus: (status: User["status"]) => Promise<void>;
  clearError: () => void;
  initialize: () => Promise<void>;
}

// ============================================
// STORE
// ============================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      /**
       * Đăng nhập
       */
      login: async (data: LoginFormData) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.post<ApiResponse<AuthResponse>>(
            "/auth/login",
            {
              email: data.email,
              password: data.password,
            },
          );

          const { user, accessToken, refreshToken } = response.data.data;

          // Lưu tokens
          storeTokens(accessToken, refreshToken, data.rememberMe);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const errorMessage =
            (
              error as {
                response?: { data?: { error?: { message?: string } } };
              }
            )?.response?.data?.error?.message || "Đăng nhập thất bại";
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
            user: null,
          });
          throw new Error(errorMessage);
        }
      },

      /**
       * Đăng ký
       */
      register: async (data) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.post<ApiResponse<AuthResponse>>(
            "/auth/register",
            data,
          );

          const { user, accessToken, refreshToken } = response.data.data;

          // Lưu tokens (mặc định không remember)
          storeTokens(accessToken, refreshToken, false);

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const errorMessage =
            (
              error as {
                response?: { data?: { error?: { message?: string } } };
              }
            )?.response?.data?.error?.message || "Đăng ký thất bại";
          set({
            isLoading: false,
            error: errorMessage,
          });
          throw new Error(errorMessage);
        }
      },

      /**
       * Đăng xuất
       */
      logout: async () => {
        set({ isLoading: true });

        try {
          await apiClient.post("/auth/logout");
        } catch {
          // Bỏ qua lỗi logout, vẫn clear local state
        } finally {
          clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      /**
       * Lấy thông tin user hiện tại
       */
      refreshUser: async () => {
        const token =
          localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
          sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);

        if (!token) {
          set({ isInitialized: true });
          return;
        }

        set({ isLoading: true });

        try {
          const response = await apiClient.get<ApiResponse<User>>("/auth/me");
          set({
            user: response.data.data,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
          });
        } catch {
          clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
          });
        }
      },

      /**
       * Cập nhật user trong state (local)
       */
      updateUser: (data: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...data } });
        }
      },

      /**
       * Cập nhật status online
       */
      updateStatus: async (status: User["status"]) => {
        try {
          await apiClient.put("/users/status", { status });
          const currentUser = get().user;
          if (currentUser) {
            set({ user: { ...currentUser, status } });
          }
        } catch (error: unknown) {
          const errorMessage =
            (
              error as {
                response?: { data?: { error?: { message?: string } } };
              }
            )?.response?.data?.error?.message || "Cập nhật status thất bại";
          throw new Error(errorMessage);
        }
      },

      /**
       * Xóa error
       */
      clearError: () => set({ error: null }),

      /**
       * Khởi tạo auth state từ storage
       */
      initialize: async () => {
        const token =
          localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
          sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);

        if (token) {
          await get().refreshUser();
        } else {
          set({ isInitialized: true });
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
