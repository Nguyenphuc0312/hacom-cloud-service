import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AuthShell, AuthLogo } from "../components/auth";
import { Button } from "../components/ui";
import { toast } from "../components/ui";
import { useAuthStore } from "../stores";
import { authClient } from "../lib/axios";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
import { getAccessToken } from "../services/tokenService";
import type { ApiResponse } from "@hacom/chat-shared-types/core";

const PASSWORD_LENGTH = 12;
const passwordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{12}$/;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại."),
    newPassword: z
      .string()
      .length(PASSWORD_LENGTH, `Mật khẩu phải có đúng ${PASSWORD_LENGTH} ký tự`)
      .regex(
        passwordPattern,
        "Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa, 1 số và 1 ký tự đặc biệt",
      ),
    confirmPassword: z.string().min(1, "Xác nhận mật khẩu mới."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Mật khẩu mới không được trùng mật khẩu hiện tại.",
    path: ["newPassword"],
  });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

interface PolicyCheck {
  label: string;
  pass: boolean;
}

function getPolicyChecks(password: string): PolicyCheck[] {
  return [
    {
      label: `Đúng ${PASSWORD_LENGTH} ký tự`,
      pass: password.length === PASSWORD_LENGTH,
    },
    { label: "Có chữ thường (a-z)", pass: /[a-z]/.test(password) },
    { label: "Có chữ hoa (A-Z)", pass: /[A-Z]/.test(password) },
    { label: "Có chữ số (0-9)", pass: /\d/.test(password) },
    {
      label: "Có ký tự đặc biệt (!@#$%...)",
      pass: /[^a-zA-Z0-9]/.test(password),
    },
  ];
}

export const ForceChangePasswordPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { logout } = useAuthStore();

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
  const policyChecks = getPolicyChecks(newPasswordValue);
  const showPolicy = newPasswordValue.length > 0;

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
                {errors.currentPassword.message}
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
              placeholder={`Đúng ${PASSWORD_LENGTH} ký tự`}
              disabled={isSubmitting}
              autoComplete="new-password"
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-danger">
                {errors.newPassword.message}
              </p>
            )}
            {showPolicy && (
              <ul className="mt-2 space-y-1">
                {policyChecks.map((check) => (
                  <li
                    key={check.label}
                    className={`text-xs flex items-center gap-1 ${check.pass ? "text-green-600" : "text-red-500"}`}
                  >
                    <span>{check.pass ? "✓" : "✗"}</span>
                    <span>{check.label}</span>
                  </li>
                ))}
              </ul>
            )}
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
                {errors.confirmPassword.message}
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
              isSubmitting ||
              (showPolicy && policyChecks.some((c) => !c.pass))
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
