import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { ErrorCode } from "@hacom/chat-shared-types";
import { Button, Input, PageSpinner, toast } from "../components/ui";
import { authApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";
import { useAuthStore } from "../stores/authStore";
import { forgotPasswordSchema } from "../lib/validations";
import type { ForgotPasswordFormData } from "../lib/validations";
import { ROUTE_PATHS } from "../router/paths";

type VerifyState =
  | "loading"
  | "success"
  | "pending_verification"
  | "missing_token"
  | "invalid_token"
  | "server_error";

const cardClassName =
  "animate-fade-in rounded-2xl border border-border bg-surface p-8 text-center shadow-xl";

const normalizeEmail = (value: string | null): string =>
  value?.trim().toLowerCase() || "";

export const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const emailFromQuery = normalizeEmail(searchParams.get("email"));
  const pendingVerificationEmail = useAuthStore(
    (state) => state.pendingVerificationEmail,
  );
  const setPendingVerificationEmail = useAuthStore(
    (state) => state.setPendingVerificationEmail,
  );
  const clearPendingVerificationEmail = useAuthStore(
    (state) => state.clearPendingVerificationEmail,
  );
  const verificationEmail = useMemo(
    () => normalizeEmail(pendingVerificationEmail) || emailFromQuery,
    [emailFromQuery, pendingVerificationEmail],
  );
  const [verifyState, setVerifyState] = useState<VerifyState>(() => {
    if (status === "success") {
      return "success";
    }

    if (token) {
      return "loading";
    }

    if (verificationEmail) {
      return "pending_verification";
    }

    return "missing_token";
  });
  const requestedTokenRef = useRef<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: verificationEmail,
    },
  });

  useEffect(() => {
    if (status !== "success" && emailFromQuery) {
      setPendingVerificationEmail(emailFromQuery);
    }
  }, [emailFromQuery, setPendingVerificationEmail, status]);

  useEffect(() => {
    setValue("email", verificationEmail);
  }, [setValue, verificationEmail]);

  useEffect(() => {
    if (status === "success") {
      clearPendingVerificationEmail();
      setVerifyState("success");
      return;
    }

    if (!token) {
      setVerifyState(
        verificationEmail ? "pending_verification" : "missing_token",
      );
      return;
    }

    if (requestedTokenRef.current === token) {
      return;
    }

    requestedTokenRef.current = token;
    setVerifyState("loading");

    void authApi
      .verifyEmail(token)
      .then(() => {
        clearPendingVerificationEmail();
        setVerifyState("success");
      })
      .catch((error: unknown) => {
        const apiError = extractApiError(error);
        const isKnownTokenFailure =
          apiError.statusCode === 400 ||
          apiError.statusCode === 401 ||
          apiError.statusCode === 410 ||
          apiError.code === ErrorCode.INVALID_TOKEN ||
          apiError.code === ErrorCode.TOKEN_EXPIRED ||
          apiError.code === ErrorCode.AUTH_INVALID_TOKEN ||
          apiError.code === ErrorCode.AUTH_TOKEN_EXPIRED;

        setVerifyState(isKnownTokenFailure ? "invalid_token" : "server_error");
      });
  }, [
    clearPendingVerificationEmail,
    status,
    token,
    verificationEmail,
  ]);

  const handleResendVerification = async (email: string) => {
    if (!email || isResending) {
      return;
    }

    setIsResending(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      await authApi.requestEmailVerification(normalizedEmail);
      setPendingVerificationEmail(normalizedEmail);
      toast.success(t("auth:toast.verificationEmailResent"));
    } catch {
      toast.success(t("auth:toast.verificationEmailResentFallback"));
    } finally {
      setIsResending(false);
    }
  };

  const handleManualResendVerification = async (
    data: ForgotPasswordFormData,
  ) => {
    await handleResendVerification(data.email);
  };

  const renderActions = (variant: "register_and_login" | "login_only") => (
    <div className="space-y-4">
      {verificationEmail && variant === "register_and_login" ? (
        <Button
          variant="outline"
          fullWidth
          isLoading={isResending}
          disabled={isResending}
          onClick={() => void handleResendVerification(verificationEmail)}
        >
          {t("auth:verifyEmail.requestNewLink")}
        </Button>
      ) : null}
      {variant === "register_and_login" ? (
        <Link to={ROUTE_PATHS.REGISTER}>
          <Button variant="primary" fullWidth>
            {t("auth:verifyEmail.goToRegister")}
          </Button>
        </Link>
      ) : (
        <Link to={ROUTE_PATHS.LOGIN}>
          <Button variant="primary" fullWidth size="lg">
            {t("auth:verifyEmail.backToLogin")}
          </Button>
        </Link>
      )}
      {variant === "register_and_login" ? (
        <Link to={ROUTE_PATHS.LOGIN}>
          <Button variant="ghost" fullWidth>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            {t("auth:verifyEmail.backToLogin")}
          </Button>
        </Link>
      ) : null}
    </div>
  );

  if (verifyState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">
          <div className={cardClassName}>
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-text-inverse" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {t("auth:verifyEmail.title")}
            </h1>
            <p className="mb-6 text-text-muted">
              {t("auth:verifyEmail.subtitle")}
            </p>
            <PageSpinner message={t("auth:verifyEmail.subtitle")} />
          </div>
        </div>
      </div>
    );
  }

  if (verifyState === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className={cardClassName}>
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
              <CheckCircleIcon className="h-8 w-8 text-success" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {t("auth:verifyEmail.successTitle")}
            </h1>
            <p className="mb-6 text-text-muted">
              {t("auth:verifyEmail.successDescription")}
            </p>
            <p className="mb-6 text-sm text-text-muted">
              {t("auth:verifyEmail.successNextStep")}
            </p>
            <Link to={ROUTE_PATHS.LOGIN}>
              <Button variant="primary" fullWidth size="lg">
                {t("auth:verifyEmail.backToLogin")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (verifyState === "pending_verification") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className={cardClassName}>
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <EnvelopeIcon className="h-8 w-8 text-primary" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {t("auth:verifyEmail.pendingTitle")}
            </h1>
            <p className="mb-4 text-text-muted">
              {t("auth:verifyEmail.pendingDescription")}
            </p>
            <p className="mb-6 text-sm text-text-muted">
              {t("auth:verifyEmail.resendHint", { email: verificationEmail })}
            </p>
            <p className="mb-6 rounded-xl bg-primary/5 px-4 py-3 text-left text-sm text-text-muted">
              {t("auth:verifyEmail.pendingHint")}
            </p>
            {renderActions("register_and_login")}
          </div>
        </div>
      </div>
    );
  }

  const isMissingToken = verifyState === "missing_token";
  const title = isMissingToken
    ? t("auth:verifyEmail.missingTokenTitle")
    : verifyState === "invalid_token"
      ? t("auth:verifyEmail.invalidTokenTitle")
      : t("auth:verifyEmail.serverErrorTitle");
  const description = isMissingToken
    ? t("auth:verifyEmail.missingTokenDescription")
    : verifyState === "invalid_token"
      ? t("auth:verifyEmail.invalidTokenDescription")
      : t("auth:verifyEmail.serverErrorDescription");
  const helperText =
    verificationEmail && verifyState !== "server_error"
      ? t("auth:verifyEmail.resendHint", { email: verificationEmail })
      : null;
  const canManualResend = !verificationEmail && verifyState !== "server_error";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
      <div className="relative w-full max-w-md">
        <div className={cardClassName}>
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger/15">
            <ExclamationTriangleIcon className="h-8 w-8 text-danger" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-text-primary">{title}</h1>
          <p className="mb-6 text-text-muted">{description}</p>
          {helperText ? (
            <p className="mb-6 text-sm text-text-muted">{helperText}</p>
          ) : null}
          {canManualResend ? (
            <form
              onSubmit={handleSubmit(handleManualResendVerification)}
              className="mb-6 space-y-4 text-left"
            >
              <p className="text-sm text-text-muted">
                {t("auth:verifyEmail.manualResendDescription")}
              </p>
              <Input
                {...register("email")}
                type="email"
                label={t("auth:login.email")}
                placeholder={t("auth:placeholders.email")}
                leftIcon={<EnvelopeIcon className="h-5 w-5" />}
                error={errors.email?.message}
                autoComplete="email"
                disabled={isResending}
              />
              <Button
                type="submit"
                variant="outline"
                fullWidth
                isLoading={isResending}
                disabled={isResending}
              >
                {t("auth:verifyEmail.requestNewLink")}
              </Button>
            </form>
          ) : null}
          {renderActions(
            verifyState === "server_error" ? "login_only" : "register_and_login",
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
