import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  EnvelopeIcon,
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { AuthCard, AuthShell } from "../components/auth";
import {
  Button,
  Input,
  Checkbox,
  toast,
  PasswordStrength,
} from "../components/ui";
import { registerSchema } from "../lib/validations";
import type { RegisterFormData } from "../lib/validations";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";

export const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    register: registerUser,
    isLoading,
    isAuthenticated,
    error,
    clearError,
  } = useAuthStore();

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
    control,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: undefined as unknown as true,
    },
    mode: "onChange",
  });

  const password = useWatch({ control, name: "password" }) ?? "";

  useEffect(() => {
    setFocus("email");
  }, [setFocus]);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      const normalizedEmail = data.email.trim().toLowerCase();

      const registerResult = await registerUser({
        email: normalizedEmail,
        password: data.password,
      });

      if (!registerResult.verificationRequired) {
        toast.success("Đăng ký thành công.");
        navigate(ROUTE_PATHS.LOGIN, { replace: true });
        return;
      }

      const verificationEmail = registerResult.email || normalizedEmail;
      const registerChallengeId = registerResult.challengeId;
      const verifyQuery = new URLSearchParams({
        email: verificationEmail,
        source: "signup",
      });
      if (registerChallengeId) {
        verifyQuery.set("challengeId", registerChallengeId);
      }
      if (registerResult.expiresAt) {
        verifyQuery.set("expiresAt", registerResult.expiresAt);
      }

      toast.success(t("auth:toast.registerVerificationRequired"));
      navigate(`${ROUTE_PATHS.VERIFY_EMAIL}?${verifyQuery.toString()}`, {
        replace: true,
        state: {
          source: "signup" as const,
          email: verificationEmail,
          challengeId: registerChallengeId || null,
          expiresAt: registerResult.expiresAt,
        },
      });
    } catch (err) {
      toast.error((err as Error).message ?? t("auth:toast.registerFailed"));
    }
  };

  return (
    <AuthShell maxWidth="md">
      <AuthCard
        ariaLabel={t("auth:register.aria.section")}
        className="p-5 sm:p-7"
      >
        <header className="mb-6 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-text-inverse shadow-elev1 sm:h-14 sm:w-14">
            <ChatBubbleLeftRightIcon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h1 className="text-title text-text-primary sm:text-2xl">
            {t("auth:register.title")}
          </h1>
          <p className="mt-2 text-body-sm text-text-muted">
            {t("auth:register.subtitle")}
          </p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div
            className={clsx(
              "transition-all duration-200 overflow-hidden",
              error ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
            )}
            aria-live="polite"
          >
            {error ? (
              <div
                role="alert"
                className="animate-shake rounded-lg border border-danger/35 bg-danger/15 p-3 text-body-sm text-danger"
              >
                {error}
              </div>
            ) : null}
          </div>

          <Input
            {...register("email")}
            type="email"
            label={t("auth:register.email")}
            placeholder={t("auth:placeholders.email")}
            leftIcon={<EnvelopeIcon className="h-5 w-5" />}
            error={errors.email?.message}
            autoComplete="email"
            inputMode="email"
            disabled={isLoading}
          />

          <div className="space-y-2">
            <Input
              {...register("password")}
              type="password"
              label={t("auth:register.password")}
              placeholder={t("auth:placeholders.password")}
              leftIcon={<LockClosedIcon className="h-5 w-5" />}
              error={errors.password?.message}
              autoComplete="new-password"
              disabled={isLoading}
            />
            <PasswordStrength password={password ?? ""} />
          </div>

          <Input
            {...register("confirmPassword")}
            type="password"
            label={t("auth:register.confirmPassword")}
            placeholder={t("auth:placeholders.password")}
            leftIcon={<LockClosedIcon className="h-5 w-5" />}
            error={errors.confirmPassword?.message}
            autoComplete="new-password"
            disabled={isLoading}
          />

          <Checkbox
            {...register("acceptTerms")}
            label={
              <span className="text-body-sm leading-snug">
                {t("auth:register.acceptTermsPrefix")}{" "}
                <Link
                  to="/terms"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("auth:register.terms")}
                </Link>{" "}
                {t("auth:register.acceptTermsAnd")}{" "}
                <Link
                  to="/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("auth:register.privacy")}
                </Link>
              </span>
            }
            error={errors.acceptTerms?.message}
            disabled={isLoading}
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            isLoading={isLoading || isSubmitting}
            disabled={isLoading || isSubmitting}
            aria-busy={isLoading || isSubmitting}
          >
            {t("auth:register.submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-body-sm text-text-muted">
          {t("auth:register.haveAccount")}{" "}
          <Link
            to={ROUTE_PATHS.LOGIN}
            className="font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {t("auth:register.loginNow")}
          </Link>
        </p>
      </AuthCard>

      <p className="mt-4 px-2 text-center text-caption leading-relaxed text-text-muted">
        {t("auth:register.footerPrivacyPrefix")}{" "}
        <Link
          to="/privacy"
          className="underline hover:text-text-secondary transition-colors"
        >
          {t("auth:register.privacy")}
        </Link>{" "}
        {t("auth:register.footerPrivacySuffix")}
      </p>
    </AuthShell>
  );
};

export default RegisterPage;
