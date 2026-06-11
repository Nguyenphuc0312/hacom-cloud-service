import React, { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { KeyIcon, QrCodeIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { QrLoginPanel } from "../components/auth";
import { PasswordLoginForm } from "../components/auth/PasswordLoginForm";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";
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
    authStatus,
    lockedAccount,
    error,
    clearError,
    setLockedAccount,
    setAuthStatus,
  } = useAuthStore();


  useEffect(() => {
    clearError();
  }, [authMethod, clearError]);

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
        // GuestRoute handles redirect (preserves location.state.from)
        return;
      }
      if (result === "activation_required") {
        toast.info(t("auth:activation.required.redirecting"));
        // GuestRoute handles redirect with from state
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
        toVietnameseMessage((err as Error).message, "Sai thông tin đăng nhập hoặc tài khoản, vui lòng kiểm tra lại."),
      );
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <div className="flex flex-col">
        <div className="mb-[clamp(12px,2dvh,20px)] flex justify-center">
          <Link to="/" className="inline-block transition-transform hover:scale-105 active:scale-95">
            <img
              src="/logo-dung.png"
              alt="Hacom Holdings"
              className="w-auto object-contain mix-blend-multiply"
              style={{ height: "clamp(48px, 8dvh, 72px)" }}
            />
          </Link>
        </div>

        <header className="mb-[clamp(10px,1.5dvh,16px)]">
          <h1
            className="mb-1 font-bold tracking-tight text-text-primary"
            style={{ fontSize: "clamp(1.125rem, 2.5vw, 1.5rem)" }}
          >
            Chào mừng trở lại với{" "}
            <span className="bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857] bg-clip-text text-transparent">
              Hacom Chat
            </span>
          </h1>
          <p className="text-sm font-medium text-text-muted">
            Đăng nhập vào tài khoản của bạn để tiếp tục
          </p>
        </header>

        <div className="mb-[clamp(10px,1.5dvh,16px)] flex rounded-xl bg-surface-overlay p-1" role="tablist" aria-label="Phương thức đăng nhập">
          <button
            id="login-tab-password"
            type="button"
            role="tab"
            aria-selected={authMethod === "password"}
            aria-controls="login-panel-password"
            onClick={() => setAuthMethod("password")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all ${authMethod === "password"
              ? "bg-surface text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
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
              ? "bg-surface text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
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
                key="locked-state"
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
              key="password-form"
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
                <div className="w-full border-t border-border"></div>
              </div>
            </div>
          </div>
        )}

        {authMethod === "qr" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-800">
                <ShieldCheckIcon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Sử dụng ứng dụng di động để quét
              </p>
            </div>

            <div className="flex justify-center">
              <QrLoginPanel
                key="qr-panel"
                rememberMe={rememberMe}
                onSuccess={() => {
                  toast.success("Đăng nhập bằng QR thành công.");
                  const from = (location.state as { from?: string })?.from ?? "/chat";
                  navigate(from, { replace: true });
                }}
              />
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="flex h-9 w-full max-w-[200px] items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover active:scale-95"
              >
                Quên mật khẩu
              </button>
            </div>
          </div>
        )}

    </div>
  );
};

export default LoginPage;
