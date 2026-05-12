import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthLogo } from "../components/auth";
import { Button } from "../components/ui";
import { PasswordStrength } from "../components/ui";
import { toast } from "../components/ui";
import { extractApiError } from "../lib/apiContract";
import { changePasswordSchema } from "../lib/validations";
import type { ChangePasswordFormData } from "../lib/validations";
import { hasMinimumPasswordLength, PASSWORD_MIN_LENGTH } from "../constants/passwordPolicy";
import { authApi } from "../services/api";
import { useAuthStore } from "../stores";
import { translateI18nMessage } from "../utils/userMessages";

import { Eye, EyeOff } from "lucide-react";

export const ForceChangePasswordPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { logout } = useAuthStore();
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPasswordValue = watch("newPassword");

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsSubmitting(true);
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });

      toast.success("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
      await logout();
    } catch (error: unknown) {
      const apiError = extractApiError(error);
      toast.error(
        apiError.message || "Đổi mật khẩu thất bại. Vui lòng thử lại.",
      );

      if (apiError.statusCode === 401) {
        await logout();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      maxWidth="sm"
      className="max-w-md mx-auto my-auto flex flex-col justify-center min-h-[100dvh] p-6 text-slate-800"
    >
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-lg sm:p-9">
        <AuthLogo subtitle="Đổi mật khẩu bắt buộc" />

        <p className="mb-6 px-2 text-center text-sm leading-6 text-slate-500">
          Tài khoản của bạn đang sử dụng mật khẩu tạm. Vui lòng đổi mật khẩu
          trước khi tiếp tục sử dụng hệ thống.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu hiện tại
            </label>
            <div className="relative">
              <input
                {...register("currentPassword")}
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Mật khẩu hiện tại"
                disabled={isSubmitting}
                autoComplete="current-password"
                className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showCurrentPassword ? t("common.actions.hidePassword") : t("common.actions.showPassword")}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-danger">
                {translateI18nMessage(errors.currentPassword.message, t)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu mới
            </label>
            <div className="relative">
              <input
                {...register("newPassword")}
                type={showNewPassword ? "text" : "password"}
                placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
                disabled={isSubmitting}
                autoComplete="new-password"
                className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showNewPassword ? t("common.actions.hidePassword") : t("common.actions.showPassword")}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="mt-1 text-xs text-danger">
                {translateI18nMessage(errors.newPassword.message, t)}
              </p>
            )}
            {newPasswordValue ? (
              <div className="mt-2">
                <PasswordStrength password={newPasswordValue} />
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Xác nhận mật khẩu mới
            </label>
            <div className="relative">
              <input
                {...register("confirmPassword")}
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu mới"
                disabled={isSubmitting}
                autoComplete="new-password"
                className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showConfirmPassword ? t("common.actions.hidePassword") : t("common.actions.showPassword")}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-danger">
                {translateI18nMessage(errors.confirmPassword.message, t)}
              </p>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            size="md"
            className="h-11 rounded-lg bg-[#2b7ff6] text-sm font-semibold text-white hover:bg-blue-600 mt-2"
            isLoading={isSubmitting}
            disabled={
              isSubmitting || !hasMinimumPasswordLength(newPasswordValue ?? "")
            }
          >
            Đổi mật khẩu
          </Button>
        </form>
      </div>
    </AuthShell>
  );
};

export default ForceChangePasswordPage;
