import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { ErrorCode } from "@hacom/chat-shared-types";
import { Button, PageSpinner, toast } from "../components/ui";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { authApi } from "../services/api";
import type { EmailVerificationChallengeSnapshot } from "../stores/authStore";
import { useEmailVerificationChallenge, useResendCooldown } from "../hooks";
import { EmailOtpInput } from "../components/auth";
import { ROUTE_PATHS } from "../router/paths";

const cardClassName =
  "animate-fade-in rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8";

const normalizeEmail = (value: string | null | undefined): string =>
  value?.trim().toLowerCase() || "";

const parseDateMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const buildChallengeSnapshot = (
  email: string,
  challengeId: string,
  expiresAt: string,
  resendAvailableAt: string,
): EmailVerificationChallengeSnapshot => ({
  challengeId,
  email,
  expiresAt,
  resendAvailableAt,
  purpose: "signup",
});

type PageMode =
  | "booting"
  | "requesting"
  | "ready"
  | "confirming"
  | "resending"
  | "verified"
  | "error";

const OTP_LENGTH = 6;

export const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const queryEmail = normalizeEmail(searchParams.get("email"));
  const {
    pendingVerificationEmail,
    emailVerificationChallenge: verificationChallenge,
    setPendingVerificationEmail,
    clearPendingVerificationEmail,
    setEmailVerificationChallenge,
    clearEmailVerificationChallenge,
  } = useEmailVerificationChallenge();

  const verificationEmail = useMemo(
    () =>
      normalizeEmail(pendingVerificationEmail) ||
      queryEmail ||
      normalizeEmail(verificationChallenge?.email),
    [pendingVerificationEmail, queryEmail, verificationChallenge?.email],
  );

  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<PageMode>(() => {
    if (!verificationEmail) {
      return "error";
    }

    return verificationChallenge ? "ready" : "requesting";
  });
  const [screenMessage, setScreenMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const autoRequestedEmailRef = useRef<string | null>(null);

  const activeChallenge = useMemo(() => {
    if (!verificationChallenge) {
      return null;
    }

    if (!verificationEmail) {
      return verificationChallenge;
    }

    return normalizeEmail(verificationChallenge.email) === verificationEmail
      ? verificationChallenge
      : null;
  }, [verificationChallenge, verificationEmail]);

  const expiresAtMs = parseDateMs(activeChallenge?.expiresAt);
  const {
    now,
    secondsRemaining: resendCooldownSeconds,
    formattedRemaining: resendCooldownLabel,
    canResend: canResendAfterCooldown,
  } = useResendCooldown(activeChallenge?.resendAvailableAt);
  const expirySeconds =
    expiresAtMs === null
      ? null
      : Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
  const isChallengeExpired = expirySeconds === 0 && Boolean(activeChallenge);
  const hasActiveChallenge = Boolean(activeChallenge?.challengeId);
  const isBusy =
    mode === "booting" ||
    mode === "requesting" ||
    mode === "confirming" ||
    mode === "resending";
  const canSubmit =
    hasActiveChallenge &&
    !isChallengeExpired &&
    otp.length === OTP_LENGTH &&
    !isBusy;
  const canResendActiveChallenge =
    hasActiveChallenge &&
    !isChallengeExpired &&
    canResendAfterCooldown &&
    !isBusy;
  const canRequestFreshChallenge = Boolean(verificationEmail) && !isBusy;

  const requestFreshChallenge = useCallback(async (): Promise<void> => {
    if (!verificationEmail || mode === "requesting") {
      return;
    }

    setMode("requesting");
    setFormError(null);
    setScreenMessage(t("auth:verifyEmail.requestingOtp"));

    try {
      const response = await authApi.requestEmailOtpChallenge({
        email: verificationEmail,
        purpose: "signup",
      });
      const payload = unwrapApiSuccess(response);

      if (payload.verified || !payload.challengeId) {
        clearPendingVerificationEmail();
        clearEmailVerificationChallenge();
        setMode("verified");
        setScreenMessage(null);
        toast.success(t("auth:toast.emailOtpVerified"));
        return;
      }

      const snapshot = buildChallengeSnapshot(
        verificationEmail,
        payload.challengeId,
        payload.expiresAt || new Date().toISOString(),
        payload.resendAvailableAt || new Date().toISOString(),
      );
      setPendingVerificationEmail(verificationEmail);
      setEmailVerificationChallenge(snapshot);
      setOtp("");
      setMode("ready");
      toast.success(t("auth:toast.emailOtpSent"));
    } catch (error: unknown) {
      const message = mapOtpErrorMessage(error, t);
      setMode("error");
      setFormError(message);
      setScreenMessage(message);
    }
  }, [
    clearEmailVerificationChallenge,
    clearPendingVerificationEmail,
    mode,
    setEmailVerificationChallenge,
    setPendingVerificationEmail,
    t,
    verificationEmail,
  ]);

  useEffect(() => {
    if (
      !verificationEmail ||
      activeChallenge ||
      autoRequestedEmailRef.current === verificationEmail
    ) {
      return;
    }

    // Schedule as a microtask so StrictMode cleanup cannot cancel it like a timeout.
    autoRequestedEmailRef.current = verificationEmail;
    Promise.resolve().then(() => {
      void requestFreshChallenge();
    });
  }, [activeChallenge, requestFreshChallenge, verificationEmail]);

  const resetFormError = () => {
    setFormError(null);
    setScreenMessage(null);
  };

  const handleOtpChange = (value: string) => {
    const numeric = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(numeric);
    if (formError) {
      resetFormError();
    }
  };

  const resendChallenge = async (): Promise<void> => {
    if (!verificationEmail || !activeChallenge) {
      await requestFreshChallenge();
      return;
    }

    if (isChallengeExpired || (resendCooldownSeconds ?? 0) > 0) {
      return;
    }

    setMode("resending");
    setFormError(null);
    setScreenMessage(t("auth:verifyEmail.resendingOtp"));

    try {
      const response = await authApi.resendEmailOtpChallenge({
        challengeId: activeChallenge.challengeId,
        purpose: "signup",
      });
      const payload = unwrapApiSuccess(response);
      const snapshot = buildChallengeSnapshot(
        verificationEmail,
        payload.challengeId || activeChallenge.challengeId,
        payload.expiresAt || new Date().toISOString(),
        payload.resendAvailableAt || new Date().toISOString(),
      );
      setPendingVerificationEmail(verificationEmail);
      setEmailVerificationChallenge(snapshot);
      setOtp("");
      setMode("ready");
      toast.success(t("auth:toast.emailOtpResent"));
    } catch (error: unknown) {
      const message = mapOtpErrorMessage(error, t);
      setMode("error");
      setFormError(message);
      setScreenMessage(message);
      if (shouldReplaceChallenge(error)) {
        clearEmailVerificationChallenge();
      }
    }
  };

  const confirmChallenge = async (otpValue = otp): Promise<void> => {
    if (!activeChallenge || otpValue.length !== OTP_LENGTH) {
      setFormError(t("auth:verifyEmail.otpRequired"));
      return;
    }

    if (isChallengeExpired) {
      setFormError(t("auth:verifyEmail.otpExpired"));
      return;
    }

    setMode("confirming");
    setFormError(null);
    setScreenMessage(t("auth:verifyEmail.confirmingOtp"));

    try {
      const response = await authApi.confirmEmailOtpChallenge({
        challengeId: activeChallenge.challengeId,
        otp: otpValue,
        purpose: "signup",
      });
      const payload = unwrapApiSuccess(response);

      if (payload.verified) {
        clearPendingVerificationEmail();
        clearEmailVerificationChallenge();
        setOtp("");
        setMode("verified");
        setScreenMessage(null);
        toast.success(t("auth:toast.emailOtpVerified"));
      }
    } catch (error: unknown) {
      const message = mapOtpErrorMessage(error, t);
      setMode("ready");
      setFormError(message);
      setScreenMessage(message);
      if (shouldReplaceChallenge(error)) {
        clearEmailVerificationChallenge();
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await confirmChallenge();
  };

  const expiredLabel =
    expirySeconds === null
      ? null
      : expirySeconds > 0
        ? formatCountdown(expirySeconds)
        : t("auth:verifyEmail.expired");
  const resendLabel =
    resendCooldownSeconds === null
      ? null
      : resendCooldownSeconds > 0
        ? resendCooldownLabel
        : null;
  const missingEmailMessage = !verificationEmail
    ? t("auth:verifyEmail.missingEmailDescription")
    : null;

  const pageTitle =
    mode === "verified"
      ? t("auth:verifyEmail.successTitle")
      : t("auth:verifyEmail.title");

  const pageDescription =
    mode === "verified"
      ? t("auth:verifyEmail.successDescription")
      : verificationEmail
        ? t("auth:verifyEmail.subtitleWithEmail", { email: verificationEmail })
        : missingEmailMessage || t("auth:verifyEmail.subtitle");

  if (mode === "booting" || mode === "requesting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className={cardClassName}>
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-text-inverse" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-text-primary">
              {pageTitle}
            </h1>
            <p className="mb-6 text-text-muted">{pageDescription}</p>
            <PageSpinner message={screenMessage || pageDescription} />
          </div>
        </div>
      </div>
    );
  }

  if (mode === "verified") {
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
            <div className="space-y-3">
              <Link to={ROUTE_PATHS.LOGIN}>
                <Button variant="primary" fullWidth size="lg">
                  {t("auth:verifyEmail.backToLogin")}
                </Button>
              </Link>
              <Link to={ROUTE_PATHS.REGISTER}>
                <Button variant="ghost" fullWidth>
                  {t("auth:verifyEmail.goToRegister")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const expiryBanner = expiredLabel ? (
    <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      <span className="rounded-full bg-surface-overlay px-3 py-1">
        {t("auth:verifyEmail.expiresIn", { time: expiredLabel })}
      </span>
      {resendLabel ? (
        <span className="rounded-full bg-surface-overlay px-3 py-1">
          {t("auth:verifyEmail.resendIn", { time: resendLabel })}
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-8 sm:py-12">
      <div className="relative w-full max-w-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />
        </div>

        <section
          className={`${cardClassName} relative`}
          aria-label={t("auth:verifyEmail.aria.section")}
        >
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
            <EnvelopeIcon className="h-8 w-8 text-text-inverse" />
          </div>

          <header className="mb-6 space-y-2">
            <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
              {pageTitle}
            </h1>
            <p className="text-text-muted">{pageDescription}</p>
            {verificationEmail ? (
              <p className="text-sm text-text-secondary">
                {t("auth:verifyEmail.sentTo", { email: verificationEmail })}
              </p>
            ) : null}
          </header>

          {screenMessage ? (
            <div
              role="status"
              className="mb-5 rounded-xl border border-border bg-surface-overlay px-4 py-3 text-sm text-text-secondary"
            >
              {screenMessage}
            </div>
          ) : null}

          {formError || missingEmailMessage ? (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {formError || missingEmailMessage}
            </div>
          ) : null}

          <div className="mb-5 space-y-3">
            {expiryBanner}
            {!hasActiveChallenge && verificationEmail ? (
              <p className="text-sm text-text-muted">
                {t("auth:verifyEmail.noActiveChallenge")}
              </p>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <EmailOtpInput
              value={otp}
              onChange={handleOtpChange}
              onComplete={(value) => {
                if (value.length === OTP_LENGTH) {
                  void confirmChallenge(value);
                }
              }}
              length={OTP_LENGTH}
              label={t("auth:verifyEmail.otpLabel")}
              hint={t("auth:verifyEmail.otpHint")}
              error={formError}
              autoFocus={Boolean(hasActiveChallenge)}
              disabled={
                !hasActiveChallenge ||
                mode === "confirming" ||
                mode === "resending"
              }
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={mode === "confirming"}
              disabled={!canSubmit}
            >
              {t("auth:verifyEmail.submit")}
            </Button>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                isLoading={mode === "resending"}
                disabled={
                  isBusy ||
                  (!canResendActiveChallenge && !canRequestFreshChallenge)
                }
                onClick={() => void resendChallenge()}
              >
                {isChallengeExpired
                  ? t("auth:verifyEmail.requestNewCode")
                  : t("auth:verifyEmail.resend")}
              </Button>

              <Button
                type="button"
                variant="ghost"
                fullWidth
                disabled={!verificationEmail || isBusy}
                onClick={() => void requestFreshChallenge()}
              >
                {t("auth:verifyEmail.requestFreshCode")}
              </Button>
            </div>
          </form>

          <div className="mt-6 rounded-2xl bg-primary/5 px-4 py-4 text-sm text-text-muted">
            <p>{t("auth:verifyEmail.securityHint")}</p>
            {verificationChallenge?.challengeId ? (
              <p className="mt-2 text-xs text-text-secondary">
                {t("auth:verifyEmail.reloadHint")}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to={ROUTE_PATHS.LOGIN} className="sm:flex-1">
              <Button variant="ghost" fullWidth>
                {t("auth:verifyEmail.backToLogin")}
              </Button>
            </Link>
            <Link to={ROUTE_PATHS.REGISTER} className="sm:flex-1">
              <Button variant="secondary" fullWidth>
                {t("auth:verifyEmail.goToRegister")}
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

const mapOtpErrorMessage = (
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const apiError = extractApiError(error);

  if (apiError.code === ErrorCode.OTP_EXPIRED) {
    return t("auth:verifyEmail.otpExpired");
  }

  if (apiError.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS) {
    return t("auth:verifyEmail.otpLocked");
  }

  if (apiError.code === ErrorCode.OTP_INVALID) {
    return t("auth:verifyEmail.otpInvalid");
  }

  if (apiError.code === ErrorCode.RATE_LIMITED || apiError.statusCode === 429) {
    return t("auth:verifyEmail.rateLimited");
  }

  if (
    apiError.code === ErrorCode.SERVER_SERVICE_UNAVAILABLE ||
    apiError.statusCode === 503
  ) {
    return t("auth:verifyEmail.networkUnavailable");
  }

  if (apiError.statusCode >= 500) {
    return t("auth:verifyEmail.serverErrorDescription");
  }

  if (typeof apiError.message === "string" && apiError.message.trim()) {
    return apiError.message;
  }

  return t("auth:verifyEmail.networkUnavailable");
};

const shouldReplaceChallenge = (error: unknown): boolean => {
  const apiError = extractApiError(error);
  return (
    apiError.code === ErrorCode.OTP_EXPIRED ||
    apiError.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS ||
    apiError.code === ErrorCode.OTP_INVALID ||
    apiError.statusCode === 410
  );
};

export default VerifyEmailPage;
