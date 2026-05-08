import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthLogo } from "../components/auth";
import { Button } from "../components/ui";
import { PasswordStrength } from "../components/ui";
import { toast } from "../components/ui";
import { useAuthStore } from "../stores";
import { authClient } from "../lib/axios";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
import { changePasswordSchema } from "../lib/validations";
import type { ChangePasswordFormData } from "../lib/validations";
import { getAccessToken } from "../services/tokenService";
import { hasMinimumPasswordLength, PASSWORD_MIN_LENGTH } from "../constants/passwordPolicy";
import { translateI18nMessage } from "../utils/userMessages";
import type { ApiResponse } from "@hacom/chat-shared-types/core";

export const ForceChangePasswordPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      const token = getAccessToken();
      await authClient.post<ApiResponse<unknown>>(
        AUTH_ENDPOINTS.changePassword,
        {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      toast.success("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
      await logout();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      const message =
        axiosErr.response?.data?.message ??
        axiosErr.response?.data?.error ??
        "Đổi mật khẩu thất bại. Vui lòng thử lại.";
      toast.error(message);
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
            <input
              {...register("currentPassword")}
              type="password"
              placeholder="Mật khẩu hiện tại"
              disabled={isSubmitting}
              autoComplete="current-password"
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
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
            <input
              {...register("newPassword")}
              type="password"
              placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
              disabled={isSubmitting}
              autoComplete="new-password"
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
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
            <input
              {...register("confirmPassword")}
              type="password"
              placeholder="Nhập lại mật khẩu mới"
              disabled={isSubmitting}
              autoComplete="new-password"
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
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
