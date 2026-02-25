/**
 * @fileoverview Register Page - Fully Responsive
 * Fix: scroll đúng ở 125% display scaling, mọi màn hình & tỉ lệ
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

/* ─── Debounce Hook ─── */

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
};

/* ─── Main Page ─── */

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    register: registerUser,
    isLoading,
    isAuthenticated,
    error,
    clearError,
  } = useAuthStore();

  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: "" });

  useEffect(() => {
    if (isAuthenticated) navigate("/chat", { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    clearError();
  }, [clearError]);

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
      acceptTerms: undefined as unknown as true,
    },
    mode: "onChange",
  });

  const password = watch("password");
  const username = watch("username");
  const debouncedUsername = useDebounce(username, 500);

  useEffect(() => {
    setFocus("username");
  }, [setFocus]);

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus({ checking: false, available: null, message: "" });
      return;
    }
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
      setUsernameStatus({ checking: false, available: true, message: "" });
    }
  }, []);

  useEffect(() => {
    checkUsername(debouncedUsername);
  }, [debouncedUsername, checkUsername]);

  const onSubmit = async (data: RegisterFormData) => {
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
      toast.error((err as Error).message ?? "Đăng ký thất bại");
    }
  };

  return (
    /**
     * ROOT WRAPPER — fix 125% zoom scroll (xem giải thích chi tiết ở LoginPage)
     *
     * grid + place-items-center + [min-height:100dvh] + overflow-y-auto
     * = căn giữa khi đủ chỗ, scroll tự nhiên khi không đủ chỗ.
     *
     * RegisterPage đặc biệt cần fix này vì form dài hơn LoginPage nhiều,
     * rất dễ bị clip ở 125% zoom trên màn 768px–900px.
     */
    <div
      className={clsx(
        "relative isolate",
        "grid place-items-center", // căn giữa cả x & y
        "[min-height:100dvh]", // row mở rộng, không bị clip
        "overflow-y-auto", // scroll khi zoom lớn / form dài
        "bg-gradient-to-br from-primary/10 via-background to-secondary/10",
        "px-4 py-8 sm:py-10",
      )}
    >
      {/* Decoration blobs */}
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-40 -left-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-secondary/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      {/* Card container */}
      <div className="relative z-10 w-full mx-auto max-w-sm xs:max-w-sm sm:max-w-lg lg:max-w-xl">
        {/* White card */}
        <section
          aria-label="Đăng ký tài khoản"
          className="bg-surface rounded-2xl shadow-xl border border-border animate-fade-in p-5 xs:p-6 sm:p-8 lg:p-10"
        >
          {/* Header */}
          <header className="text-center mb-5 sm:mb-6 lg:mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl mb-3 sm:mb-4 shadow-lg shadow-elev2 bg-primary w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16">
              <ChatBubbleLeftRightIcon className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 text-text-inverse" />
            </div>
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-text-primary leading-tight">
              Tạo tài khoản mới
            </h1>
            <p className="text-xs xs:text-sm sm:text-base text-text-muted mt-1 sm:mt-2">
              Tham gia cộng đồng Hacom Chat ngay hôm nay
            </p>
          </header>

          {/* Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-3 xs:space-y-4 sm:space-y-5"
          >
            {/* Global error */}
            <div
              className={clsx(
                "transition-all duration-200 overflow-hidden",
                error ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
              )}
              aria-live="polite"
            >
              {error && (
                <div
                  role="alert"
                  className="p-3 sm:p-4 bg-danger/15 border border-danger/35 rounded-xl text-danger text-xs xs:text-sm animate-shake"
                >
                  {error}
                </div>
              )}
            </div>

            {/* Name row
             * < 360px → 1 cột (mỗi ô ~280px, dễ nhập)
             * ≥ 360px → 2 cột như thiết kế gốc
             */}
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4">
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
            <div className="space-y-1">
              <Input
                {...register("username")}
                label="Tên người dùng"
                placeholder="username"
                leftIcon={<UserIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                error={errors.username?.message}
                autoComplete="username"
                disabled={isLoading}
                rightIcon={
                  usernameStatus.checking ? (
                    <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
                  ) : usernameStatus.available === true ? (
                    <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                  ) : usernameStatus.available === false ? (
                    <XCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-danger" />
                  ) : null
                }
              />
              {/* Username status — transition tránh layout shift */}
              <div
                className={clsx(
                  "transition-all duration-150 overflow-hidden",
                  usernameStatus.message && !errors.username
                    ? "max-h-8 opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <p
                  className={clsx(
                    "text-xs xs:text-xs",
                    usernameStatus.available === true && "text-success",
                    usernameStatus.available === false && "text-danger",
                    usernameStatus.checking && "text-text-muted",
                  )}
                >
                  {usernameStatus.message}
                </p>
              </div>
            </div>

            {/* Email */}
            <Input
              {...register("email")}
              type="email"
              label="Email"
              placeholder="you@example.com"
              leftIcon={<EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.email?.message}
              autoComplete="email"
              inputMode="email"
              disabled={isLoading}
            />

            {/* Password + Strength */}
            <div className="space-y-2">
              <Input
                {...register("password")}
                type="password"
                label="Mật khẩu"
                placeholder="••••••••"
                leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                error={errors.password?.message}
                autoComplete="new-password"
                disabled={isLoading}
              />
              <PasswordStrength password={password ?? ""} />
            </div>

            {/* Confirm Password */}
            <Input
              {...register("confirmPassword")}
              type="password"
              label="Xác nhận mật khẩu"
              placeholder="••••••••"
              leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={isLoading}
            />

            {/* Terms checkbox */}
            <Checkbox
              {...register("acceptTerms")}
              label={
                <span className="text-xs xs:text-sm leading-snug">
                  Tôi đồng ý với{" "}
                  <Link
                    to="/terms"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Điều khoản sử dụng
                  </Link>{" "}
                  và{" "}
                  <Link
                    to="/privacy"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Chính sách bảo mật
                  </Link>
                </span>
              }
              error={errors.acceptTerms?.message}
              disabled={isLoading}
            />

            {/* Submit */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading || isSubmitting}
              disabled={
                isLoading || isSubmitting || usernameStatus.available === false
              }
              aria-busy={isLoading || isSubmitting}
            >
              Đăng ký
            </Button>
          </form>

          {/* Login link */}
          <p className="mt-5 sm:mt-6 lg:mt-8 text-center text-xs xs:text-sm text-text-muted">
            Đã có tài khoản?{" "}
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Đăng nhập ngay
            </Link>
          </p>
        </section>

        {/* Footer */}
        <p className="mt-4 sm:mt-5 text-center text-xs xs:text-xs text-text-muted px-2 leading-relaxed">
          Thông tin của bạn được bảo mật theo{" "}
          <Link
            to="/privacy"
            className="underline hover:text-text-secondary transition-colors"
          >
            Chính sách bảo mật
          </Link>{" "}
          của chúng tôi.
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;



