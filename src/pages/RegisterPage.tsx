import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthLogo, PasswordStrengthIndicator } from "../components/auth";
import { Button, toast } from "../components/ui";
import { registerSchema } from "../lib/validations";
import type { RegisterFormData } from "../lib/validations";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import {
  toVietnameseMessage,
  translateI18nMessage,
} from "../utils/userMessages";

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register: registerUser, isLoading, isAuthenticated, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTE_PATHS.CHAT, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", acceptTerms: undefined as unknown as true },
    mode: "onChange",
  });

  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const emailError = translateI18nMessage(errors.email?.message, t);
  const passwordError = translateI18nMessage(errors.password?.message, t);
  const confirmPasswordError = translateI18nMessage(
    errors.confirmPassword?.message,
    t,
  );
  const acceptTermsError = translateI18nMessage(
    errors.acceptTerms?.message,
    t,
  );

  const onSubmit = async (data: RegisterFormData) => {
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      const registerResult = await registerUser({ email: normalizedEmail, password: data.password });

      if (!registerResult.verificationRequired) {
        toast.success(
          toVietnameseMessage(registerResult.message, "Đăng ký thành công."),
        );
        navigate(ROUTE_PATHS.LOGIN, { replace: true });
        return;
      }

      const verificationEmail = registerResult.email || normalizedEmail;
      const verifyQuery = new URLSearchParams({ email: verificationEmail, source: "signup" });
      if (registerResult.challengeId) verifyQuery.set("challengeId", registerResult.challengeId);
      if (registerResult.expiresAt) verifyQuery.set("expiresAt", registerResult.expiresAt);

      toast.success(
        toVietnameseMessage(
          registerResult.message,
          "Vui lòng xác thực email để hoàn tất đăng ký.",
        ),
      );
      navigate(`${ROUTE_PATHS.VERIFY_EMAIL}?${verifyQuery.toString()}`, {
        replace: true,
        state: { source: "signup", email: verificationEmail, challengeId: registerResult.challengeId || null, expiresAt: registerResult.expiresAt },
      });
    } catch (err) {
      toast.error(
        toVietnameseMessage((err as Error).message, "Đăng ký thất bại."),
      );
    }
  };

  const isBusy = isLoading || isSubmitting;

  return (
    <AuthShell maxWidth="sm" className="max-w-md mx-auto my-auto flex flex-col justify-center min-h-[100dvh] p-6 text-slate-800">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-lg sm:p-9">
        <AuthLogo subtitle="Đăng ký tài khoản" />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              {...register("email")}
              type="email"
              placeholder="Nhập email"
              disabled={isBusy}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
            {emailError && <p className="mt-1 text-xs text-danger">{emailError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
            <div className="relative">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                disabled={isBusy}
                className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
            {passwordError && <p className="mt-1 text-xs text-danger">{passwordError}</p>}
          </div>

          <PasswordStrengthIndicator password={passwordValue} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nhập lại mật khẩu</label>
            <div className="relative">
              <input
                {...register("confirmPassword")}
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu"
                disabled={isBusy}
                className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
            {confirmPasswordError && (
              <p className="mt-1 text-xs text-danger">{confirmPasswordError}</p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 pt-1">
            <input
              {...register("acceptTerms")}
              type="checkbox"
              className="mt-1 w-4 h-4 rounded text-[#2b7ff6] focus:ring-[#2b7ff6] border-slate-300"
              disabled={isBusy}
            />
            <span className="text-xs text-slate-600">
              Tôi đồng ý với <Link to="/terms" className="text-[#2b7ff6] hover:underline">Điều khoản</Link> và <Link to="/privacy" className="text-[#2b7ff6] hover:underline">Chính sách bảo mật</Link>
            </span>
          </label>
          {acceptTermsError && (
            <p className="mt-1 text-xs text-danger">{acceptTermsError}</p>
          )}

          <Button
            type="submit"
            fullWidth
            size="md"
            className="h-11 rounded-lg text-sm font-semibold bg-[#2b7ff6] hover:bg-blue-600 text-white mt-4"
            isLoading={isBusy}
            disabled={isBusy}
          >
            Đăng ký
          </Button>
          
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => navigate(ROUTE_PATHS.LOGIN)}
              className="text-[#2b7ff6] font-semibold text-sm hover:text-blue-700 hover:underline transition-colors"
            >
              Quay lại đăng nhập
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  );
};

export default RegisterPage;
