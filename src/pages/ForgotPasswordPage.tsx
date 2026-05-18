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
        <header className="mb-[clamp(12px,2dvh,24px)]">
          <h1
            className="mb-1 font-bold tracking-tight text-text-primary"
            style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.875rem)" }}
          >
            Quên mật khẩu?
          </h1>
          <p className="text-sm font-medium text-text-muted">
            Nhập email hoặc số điện thoại để lấy lại mật khẩu
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/8 p-4 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-text-secondary">Email hoặc số điện thoại</label>
            <input
              {...register("identifier")}
              type="text"
              placeholder="name@hacomholdings.vn"
              disabled={isBusy}
              className="h-12 w-full rounded-xl border border-border px-4 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-surface-overlay"
            />
            {identifierError && (
              <p className="text-xs font-semibold text-danger">{identifierError}</p>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            isLoading={isBusy}
            disabled={isBusy}
            className="h-12 rounded-xl bg-primary text-sm font-bold text-text-inverse transition-all hover:bg-primary-hover active:scale-95 shadow-lg shadow-primary/10"
          >
            Nhận mã OTP
          </Button>

          <footer className="mt-8 text-center">
            <button
              type="button"
              onClick={() => navigate(ROUTE_PATHS.LOGIN)}
              className="text-sm font-bold text-primary hover:underline"
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
