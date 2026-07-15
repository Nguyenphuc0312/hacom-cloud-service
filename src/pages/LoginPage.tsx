import React, { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
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
import { ROUTE_PATHS } from "../router/paths";

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
    rateLimitedUntil,
    clearError,
    setLockedAccount,
    setAuthStatus,
  } = useAuthStore();

  // Đồng hồ đếm ngược khi bị rate-limit: tick mỗi giây để cập nhật thời gian
  // còn lại hiển thị trong form.
  const [nowTs, setNowTs] = React.useState(() => Date.now());
  useEffect(() => {
    if (!rateLimitedUntil || rateLimitedUntil <= Date.now()) {
      return;
    }
    setNowTs(Date.now());
    const intervalId = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [rateLimitedUntil]);

  const rateLimitRemainingMs =
    rateLimitedUntil && rateLimitedUntil > nowTs ? rateLimitedUntil - nowTs : 0;

  const rateLimitError = React.useMemo(() => {
    if (rateLimitRemainingMs <= 0) {
      return null;
    }
    const totalSeconds = Math.ceil(rateLimitRemainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const time =
      minutes > 0
        ? t("auth:login.durationMinutesSeconds", { minutes, seconds })
        : t("auth:login.durationSeconds", { seconds });
    return t("auth:login.rateLimitedCountdown", { time });
  }, [rateLimitRemainingMs, t]);

  useEffect(() => {
    clearError();
  }, [authMethod, clearError]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
    control,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginIdentifier: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    if (authMethod === "password") {
      setFocus("loginIdentifier");
    }
  }, [authMethod, setFocus]);

  const rememberMe = useWatch({ control, name: "rememberMe" });
  const submitLockRef = React.useRef(false);

  const onSubmit = async (data: LoginFormData) => {
    if (submitLockRef.current || isLoading) return;
    // Đang trong thời gian chờ rate-limit: không gửi tiếp, giữ nguyên đếm ngược.
    if (rateLimitedUntil && rateLimitedUntil > Date.now()) return;
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
      if (typeof result === "object" && result.status === "pending_hr_link") {
        toast.info("Tài khoản đang chờ xác minh nhân sự.");
        navigate(ROUTE_PATHS.PENDING_HR_LINK, { replace: true });
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

        <header className="mb-[clamp(10px,1.5dvh,16px)] text-center">
          <h1
            className="mb-1 font-bold tracking-tight text-text-primary [text-wrap:balance]"
            style={{ fontSize: "clamp(1.125rem, 2.5vw, 1.5rem)" }}
          >
            Chào mừng trở lại với{" "}
            <span className="text-[#C41E3A]">
              Hacom Holdings
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
              ? "bg-surface text-[#C41E3A] shadow-sm"
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
            aria-controls="login-panel-qr"
            onClick={() => setAuthMethod("qr")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all ${authMethod === "qr"
              ? "bg-surface text-[#C41E3A] shadow-sm"
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
                authStatus === "locked" || authStatus === "disabled"
                  ? null
                  : rateLimitError ?? error
              }
              onSubmit={handleSubmit(onSubmit)}
            />
          </div>
        )}

        {authMethod === "qr" && (
          <div
            role="tabpanel"
            id="login-panel-qr"
            aria-labelledby="login-tab-qr"
            className="space-y-3"
          >
            <div className="rounded-lg border border-border bg-surface-overlay px-3 py-2.5 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-text-secondary">
                <ShieldCheckIcon className="h-4 w-4 text-[#C41E3A]" aria-hidden="true" />
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
