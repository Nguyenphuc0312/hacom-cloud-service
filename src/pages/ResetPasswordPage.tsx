/**
 * @fileoverview Reset Password Page
 * Route: /reset-password?token=...
 * Allows user to set a new password using a reset token from email.
 */

import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import {
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button, Input, toast } from "../components/ui";
import { PasswordStrength } from "../components/ui";
import { resetPasswordSchema } from "../lib/validations";
import type { ResetPasswordFormData } from "../lib/validations";
import { authApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";

export const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setFocus,
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordValue = watch("password");

  useEffect(() => {
    if (!token) {
      setTokenError(t("auth:reset.invalidToken"));
    }
  }, [token, t]);

  useEffect(() => {
    if (token) {
      setFocus("password");
    }
  }, [token, setFocus]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) return;

    setIsLoading(true);
    setTokenError(null);
    try {
      await authApi.resetPassword(token, data.password, data.confirmPassword);
      setIsSubmitted(true);
      toast.success(t("auth:reset.successTitle"));
    } catch (err) {
      const apiError = extractApiError(err);
      // Check for invalid/expired token errors
      if (
        apiError.statusCode === 400 ||
        apiError.statusCode === 401 ||
        apiError.statusCode === 410
      ) {
        setTokenError(t("auth:reset.invalidToken"));
      } else {
        toast.error(apiError.message || t("error:generic.requestFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Invalid/expired token state
  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="animate-fade-in rounded-2xl border border-border bg-surface p-8 text-center shadow-xl">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger/15">
              <ExclamationTriangleIcon className="h-8 w-8 text-danger" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {t("auth:reset.invalidToken")}
            </h1>
            <p className="mb-6 text-text-muted">
              {t("auth:reset.invalidTokenDescription")}
            </p>
            <div className="space-y-4">
              <Link to="/forgot-password">
                <Button variant="primary" fullWidth>
                  {t("auth:reset.requestNewLink")}
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="ghost" fullWidth>
                  <ArrowLeftIcon className="mr-2 h-4 w-4" />
                  {t("auth:forgot.backToLogin")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="animate-fade-in rounded-2xl border border-border bg-surface p-8 text-center shadow-xl">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
              <CheckCircleIcon className="h-8 w-8 text-success" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {t("auth:reset.successTitle")}
            </h1>
            <p className="mb-6 text-text-muted">
              {t("auth:reset.successDescription")}
            </p>
            <p className="mb-6 text-sm text-text-muted">
              {t("auth:reset.successSecurityHint")}
            </p>
            <Link to="/login">
              <Button variant="primary" fullWidth size="lg">
                {t("auth:reset.goToLogin")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="animate-fade-in rounded-2xl border border-border bg-surface p-8 shadow-xl">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-text-inverse" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">
              {t("auth:reset.title")}
            </h1>
            <p className="mt-2 text-text-muted">{t("auth:reset.subtitle")}</p>
            <p className="mt-3 text-sm text-text-muted">
              {t("auth:reset.securityHint")}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
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
              {passwordValue && (
                <div className="mt-2">
                  <PasswordStrength password={passwordValue} />
                </div>
              )}
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

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              disabled={isLoading}
            >
              {t("auth:reset.submit")}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-text-muted hover:text-text-secondary"
            >
              <ArrowLeftIcon className="mr-1 h-4 w-4" />
              {t("auth:forgot.backToLogin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
