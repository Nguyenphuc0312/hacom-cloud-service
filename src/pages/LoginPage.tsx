import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { TabTrigger, toast } from "../components/ui";
import { AuthCard, AuthShell, QrLoginPanel } from "../components/auth";
import { PasswordLoginForm } from "../components/auth/PasswordLoginForm";
import { loginSchema } from "../lib/validations";
import type { LoginFormData } from "../lib/validations";
import { useAuthStore } from "../stores";

export const LoginPage: React.FC = () => {
  const { t } = useTranslation("auth");
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

  return (
    <AuthShell maxWidth="md">
      <AuthCard ariaLabel={t("login.aria.section")}>
        <header className="mb-6 text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-text-inverse shadow-sm">
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {t("login.title")}
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {t("login.subtitle")}
          </p>
        </header>

        <div
          role="tablist"
          aria-label={t("login.methods")}
          className="mb-5 grid grid-cols-2 rounded-2xl border border-border bg-surface-overlay/70 p-1"
        >
          <TabTrigger
            role="tab"
            id="login-tab-password"
            aria-controls="login-panel-password"
            active={authMethod === "password"}
            aria-selected={authMethod === "password"}
            onClick={() => setAuthMethod("password")}
          >
            {t("login.passwordTab")}
          </TabTrigger>
          <TabTrigger
            role="tab"
            id="login-tab-qr"
            aria-controls="login-panel-qr"
            active={authMethod === "qr"}
            aria-selected={authMethod === "qr"}
            onClick={() => setAuthMethod("qr")}
          >
            {t("login.qrTab")}
          </TabTrigger>
        </div>

        {authMethod === "password" && (
          <PasswordLoginForm
            register={register}
            errors={errors}
            isLoading={isLoading}
            isSubmitting={isSubmitting}
            authError={error}
            onSubmit={handleSubmit(onSubmit)}
            showSocialLogin={false}
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
              {t("login.qrHint")}
            </p>
            <QrLoginPanel
              rememberMe={rememberMe}
              onSuccess={() => {
                toast.success(t("toast.loginQrSuccess"));
                const from =
                  (location.state as { from?: string })?.from ?? "/chat";
                navigate(from, { replace: true });
              }}
            />
          </div>
        )}

        <p className="mt-6 text-center text-sm text-text-muted">
          {t("login.noAccount")}{" "}
          <Link
            to="/register"
            className="font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {t("login.signupNow")}
          </Link>
        </p>
      </AuthCard>

      <p className="mt-4 px-2 text-center text-caption leading-relaxed text-text-muted">
        {t("login.agreement")}{" "}
        <Link
          to="/terms"
          className="underline hover:text-text-secondary transition-colors"
        >
          {t("login.terms")}
        </Link>{" "}
        {t("login.agreementAnd")}{" "}
        <Link
          to="/privacy"
          className="underline hover:text-text-secondary transition-colors"
        >
          {t("login.privacy")}
        </Link>
      </p>
    </AuthShell>
  );
};

export default LoginPage;
