/**
 * @fileoverview Register Page
 * Trang đăng ký với form validation, password strength, username check
 */

import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import {
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Input,
  Checkbox,
  toast,
  PasswordStrength,
} from "../components/ui";
import { registerSchema } from "../lib/validations";
import type { RegisterFormData } from "../lib/validations";
import { useAuthStore } from "../stores";
import apiClient from "../lib/axios";

// Debounce utility
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    register: registerUser,
    isLoading,
    isAuthenticated,
    error,
    clearError,
  } = useAuthStore();

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({
    checking: false,
    available: null,
    message: "",
  });

  // Redirect nếu đã đăng nhập
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Clear error khi mount
  useEffect(() => {
    clearError();
  }, [clearError]);

  // React Hook Form
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      acceptTerms: undefined as unknown as true, // Will be validated to true before submit
    },
    mode: "onChange",
  });

  // Watch password và username
  const password = watch("password");
  const username = watch("username");
  const debouncedUsername = useDebounce(username, 500);

  // Auto-focus username input
  useEffect(() => {
    setFocus("username");
  }, [setFocus]);

  // Check username availability
  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus({
        checking: false,
        available: null,
        message: "",
      });
      return;
    }

    // Validate format first
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameStatus({
        checking: false,
        available: false,
        message: "Chỉ được dùng chữ cái, số và dấu gạch dưới",
      });
      return;
    }

    setUsernameStatus({
      checking: true,
      available: null,
      message: "Đang kiểm tra...",
    });

    try {
      // API check username availability
      const response = await apiClient.get(`/users/check-username/${value}`);
      const isAvailable = response.data.data?.available ?? true;

      setUsernameStatus({
        checking: false,
        available: isAvailable,
        message: isAvailable
          ? "Tên người dùng khả dụng"
          : "Tên người dùng đã tồn tại",
      });
    } catch {
      // Nếu API lỗi, giả sử available (hoặc bỏ qua check)
      setUsernameStatus({
        checking: false,
        available: true,
        message: "",
      });
    }
  }, []);

  // Trigger username check
  useEffect(() => {
    checkUsername(debouncedUsername);
  }, [debouncedUsername, checkUsername]);

  // Submit handler
  const onSubmit = async (data: RegisterFormData) => {
    // Check username available trước khi submit
    if (usernameStatus.available === false) {
      toast.error("Tên người dùng đã tồn tại");
      return;
    }

    try {
      await registerUser({
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      toast.success("Đăng ký thành công! Chào mừng bạn đến với Hacom Chat");
      navigate("/chat", { replace: true });
    } catch (err) {
      toast.error((err as Error).message || "Đăng ký thất bại");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-telegram-primary/5 via-white to-telegram-secondary/5 px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-telegram-secondary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-telegram-primary/10 rounded-full blur-3xl" />
      </div>

      {/* Register card */}
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 animate-fade-in">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-telegram-primary rounded-2xl mb-4 shadow-lg shadow-telegram-primary/30">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tạo tài khoản mới
            </h1>
            <p className="text-gray-500 mt-2">
              Tham gia cộng đồng Hacom Chat ngay hôm nay
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Global error */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm animate-shake">
                {error}
              </div>
            )}

            {/* Name row */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                {...register("firstName")}
                label="Họ"
                placeholder="Nguyễn"
                error={errors.firstName?.message}
                disabled={isLoading}
              />
              <Input
                {...register("lastName")}
                label="Tên"
                placeholder="Văn A"
                error={errors.lastName?.message}
                disabled={isLoading}
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Input
                {...register("username")}
                label="Tên người dùng"
                placeholder="username"
                leftIcon={<UserIcon className="w-5 h-5" />}
                error={errors.username?.message}
                autoComplete="username"
                disabled={isLoading}
                rightIcon={
                  usernameStatus.checking ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-telegram-primary rounded-full animate-spin" />
                  ) : usernameStatus.available === true ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : usernameStatus.available === false ? (
                    <XCircleIcon className="w-5 h-5 text-red-500" />
                  ) : null
                }
              />
              {/* Username status message */}
              {usernameStatus.message && !errors.username && (
                <p
                  className={clsx(
                    "text-xs",
                    usernameStatus.available === true && "text-green-600",
                    usernameStatus.available === false && "text-red-600",
                    usernameStatus.checking && "text-gray-500",
                  )}
                >
                  {usernameStatus.message}
                </p>
              )}
            </div>

            {/* Email */}
            <Input
              {...register("email")}
              type="email"
              label="Email"
              placeholder="you@example.com"
              leftIcon={<EnvelopeIcon className="w-5 h-5" />}
              error={errors.email?.message}
              autoComplete="email"
              disabled={isLoading}
            />

            {/* Password */}
            <div className="space-y-2">
              <Input
                {...register("password")}
                type="password"
                label="Mật khẩu"
                placeholder="••••••••"
                leftIcon={<LockClosedIcon className="w-5 h-5" />}
                error={errors.password?.message}
                autoComplete="new-password"
                disabled={isLoading}
              />
              {/* Password strength indicator */}
              <PasswordStrength password={password || ""} />
            </div>

            {/* Confirm Password */}
            <Input
              {...register("confirmPassword")}
              type="password"
              label="Xác nhận mật khẩu"
              placeholder="••••••••"
              leftIcon={<LockClosedIcon className="w-5 h-5" />}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={isLoading}
            />

            {/* Terms checkbox */}
            <Checkbox
              {...register("acceptTerms")}
              label={
                <span>
                  Tôi đồng ý với{" "}
                  <Link
                    to="/terms"
                    className="text-telegram-primary hover:underline"
                    target="_blank"
                  >
                    Điều khoản sử dụng
                  </Link>{" "}
                  và{" "}
                  <Link
                    to="/privacy"
                    className="text-telegram-primary hover:underline"
                    target="_blank"
                  >
                    Chính sách bảo mật
                  </Link>
                </span>
              }
              error={errors.acceptTerms?.message}
              disabled={isLoading}
            />

            {/* Submit button */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading || isSubmitting}
              disabled={
                isLoading || isSubmitting || usernameStatus.available === false
              }
            >
              Đăng ký
            </Button>
          </form>

          {/* Login link */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Đã có tài khoản?{" "}
            <Link
              to="/login"
              className="font-semibold text-telegram-primary hover:text-telegram-primary/80"
            >
              Đăng nhập ngay
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
