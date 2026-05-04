import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AuthShell, QrLoginPanel, AuthLogo } from "../components/auth";
import { PasswordLoginForm } from "../components/auth/PasswordLoginForm";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { LockedOrDisabledState } from "../features/activation/components/LockedOrDisabledState";
import { toast } from "../components/ui";
import { toVietnameseMessage } from "../utils/userMessages";

export const LoginPage: React.FC = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  const [authMethod, setAuthMethod] = React.useState<"password" | "qr">("password");
  const {
    login,
    isLoading,
    isAuthenticated,
    authStatus,
    activationContext,
    lockedAccount,
    error,
    clearError,
    setLockedAccount,
    setAuthStatus,
  } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from ?? "/chat";
      navigate(from, { replace: true });
      return;
    }

    if (authStatus === "activation_required" && activationContext) {
      navigate(ROUTE_PATHS.ACTIVATION, {
        replace: true,
        state: {
          from: (location.state as { from?: string } | null)?.from,
        },
      });
    }
  }, [activationContext, authStatus, isAuthenticated, location, navigate]);

  useEffect(() => {
    if (
      authStatus === "anonymous" ||
      authStatus === "idle" ||
      authStatus === "activation_required"
    ) {
      clearError();
    }
  }, [authStatus, clearError]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginIdentifier: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    if (authMethod === "password") {
      setFocus("loginIdentifier");
    }
  }, [authMethod, setFocus]);

  const rememberMe = watch("rememberMe");
  const submitLockRef = React.useRef(false);

  const onSubmit = async (data: LoginFormData) => {
    if (submitLockRef.current || isLoading) return;
    submitLockRef.current = true;

    try {
      const result = await login(data);
      if (typeof result === "object" && result.status === "authenticated") {
        toast.success(
          toVietnameseMessage(result.message, "Đăng nhập thành công."),
        );
        const from = (location.state as { from?: string })?.from ?? "/chat";
        navigate(from, { replace: true });
        return;
      }
      if (result === "activation_required") {
        toast.info(t("auth:activation.required.redirecting"));
        navigate(ROUTE_PATHS.ACTIVATION, {
          replace: true,
          state: { from: (location.state as { from?: string } | null)?.from },
        });
        return;
      }
      if (result === "locked" || result === "disabled") {
        const latestError = useAuthStore.getState().error;
        toast.error(
          toVietnameseMessage(
            latestError || error || undefined,
            t("auth:activation.locked.defaultMessage"),
          ),
        );
      }
    } catch (err) {
      toast.error(
        toVietnameseMessage((err as Error).message, "Đăng nhập thất bại."),
      );
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <AuthShell maxWidth="sm" className="max-w-md mx-auto my-auto flex flex-col justify-center min-h-[100dvh] p-6 text-slate-800">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-lg sm:p-9">
        <AuthLogo subtitle="Đăng nhập để tiếp tục trò chuyện nội bộ" />

        <div className="mb-7 flex border-b border-slate-200">
          <button
            onClick={() => setAuthMethod("password")}
            className={`flex-1 pb-3 text-sm font-bold uppercase transition-colors ${
              authMethod === "password"
                ? "text-[#1a73e8] border-b-2 border-[#1a73e8]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            TÀI KHOẢN
          </button>
          <button
            onClick={() => setAuthMethod("qr")}
            className={`flex-1 pb-3 text-sm font-bold uppercase transition-colors flex items-center justify-center gap-1.5 ${
              authMethod === "qr"
                ? "text-[#1a73e8] border-b-2 border-[#1a73e8]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><path d="M9 14v7x"></path><path d="M6 17h.01"></path><path d="M3 21h3"></path><path d="M3 14h3"></path></svg>
            QUÉT MÃ QR
          </button>
        </div>

        {authMethod === "password" && (
          <div className="space-y-4">
            {(authStatus === "locked" || authStatus === "disabled") &&
            lockedAccount ? (
              <LockedOrDisabledState
                status={lockedAccount.status}
                message={lockedAccount.message || error}
                onReset={() => {
                  setLockedAccount(null);
                  setAuthStatus("anonymous");
                  clearError();
                }}
              />
            ) : null}

            <PasswordLoginForm
              register={register}
              errors={errors}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              passwordValue={watch("password")}
              authError={
                authStatus === "locked" || authStatus === "disabled" ? null : error
              }
              onSubmit={handleSubmit(onSubmit)}
            />
          </div>
        )}

        {authMethod === "qr" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-slate-500">
              Mở ứng dụng di động để quét mã
            </p>
            <QrLoginPanel
              rememberMe={rememberMe}
              onSuccess={() => {
                toast.success("Đăng nhập bằng QR thành công.");
                const from = (location.state as { from?: string })?.from ?? "/chat";
                navigate(from, { replace: true });
              }}
            />
            <div className="mt-5 flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="flex-1 h-11 rounded-lg border border-slate-200 bg-slate-50 text-[#2b7ff6] font-semibold text-sm hover:bg-slate-100 transition-colors"
              >
                Quên mật khẩu
              </button>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="flex-1 h-11 rounded-lg bg-[#2b7ff6] hover:bg-blue-600 text-white font-semibold text-sm transition-colors"
              >
                Đăng ký
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default LoginPage;
