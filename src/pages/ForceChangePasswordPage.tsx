import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthLogo, PasswordField } from "../components/auth";
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
      className="max-w-md mx-auto my-auto flex flex-col justify-center min-h-[100dvh] p-6 text-text-primary"
    >
        <div className="w-full max-w-[420px] rounded-2xl bg-surface p-7 shadow-lg sm:p-9">
        <AuthLogo subtitle="Đổi mật khẩu bắt buộc" />

        <p className="mb-6 px-2 text-center text-sm leading-6 text-text-muted">
          Tài khoản của bạn đang sử dụng mật khẩu tạm. Vui lòng đổi mật khẩu
          trước khi tiếp tục sử dụng hệ thống.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <PasswordField
            label="Mật khẩu hiện tại"
            placeholder="Mật khẩu hiện tại"
            registration={register("currentPassword")}
            error={
              errors.currentPassword
                ? translateI18nMessage(errors.currentPassword.message, t)
                : undefined
            }
            disabled={isSubmitting}
            autoComplete="current-password"
          />

          <PasswordField
            label="Mật khẩu mới"
            placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
            registration={register("newPassword")}
            error={
              errors.newPassword
                ? translateI18nMessage(errors.newPassword.message, t)
                : undefined
            }
            disabled={isSubmitting}
            autoComplete="new-password"
          >
            {newPasswordValue ? (
              <div className="mt-2">
                <PasswordStrength password={newPasswordValue} />
              </div>
            ) : null}
          </PasswordField>

          <PasswordField
            label="Xác nhận mật khẩu mới"
            placeholder="Nhập lại mật khẩu mới"
            registration={register("confirmPassword")}
            error={
              errors.confirmPassword
                ? translateI18nMessage(errors.confirmPassword.message, t)
                : undefined
            }
            disabled={isSubmitting}
            autoComplete="new-password"
          />

          <Button
            type="submit"
            fullWidth
            size="md"
            className="h-11 rounded-lg bg-primary text-sm font-semibold text-text-inverse hover:bg-primary-hover mt-2"
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
