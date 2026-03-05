import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
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
import apiClient from "../lib/axios";

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
};

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

  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({ checking: false, available: null, message: "" });

  useEffect(() => {
    if (isAuthenticated) navigate("/chat", { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      acceptTerms: undefined as unknown as true,
    },
    mode: "onChange",
  });

  const password = watch("password");
  const username = watch("username");
  const debouncedUsername = useDebounce(username, 500);

  useEffect(() => {
    setFocus("username");
  }, [setFocus]);

  const checkUsername = useCallback(
    async (value: string) => {
      if (!value || value.length < 3) {
        setUsernameStatus({ checking: false, available: null, message: "" });
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        setUsernameStatus({
          checking: false,
          available: false,
          message: t("auth:username.invalid"),
        });
        return;
      }
      setUsernameStatus({
        checking: true,
        available: null,
        message: t("auth:username.checking"),
      });
      try {
        const response = await apiClient.get(`/users/check-username/${value}`);
        const isAvailable = response.data.data?.available ?? true;
        setUsernameStatus({
          checking: false,
          available: isAvailable,
          message: isAvailable
            ? t("auth:username.available")
            : t("auth:username.taken"),
        });
      } catch {
        setUsernameStatus({ checking: false, available: true, message: "" });
      }
    },
    [t],
  );

  useEffect(() => {
    checkUsername(debouncedUsername);
  }, [debouncedUsername, checkUsername]);

  const onSubmit = async (data: RegisterFormData) => {
    if (usernameStatus.available === false) {
      toast.error(t("auth:username.taken"));
      return;
    }
    try {
      await registerUser({
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      toast.success("Registration submitted. Please check your email to verify your account.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error((err as Error).message ?? t("auth:toast.registerFailed"));
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
        <div className="absolute -top-40 -left-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-secondary/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full mx-auto max-w-sm xs:max-w-sm sm:max-w-lg lg:max-w-xl">
        <section
          aria-label={t("auth:register.aria.section")}
          className="bg-surface rounded-2xl shadow-xl border border-border animate-fade-in p-5 xs:p-6 sm:p-8 lg:p-10"
        >
          <header className="text-center mb-5 sm:mb-6 lg:mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl mb-3 sm:mb-4 shadow-lg shadow-elev2 bg-primary w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16">
              <ChatBubbleLeftRightIcon className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 text-text-inverse" />
            </div>
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-text-primary leading-tight">
              {t("auth:register.title")}
            </h1>
            <p className="text-xs xs:text-sm sm:text-base text-text-muted mt-1 sm:mt-2">
              {t("auth:register.subtitle")}
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

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4">
              <Input
                {...register("firstName")}
                label={t("auth:register.firstName")}
                placeholder={t("auth:placeholders.firstName")}
                error={errors.firstName?.message}
                disabled={isLoading}
              />
              <Input
                {...register("lastName")}
                label={t("auth:register.lastName")}
                placeholder={t("auth:placeholders.lastName")}
                error={errors.lastName?.message}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <Input
                {...register("username")}
                label={t("auth:register.username")}
                placeholder={t("auth:placeholders.username")}
                leftIcon={<UserIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
                error={errors.username?.message}
                autoComplete="username"
                disabled={isLoading}
                rightIcon={
                  usernameStatus.checking ? (
                    <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
                  ) : usernameStatus.available === true ? (
                    <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                  ) : usernameStatus.available === false ? (
                    <XCircleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-danger" />
                  ) : null
                }
              />
              <div
                className={clsx(
                  "transition-all duration-150 overflow-hidden",
                  usernameStatus.message && !errors.username
                    ? "max-h-8 opacity-100"
                    : "max-h-0 opacity-0",
                )}
              >
                <p
                  className={clsx(
                    "text-xs xs:text-xs",
                    usernameStatus.available === true && "text-success",
                    usernameStatus.available === false && "text-danger",
                    usernameStatus.checking && "text-text-muted",
                  )}
                >
                  {usernameStatus.message}
                </p>
              </div>
            </div>

            <Input
              {...register("email")}
              type="email"
              label={t("auth:register.email")}
              placeholder={t("auth:placeholders.email")}
              leftIcon={<EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
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
                leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
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
              leftIcon={<LockClosedIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
              disabled={isLoading}
            />

            <Checkbox
              {...register("acceptTerms")}
              label={
                <span className="text-xs xs:text-sm leading-snug">
                  {t("auth:register.acceptTermsPrefix")} {" "}
                  <Link
                    to="/terms"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("auth:register.terms")}
                  </Link>{" "}
                  {t("auth:register.acceptTermsAnd")} {" "}
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
              disabled={
                isLoading || isSubmitting || usernameStatus.available === false
              }
              aria-busy={isLoading || isSubmitting}
            >
              {t("auth:register.submit")}
            </Button>
          </form>

          <p className="mt-5 sm:mt-6 lg:mt-8 text-center text-xs xs:text-sm text-text-muted">
            {t("auth:register.haveAccount")} {" "}
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              {t("auth:register.loginNow")}
            </Link>
          </p>
        </section>

        <p className="mt-4 sm:mt-5 text-center text-xs xs:text-xs text-text-muted px-2 leading-relaxed">
          {t("auth:register.footerPrivacyPrefix")} {" "}
          <Link
            to="/privacy"
            className="underline hover:text-text-secondary transition-colors"
          >
            {t("auth:register.privacy")}
          </Link>{" "}
          {t("auth:register.footerPrivacySuffix")}
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
