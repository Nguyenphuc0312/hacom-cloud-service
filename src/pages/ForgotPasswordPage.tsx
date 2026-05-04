import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthLogo } from "../components/auth";
import { Button } from "../components/ui";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { toast } from "../components/ui";
import { authApi } from "../services/api";
import {
  toVietnameseMessage,
  translateI18nMessage,
} from "../utils/userMessages";

const requestResetSchema = z.object({
  identifier: z.string().min(1, "Vui lòng nhập email hoặc số điện thoại"),
});

type RequestResetFormData = z.infer<typeof requestResetSchema>;

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, error, clearError } = useAuthStore();

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
    formState: { errors, isSubmitting },
  } = useForm<RequestResetFormData>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { identifier: "" },
  });
  const identifierError = translateI18nMessage(errors.identifier?.message, t);

  const onSubmit = async (data: RequestResetFormData) => {
    try {
      const response = await authApi.forgotPassword(data.identifier);
      toast.success(
        toVietnameseMessage(
          response.message,
          "Mã OTP đã được gửi đến email/số điện thoại của bạn.",
        ),
      );
      navigate(ROUTE_PATHS.RESET_PASSWORD, {
        state: {
          identifier: data.identifier,
        },
      });
    } catch (err) {
      toast.error(
        toVietnameseMessage(
          (err as Error).message,
          "Không thể gửi yêu cầu đặt lại mật khẩu.",
        ),
      );
    }
  };

  const isBusy = isLoading || isSubmitting;

  return (
    <AuthShell maxWidth="sm" className="max-w-md mx-auto my-auto flex flex-col justify-center min-h-[100dvh] p-6 text-slate-800">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-lg sm:p-9">
        <AuthLogo subtitle="Lấy lại mật khẩu" />

        <p className="mb-7 px-2 text-center text-sm leading-6 text-slate-500">
          Nhập email hoặc số điện thoại để nhận mã OTP khôi phục mật khẩu.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email hoặc số điện thoại
            </label>
            <input
              {...register("identifier")}
              type="text"
              placeholder="Nhập email hoặc số điện thoại"
              disabled={isBusy}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
            {identifierError && (
              <p className="mt-1 text-xs text-danger">{identifierError}</p>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            size="md"
            className="h-11 rounded-lg bg-[#2b7ff6] text-sm font-semibold text-white hover:bg-blue-600"
            isLoading={isBusy}
            disabled={isBusy}
          >
            Nhận mã OTP
          </Button>

          <div className="pt-1 text-center">
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

export default ForgotPasswordPage;
