/**
 * @fileoverview Login Page
 * Trang đăng nhập với form validation, remember me, social login
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

  // Redirect nếu đã đăng nhập
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from || "/chat";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Clear error khi mount
  useEffect(() => {
    clearError();
  }, [clearError]);

  // React Hook Form
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Auto-focus email input
  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  // Submit handler
  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data);
      toast.success("Đăng nhập thành công!");
      const from = (location.state as { from?: string })?.from || "/chat";
      navigate(from, { replace: true });
    } catch (err) {
      toast.error((err as Error).message || "Đăng nhập thất bại");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-telegram-primary/5 via-white to-telegram-secondary/5 px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-telegram-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-telegram-secondary/10 rounded-full blur-3xl" />
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 animate-fade-in">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-telegram-primary rounded-2xl mb-4 shadow-lg shadow-telegram-primary/30">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Chào mừng trở lại
            </h1>
            <p className="text-gray-500 mt-2">
              Đăng nhập để tiếp tục trò chuyện
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
            <Input
              {...register("password")}
              type="password"
              label="Mật khẩu"
              placeholder="••••••••"
              leftIcon={<LockClosedIcon className="w-5 h-5" />}
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={isLoading}
            />

            {/* Remember me & Forgot password */}
            <div className="flex items-center justify-between">
              <Checkbox
                {...register("rememberMe")}
                label="Ghi nhớ đăng nhập"
                disabled={isLoading}
              />
              <Link
                to="/forgot-password"
                className="text-sm text-telegram-primary hover:text-telegram-primary/80 font-medium"
              >
                Quên mật khẩu?
              </Link>
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading || isSubmitting}
              disabled={isLoading || isSubmitting}
            >
              Đăng nhập
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">
                Hoặc đăng nhập với
              </span>
            </div>
          </div>

          {/* Social login */}
          <div className="grid grid-cols-2 gap-4">
            <SocialButton
              provider="google"
              onClick={() => toast.info("Tính năng đang phát triển")}
            />
            <SocialButton
              provider="facebook"
              onClick={() => toast.info("Tính năng đang phát triển")}
            />
          </div>

          {/* Sign up link */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-semibold text-telegram-primary hover:text-telegram-primary/80"
            >
              Đăng ký ngay
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Bằng việc đăng nhập, bạn đồng ý với{" "}
          <Link to="/terms" className="underline hover:text-gray-600">
            Điều khoản sử dụng
          </Link>{" "}
          và{" "}
          <Link to="/privacy" className="underline hover:text-gray-600">
            Chính sách bảo mật
          </Link>
        </p>
      </div>
    </div>
  );
};

/**
 * Social login button component
 */
const SocialButton: React.FC<{
  provider: "google" | "facebook";
  onClick: () => void;
}> = ({ provider, onClick }) => {
  const config = {
    google: {
      label: "Google",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      bg: "bg-white border border-gray-300 hover:bg-gray-50 text-gray-700",
    },
    facebook: {
      label: "Facebook",
      icon: (
        <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      bg: "bg-[#1877F2] hover:bg-[#166fe5] text-white",
    },
  };

  const { label, icon, bg } = config[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl",
        "font-medium text-sm transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        bg,
        provider === "google" && "focus:ring-gray-300",
        provider === "facebook" && "focus:ring-blue-500/50",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default LoginPage;
