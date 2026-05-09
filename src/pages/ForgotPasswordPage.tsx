import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { AuthLayoutSplit } from "../components/auth";
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
    <AuthLayoutSplit>
      <div className="flex flex-col">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
            Quên mật khẩu?
          </h1>
          <p className="text-base font-medium text-slate-500">
            Nhập email hoặc số điện thoại để lấy lại mật khẩu
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700">Email hoặc số điện thoại</label>
            <input
              {...register("identifier")}
              type="text"
              placeholder="name@company.com hoặc 09..."
              disabled={isBusy}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-medium outline-none transition-all focus:border-[#1d5fd6] focus:ring-2 focus:ring-[#1d5fd6]/10 disabled:bg-slate-50"
            />
            {identifierError && (
              <p className="text-xs font-semibold text-red-500">{identifierError}</p>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            isLoading={isBusy}
            disabled={isBusy}
            className="h-12 rounded-xl bg-slate-900 text-sm font-bold text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-900/10"
          >
            Nhận mã OTP
          </Button>

          <footer className="mt-8 text-center">
            <button
              type="button"
              onClick={() => navigate(ROUTE_PATHS.LOGIN)}
              className="text-sm font-bold text-[#1d5fd6] hover:underline"
            >
              Quay lại đăng nhập
            </button>
          </footer>
        </form>
      </div>
    </AuthLayoutSplit>
  );
};

export default ForgotPasswordPage;
