/**
 * @fileoverview Login Page - Fully Responsive
 * Fix: scroll đúng ở 125% display scaling, mọi màn hình & tỉ lệ
 */

import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import {
  EnvelopeIcon,
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, Checkbox, toast } from "../components/ui";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, isAuthenticated, error, clearError } =
    useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from ?? "/chat";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data);
      toast.success("Đăng nhập thành công!");
      const from = (location.state as { from?: string })?.from ?? "/chat";
      navigate(from, { replace: true });
    } catch (err) {
      toast.error((err as Error).message ?? "Đăng nhập thất bại");
    }
  };

  return (
    /**
     * ROOT WRAPPER — giải quyết vấn đề 125% zoom
     * ─────────────────────────────────────────────────────────────────
     * VẤN ĐỀ:
     *   flex + justify-center KHÔNG scroll được khi content > viewport.
     *   Browser tính chiều cao flex container = 100dvh, sau đó center con
     *   bên trong → nếu con cao hơn viewport, phần trên & dưới bị clip
     *   và KHÔNG có scrollbar.
     *
     * GIẢI PHÁP: CSS Grid
     *   • `grid` + `place-items-center` → card căn giữa cả ngang lẫn dọc
     *     khi viewport đủ cao (màn hình bình thường)
     *   • `min-height: 100dvh` (không phải height) → row tự mở rộng khi
     *     content cao hơn viewport → overflow-y-auto có thể scroll
     *   • Ở 125% zoom: viewport thu nhỏ ~20%, grid row tự giãn theo card,
     *     scroll hoạt động bình thường
     * ─────────────────────────────────────────────────────────────────
     */
    <div
      className={clsx(
        "relative isolate",
        "grid place-items-center", // ← căn giữa cả x & y
        "[min-height:100dvh]", // ← row mở rộng, không bị clip
        "overflow-y-auto", // ← scroll khi zoom lớn
        "bg-gradient-to-br from-telegram-primary/5 via-white to-telegram-secondary/5",
        // Padding: đảm bảo card không sát mép, kể cả khi zoom 125%+
        "px-4 py-8 sm:py-10",
      )}
    >
      {/* Decoration blobs */}
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-40 -right-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-telegram-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-telegram-secondary/10 rounded-full blur-3xl" />
      </div>

      {/* Card container — w-full + max-w để tự co giãn */}
      <div className="relative z-10 w-full mx-auto max-w-[360px] xs:max-w-sm sm:max-w-md lg:max-w-lg">
        {/* White card */}
        <section
          aria-label="Đăng nhập"
          className="bg-white rounded-2xl shadow-xl border border-gray-100 animate-fade-in p-5 xs:p-6 sm:p-8 lg:p-10"
        >
          {/* Header */}
          <header className="text-center mb-5 sm:mb-6 lg:mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl mb-3 sm:mb-4 shadow-lg shadow-telegram-primary/30 bg-telegram-primary w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16">
              <ChatBubbleLeftRightIcon className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
              Chào mừng trở lại
            </h1>
            <p className="text-xs xs:text-sm sm:text-base text-gray-500 mt-1 sm:mt-2">
              Đăng nhập để tiếp tục trò chuyện
            </p>
          </header>

          {/* Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-3 xs:space-y-4 sm:space-y-5"
          >
            {/* Global error — transition tránh layout shift */}
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
                  className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs xs:text-sm animate-shake"
                >
                  {error}
                </div>
              )}
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

            {/* Password */}
            <Input
              {...register("password")}
              type="password"
              label="Mật khẩu"
              placeholder="••••••••"
              leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={isLoading}
            />

            {/* Remember me & Forgot password */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Checkbox
                {...register("rememberMe")}
                label="Ghi nhớ đăng nhập"
                disabled={isLoading}
              />
              <Link
                to="/forgot-password"
                className="text-xs xs:text-sm text-telegram-primary font-medium hover:text-telegram-primary/80 transition-colors duration-200 sm:text-right whitespace-nowrap"
              >
                Quên mật khẩu?
              </Link>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading || isSubmitting}
              disabled={isLoading || isSubmitting}
              aria-busy={isLoading || isSubmitting}
            >
              Đăng nhập
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-5 sm:my-6 lg:my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs xs:text-sm">
              <span className="px-3 xs:px-4 bg-white text-gray-400">
                Hoặc đăng nhập với
              </span>
            </div>
          </div>

          {/* Social buttons */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 xs:gap-3 sm:gap-4">
            <SocialButton
              provider="google"
              onClick={() => toast.info("Tính năng đang phát triển")}
            />
            <SocialButton
              provider="facebook"
              onClick={() => toast.info("Tính năng đang phát triển")}
            />
          </div>

          {/* Sign-up link */}
          <p className="mt-5 sm:mt-6 lg:mt-8 text-center text-xs xs:text-sm text-gray-500">
            Chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-semibold text-telegram-primary hover:text-telegram-primary/80 transition-colors"
            >
              Đăng ký ngay
            </Link>
          </p>
        </section>

        {/* Footer */}
        <p className="mt-4 sm:mt-5 text-center text-[10px] xs:text-xs text-gray-400 px-2 leading-relaxed">
          Bằng việc đăng nhập, bạn đồng ý với{" "}
          <Link
            to="/terms"
            className="underline hover:text-gray-600 transition-colors"
          >
            Điều khoản sử dụng
          </Link>{" "}
          và{" "}
          <Link
            to="/privacy"
            className="underline hover:text-gray-600 transition-colors"
          >
            Chính sách bảo mật
          </Link>
        </p>
      </div>
    </div>
  );
};

/* ─── Social Button ─── */

const SocialButton: React.FC<{
  provider: "google" | "facebook";
  onClick: () => void;
}> = ({ provider, onClick }) => {
  const config = {
    google: {
      label: "Google",
      icon: (
        <svg
          className="h-4 w-4 shrink-0 text-primary xs:h-5 xs:w-5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      className:
        "border border-border bg-surface text-text-secondary hover:bg-surface-overlay focus:ring-focus/20",
    },
    facebook: {
      label: "Facebook",
      icon: (
        <svg
          className="h-4 w-4 shrink-0 text-text-inverse xs:h-5 xs:w-5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      className:
        "bg-primary text-text-inverse hover:bg-primary/90 focus:ring-focus/30",
    },
  } as const;

  const { label, icon, className } = config[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full flex items-center justify-center gap-2",
        "min-h-[44px] px-3 xs:px-4 py-2.5 xs:py-3",
        "rounded-xl font-medium text-xs xs:text-sm",
        "whitespace-nowrap transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        "active:scale-[.97]",
        className,
      )}
      aria-label={`Đăng nhập bằng ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default LoginPage;

/*
 * KEY FIX: CSS Grid thay vì flex justify-center
 * ─────────────────────────────────────────────────────────────────────
 * TRƯỚC (bị clip ở 125% zoom):
 *   className="flex flex-col items-center justify-center min-h-[100dvh]"
 *   → Browser set height = 100dvh rồi center content bên trong
 *   → Content > height → bị clip, không scroll
 *
 * SAU (scroll đúng):
 *   className="grid place-items-center [min-height:100dvh] overflow-y-auto"
 *   → min-height → grid row tự mở rộng theo content
 *   → Khi content < viewport: row = 100dvh → card căn giữa ✓
 *   → Khi content > viewport (zoom 125%): row mở rộng → scroll ✓
 *
 * Cần thêm tailwind.config.js:
 *   theme: { extend: { screens: { xs: '360px' } } }
 *
 * Cần thêm index.html:
 *   <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
 * ─────────────────────────────────────────────────────────────────────
 */
