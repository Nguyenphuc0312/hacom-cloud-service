import React, { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { KeyIcon, QrCodeIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { QrLoginPanel, AuthLayoutSplit } from "../components/auth";
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
    <AuthLayoutSplit>
      <div className="flex flex-col">
        <div className="mb-10 flex justify-center">
          <Link to="/" className="inline-block transition-transform hover:scale-105 active:scale-95">
            <img
              src="/hacom-logo-horizontal.png"
              alt="Hacom Holdings"
              className="h-16 w-auto object-contain"
            />
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Chào mừng trở lại với Hacom Chat
          </h1>
          <p className="text-base font-medium text-slate-500">
            Đăng nhập vào tài khoản của bạn để tiếp tục
          </p>
        </header>

        <div className="mb-8 flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Phương thức đăng nhập">
          <button
            id="login-tab-password"
            type="button"
            role="tab"
            aria-selected={authMethod === "password"}
            aria-controls="login-panel-password"
            onClick={() => setAuthMethod("password")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all ${authMethod === "password"
              ? "bg-white text-[#1d5fd6] shadow-sm"
              : "text-slate-600 hover:text-slate-800"
              }`}
          >
            <KeyIcon className="h-4 w-4" aria-hidden="true" />
            Tài khoản
          </button>
          <button
            id="login-tab-qr"
            type="button"
            role="tab"
            aria-selected={authMethod === "qr"}
            onClick={() => setAuthMethod("qr")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all ${authMethod === "qr"
              ? "bg-white text-[#1d5fd6] shadow-sm"
              : "text-slate-600 hover:text-slate-800"
              }`}
          >
            <QrCodeIcon className="h-4 w-4" aria-hidden="true" />
            Quét QR
          </button>
        </div>

        {authMethod === "password" && (
          <div className="space-y-6">
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
              authError={
                authStatus === "locked" || authStatus === "disabled" ? null : error
              }
              onSubmit={handleSubmit(onSubmit)}
            />

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
            </div>
          </div>
        )}

        {authMethod === "qr" && (
          <div className="space-y-6">
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-800">
                <ShieldCheckIcon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Sử dụng ứng dụng di động để quét
              </p>
            </div>

            <div className="flex justify-center py-4">
              <QrLoginPanel
                rememberMe={rememberMe}
                onSuccess={() => {
                  toast.success("Đăng nhập bằng QR thành công.");
                  const from = (location.state as { from?: string })?.from ?? "/chat";
                  navigate(from, { replace: true });
                }}
              />
            </div>

            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="flex h-11 w-full max-w-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
              >
                Quên mật khẩu
              </button>
            </div>
          </div>
        )}

      </div>
    </AuthLayoutSplit>
  );
};

export default LoginPage;
