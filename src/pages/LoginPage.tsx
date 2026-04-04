import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { toast } from "../components/ui";
import { QrLoginPanel } from "../components/auth/QrLoginPanel";
import {
  PasswordLoginForm,
  type SocialProvider,
} from "../components/auth/PasswordLoginForm";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [authMethod, setAuthMethod] = React.useState<"password" | "qr">(
    "password",
  );
  const { login, isLoading, isAuthenticated, error, clearError } =
    useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from ?? "/chat";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    if (authMethod === "password") {
      setFocus("email");
    }
  }, [authMethod, setFocus]);

  const rememberMe = watch("rememberMe");

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data);
      toast.success(t("auth:toast.loginSuccess"));
      const from = (location.state as { from?: string })?.from ?? "/chat";
      navigate(from, { replace: true });
    } catch (err) {
      toast.error((err as Error).message ?? t("auth:toast.loginFailed"));
    }
  };

  const handleSocialLogin = (provider: SocialProvider) => {
    void provider;
    toast.info(t("common:toast.featureInDevelopment"));
  };

  return (
    <div
      className={clsx(
        "relative isolate",
        "grid place-items-center",
        "[min-height:100dvh]",
        "overflow-y-auto",
        "bg-[radial-gradient(1200px_circle_at_top_right,hsl(var(--color-primary)/0.12),transparent_48%),radial-gradient(900px_circle_at_bottom_left,hsl(var(--color-secondary)/0.16),transparent_52%),linear-gradient(180deg,hsl(var(--color-background)),hsl(var(--color-background)))]",
        "px-4 py-8",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-24 right-[8%] h-48 w-48 rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute bottom-[8%] left-[10%] h-56 w-56 rounded-full bg-secondary/14 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <section
          aria-label={t("auth:login.aria.section")}
          className="animate-fade-in rounded-3xl border border-border/80 bg-surface/95 p-6 shadow-[0_20px_55px_hsl(var(--color-text-primary)/0.09)] backdrop-blur sm:p-7"
        >
          <header className="mb-6 text-center">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-text-inverse shadow-sm">
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {t("auth:login.title")}
            </h1>
            <p className="mt-1.5 text-sm text-text-muted">
              {t("auth:login.subtitle")}
            </p>
          </header>

          <div
            role="tablist"
            aria-label={t("auth:login.methods", {
              defaultValue: "Login methods",
            })}
            className="mb-5 grid grid-cols-2 rounded-2xl border border-border bg-surface-overlay/70 p-1"
          >
            <button
              type="button"
              role="tab"
              id="login-tab-password"
              aria-controls="login-panel-password"
              aria-selected={authMethod === "password"}
              onClick={() => setAuthMethod("password")}
              className={clsx(
                "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                authMethod === "password"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t("auth:login.passwordTab", {
                defaultValue: "Dang nhap mat khau",
              })}
            </button>
            <button
              type="button"
              role="tab"
              id="login-tab-qr"
              aria-controls="login-panel-qr"
              aria-selected={authMethod === "qr"}
              onClick={() => setAuthMethod("qr")}
              className={clsx(
                "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                authMethod === "qr"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t("auth:login.qrTab", { defaultValue: "Quet QR" })}
            </button>
          </div>

          {authMethod === "password" && (
            <PasswordLoginForm
              register={register}
              errors={errors}
              isLoading={isLoading}
              isSubmitting={isSubmitting}
              authError={error}
              onSubmit={handleSubmit(onSubmit)}
              onSocialLogin={handleSocialLogin}
            />
          )}

          {authMethod === "qr" && (
            <div
              role="tabpanel"
              id="login-panel-qr"
              aria-labelledby="login-tab-qr"
              className="space-y-4"
            >
              <p className="text-center text-sm text-text-secondary">
                {t("auth:login.qrHint", {
                  defaultValue:
                    "Quet ma bang app mobile de dang nhap vao trinh duyet",
                })}
              </p>
              <QrLoginPanel
                rememberMe={rememberMe}
                onSuccess={() => {
                  toast.success("Dang nhap bang QR thanh cong");
                  const from =
                    (location.state as { from?: string })?.from ?? "/chat";
                  navigate(from, { replace: true });
                }}
              />
            </div>
          )}

          <p className="mt-6 text-center text-sm text-text-muted">
            {t("auth:login.noAccount")}{" "}
            <Link
              to="/register"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {t("auth:login.signupNow")}
            </Link>
          </p>
        </section>

        <p className="mt-4 px-2 text-center text-xs leading-relaxed text-text-muted">
          {t("auth:login.agreement")}{" "}
          <Link
            to="/terms"
            className="underline hover:text-text-secondary transition-colors"
          >
            {t("auth:login.terms")}
          </Link>{" "}
          {t("auth:login.agreementAnd")}{" "}
          <Link
            to="/privacy"
            className="underline hover:text-text-secondary transition-colors"
          >
            {t("auth:login.privacy")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
