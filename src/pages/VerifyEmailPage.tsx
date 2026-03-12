import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { ErrorCode } from "@hacom/chat-shared-types";
import { Button, PageSpinner } from "../components/ui";
import { authApi } from "../services/api";
import { extractApiError } from "../lib/apiContract";

type VerifyState = "loading" | "success" | "missing_token" | "invalid_token" | "server_error";

const cardClassName =
  "animate-fade-in rounded-2xl border border-border bg-surface p-8 text-center shadow-xl";

export const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const [verifyState, setVerifyState] = useState<VerifyState>(() => {
    if (status === "success") {
      return "success";
    }

    if (!token) {
      return "missing_token";
    }

    return "loading";
  });
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "success") {
      setVerifyState("success");
      return;
    }

    if (!token) {
      setVerifyState("missing_token");
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
  }, [status, token]);

  const renderActions = (variant: "register_and_login" | "login_only") => (
    <div className="space-y-4">
      {variant === "register_and_login" ? (
        <Link to="/register">
          <Button variant="primary" fullWidth>
            {t("auth:verifyEmail.goToRegister")}
          </Button>
        </Link>
      ) : (
        <Link to="/login">
          <Button variant="primary" fullWidth size="lg">
            {t("auth:verifyEmail.backToLogin")}
          </Button>
        </Link>
      )}
      {variant === "register_and_login" ? (
        <Link to="/login">
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
            <Link to="/login">
              <Button variant="primary" fullWidth size="lg">
                {t("auth:verifyEmail.backToLogin")}
              </Button>
            </Link>
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
      <div className="relative w-full max-w-md">
        <div className={cardClassName}>
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger/15">
            <ExclamationTriangleIcon className="h-8 w-8 text-danger" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-text-primary">{title}</h1>
          <p className="mb-6 text-text-muted">{description}</p>
          {renderActions(
            verifyState === "server_error" ? "login_only" : "register_and_login",
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
