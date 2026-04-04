import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  EnvelopeIcon,
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, Checkbox, toast } from "../components/ui";
import { QrLoginPanel } from "../components/auth/QrLoginPanel";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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
    setFocus("email");
  }, [setFocus]);

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

  return (
    <div
      className={clsx(
        "relative isolate",
        "grid place-items-center",
        "[min-height:100dvh]",
        "overflow-y-auto",
        "bg-gradient-to-br from-primary/10 via-background to-secondary/10",
        "px-4 py-8 sm:py-10",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-40 -right-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-secondary/15 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full mx-auto max-w-sm xs:max-w-sm sm:max-w-md lg:max-w-lg">
        <section
          aria-label={t("auth:login.aria.section")}
          className="bg-surface rounded-2xl shadow-xl border border-border animate-fade-in p-5 xs:p-6 sm:p-8 lg:p-10"
        >
          <header className="text-center mb-5 sm:mb-6 lg:mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl mb-3 sm:mb-4 shadow-lg shadow-elev2 bg-primary w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16">
              <ChatBubbleLeftRightIcon className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 text-text-inverse" />
            </div>
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-text-primary leading-tight">
              {t("auth:login.title")}
            </h1>
            <p className="text-xs xs:text-sm sm:text-base text-text-muted mt-1 sm:mt-2">
              {t("auth:login.subtitle")}
            </p>
          </header>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-3 xs:space-y-4 sm:space-y-5"
          >
            <div
              className={clsx(
                "transition-all duration-200 overflow-hidden",
                error ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
              )}
              aria-live="polite"
            >
              {error && (
                <div
                  role="alert"
                  className="p-3 sm:p-4 bg-danger/15 border border-danger/35 rounded-xl text-danger text-xs xs:text-sm animate-shake"
                >
                  {error}
                </div>
              )}
            </div>

            <Input
              {...register("email")}
              type="email"
              label={t("auth:login.email")}
              placeholder={t("auth:placeholders.email")}
              leftIcon={<EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.email?.message}
              autoComplete="email"
              inputMode="email"
              disabled={isLoading}
            />

            <Input
              {...register("password")}
              type="password"
              label={t("auth:login.password")}
              placeholder={t("auth:placeholders.password")}
              leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.password?.message}
              autoComplete="current-password"
              disabled={isLoading}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Checkbox
                {...register("rememberMe")}
                label={t("auth:login.rememberMe")}
                disabled={isLoading}
              />
              <Link
                to="/forgot-password"
                className="text-xs xs:text-sm text-primary font-medium hover:text-primary/80 transition-colors duration-200 sm:text-right whitespace-nowrap"
              >
                {t("auth:login.forgotPassword")}
              </Link>
            </div>

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading || isSubmitting}
              disabled={isLoading || isSubmitting}
              aria-busy={isLoading || isSubmitting}
            >
              {t("auth:login.submit")}
            </Button>
          </form>

          <div className="relative my-5 sm:my-6 lg:my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs xs:text-sm">
              <span className="px-3 xs:px-4 bg-surface text-text-muted">
                {t("auth:login.orWith")}
              </span>
            </div>
          </div>

          <QrLoginPanel
            rememberMe={rememberMe}
            onSuccess={() => {
              toast.success("Đăng nhập bằng QR thành công");
              const from = (location.state as { from?: string })?.from ?? "/chat";
              navigate(from, { replace: true });
            }}
          />

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 xs:gap-3 sm:gap-4">
            <SocialButton
              provider="google"
              onClick={() => toast.info(t("common:toast.featureInDevelopment"))}
            />
            <SocialButton
              provider="facebook"
              onClick={() => toast.info(t("common:toast.featureInDevelopment"))}
            />
          </div>

          <p className="mt-5 sm:mt-6 lg:mt-8 text-center text-xs xs:text-sm text-text-muted">
            {t("auth:login.noAccount")} {" "}
            <Link
              to="/register"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {t("auth:login.signupNow")}
            </Link>
          </p>
        </section>

        <p className="mt-4 sm:mt-5 text-center text-xs xs:text-xs text-text-muted px-2 leading-relaxed">
          {t("auth:login.agreement")} {" "}
          <Link
            to="/terms"
            className="underline hover:text-text-secondary transition-colors"
          >
            {t("auth:login.terms")}
          </Link>{" "}
          {t("auth:login.agreementAnd")} {" "}
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

const SocialButton: React.FC<{
  provider: "google" | "facebook";
  onClick: () => void;
}> = ({ provider, onClick }) => {
  const { t } = useTranslation();

  const config = {
    google: {
      label: "Google",
      icon: (
        <svg
          className="h-4 w-4 shrink-0 text-primary xs:h-5 xs:w-5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      className:
        "border border-border bg-surface text-text-secondary hover:bg-surface-overlay focus:ring-focus/20",
    },
    facebook: {
      label: "Facebook",
      icon: (
        <svg
          className="h-4 w-4 shrink-0 text-text-inverse xs:h-5 xs:w-5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      className:
        "bg-primary text-text-inverse hover:bg-primary/90 focus:ring-focus/30",
    },
  } as const;

  const { label, icon, className } = config[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full flex items-center justify-center gap-2",
        "min-h-12 px-3 xs:px-4 py-2 xs:py-3",
        "rounded-xl font-medium text-xs xs:text-sm",
        "whitespace-nowrap transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        "active:scale-[.97]",
        className,
      )}
      aria-label={t("auth:login.socialAria", { provider: label })}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default LoginPage;
