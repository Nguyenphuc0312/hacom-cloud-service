import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
import type {
  EmailVerificationChallengeSnapshot,
  VerificationFlowSource,
} from "../stores/authStore";
import { useEmailVerificationChallenge, useResendCooldown } from "../hooks";
import {
  AuthCard,
  AuthShell,
  EmailOtpInput,
  RequestVerificationCodeForm,
  VerificationStatusPanel,
} from "../components/auth";
import { ROUTE_PATHS } from "../router/paths";

const cardClassName = "p-6 sm:p-7";

const OTP_LENGTH = 6;

type PageMode =
  | "booting"
  | "requesting_challenge"
  | "pending_otp"
  | "confirming_otp"
  | "resending_otp"
  | "verified"
  | "expired"
  | "invalidated"
  | "locked"
  | "missing_context"
  | "recoverable_error"
  | "fatal_error";

type ErrorPhase = "request" | "confirm" | "resend";

interface ErrorResolution {
  nextState: Exclude<PageMode, "booting" | "verified">;
  message: string;
  challengeState?: EmailVerificationChallengeSnapshot["verificationState"];
  lockedReason?: string | null;
}

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

const isEmailLike = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const normalizeVerificationSource = (
  value: unknown,
): VerificationFlowSource | null => {
  if (value === "signup" || value === "external") {
    return value;
  }

  return null;
};

const normalizeChallengeId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const normalizeIsoDateString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
};

interface VerifyEmailLocationState {
  source?: VerificationFlowSource;
  email?: string;
  challengeId?: string | null;
  expiresAt?: string | null;
}

const buildChallengeSnapshot = (
  email: string,
  challengeId: string,
  expiresAt: string,
  resendAvailableAt: string,
  verificationState: EmailVerificationChallengeSnapshot["verificationState"],
  options: {
    lockedReason?: string | null;
    attemptCount?: number | null;
    maxAttempts?: number | null;
  } = {},
): EmailVerificationChallengeSnapshot => ({
  challengeId,
  email,
  expiresAt,
  resendAvailableAt,
  purpose: "signup",
  verificationState,
  lockedReason: options.lockedReason ?? null,
  attemptCount: options.attemptCount ?? null,
  maxAttempts: options.maxAttempts ?? null,
  lastResolvedAt: new Date().toISOString(),
});

const deriveStateFromChallenge = (
  challenge: EmailVerificationChallengeSnapshot,
  now: number,
): PageMode => {
  if (challenge.verificationState === "locked") {
    return "locked";
  }

  if (challenge.verificationState === "invalidated") {
    return "invalidated";
  }

  if (challenge.verificationState === "recoverable_error") {
    return "recoverable_error";
  }

  const expiresAt = parseDateMs(challenge.expiresAt);
  if (expiresAt !== null && expiresAt <= now) {
    return "expired";
  }

  return "pending_otp";
};

const resolveApiError = (
  error: unknown,
  phase: ErrorPhase,
  t: (key: string, options?: Record<string, unknown>) => string,
): ErrorResolution => {
  const apiError = extractApiError(error);
  const rawMessage =
    typeof apiError.message === "string" ? apiError.message.trim() : "";
  const normalizedMessage = rawMessage.toLowerCase();

  if (apiError.code === ErrorCode.OTP_EXPIRED) {
    return {
      nextState: "expired",
      message: t("auth:verifyEmail.otpExpired"),
      challengeState: "expired",
    };
  }

  if (apiError.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS) {
    return {
      nextState: "locked",
      message: t("auth:verifyEmail.otpLocked"),
      challengeState: "locked",
      lockedReason: rawMessage || t("auth:verifyEmail.otpLocked"),
    };
  }

  if (apiError.code === ErrorCode.OTP_INVALID) {
    const isChallengeInvalidated =
      normalizedMessage.includes("invalidated") ||
      normalizedMessage.includes("no longer active") ||
      normalizedMessage.includes("already used") ||
      (normalizedMessage.includes("challenge") &&
        !normalizedMessage.includes("invalid otp"));

    if (isChallengeInvalidated) {
      return {
        nextState: "invalidated",
        message: t("auth:verifyEmail.invalidatedDescription"),
        challengeState: "invalidated",
      };
    }

    if (phase === "confirm") {
      return {
        nextState: "pending_otp",
        message: t("auth:verifyEmail.otpInvalid"),
      };
    }

    return {
      nextState: "invalidated",
      message: t("auth:verifyEmail.invalidatedDescription"),
      challengeState: "invalidated",
    };
  }

  if (apiError.code === ErrorCode.RATE_LIMITED || apiError.statusCode === 429) {
    return {
      nextState: "recoverable_error",
      message: t("auth:verifyEmail.rateLimited"),
      challengeState: "recoverable_error",
    };
  }

  if (phase === "request" && apiError.statusCode === 404) {
    return {
      nextState: "missing_context",
      message: t("auth:verifyEmail.contextNotFound"),
      challengeState: "missing_context",
    };
  }

  if (
    apiError.code === ErrorCode.SERVER_SERVICE_UNAVAILABLE ||
    apiError.statusCode === 503 ||
    apiError.statusCode >= 500
  ) {
    return {
      nextState: "recoverable_error",
      message: t("auth:verifyEmail.networkUnavailable"),
      challengeState: "recoverable_error",
    };
  }

  if (rawMessage) {
    return {
      nextState: "recoverable_error",
      message: rawMessage,
      challengeState: "recoverable_error",
    };
  }

  return {
    nextState: "fatal_error",
    message: t("auth:verifyEmail.serverErrorDescription"),
  };
};

export const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigationState = (location.state as VerifyEmailLocationState) || null;
  const queryEmail = normalizeEmail(searchParams.get("email"));
  const stateEmail = normalizeEmail(navigationState?.email);
  const querySource = normalizeVerificationSource(searchParams.get("source"));
  const stateSource = normalizeVerificationSource(navigationState?.source);
  const queryChallengeId = normalizeChallengeId(
    searchParams.get("challengeId"),
  );
  const stateChallengeId = normalizeChallengeId(navigationState?.challengeId);
  const queryExpiresAt = normalizeIsoDateString(searchParams.get("expiresAt"));
  const stateExpiresAt = normalizeIsoDateString(navigationState?.expiresAt);
  const {
    pendingVerificationEmail,
    pendingVerificationSource,
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
      stateEmail ||
      normalizeEmail(verificationChallenge?.email),
    [
      pendingVerificationEmail,
      queryEmail,
      stateEmail,
      verificationChallenge?.email,
    ],
  );

  const verificationSource = useMemo<VerificationFlowSource | null>(() => {
    return stateSource || querySource || pendingVerificationSource || null;
  }, [pendingVerificationSource, querySource, stateSource]);

  const incomingChallengeId = useMemo(() => {
    return stateChallengeId || queryChallengeId || null;
  }, [queryChallengeId, stateChallengeId]);

  const incomingChallengeExpiresAt = useMemo(() => {
    return stateExpiresAt || queryExpiresAt || null;
  }, [queryExpiresAt, stateExpiresAt]);

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

  const [mode, setMode] = useState<PageMode>("booting");
  const [otp, setOtp] = useState("");
  const [screenMessage, setScreenMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState(queryEmail);
  const autoRequestedEmailRef = useRef<string | null>(null);

  const {
    now,
    secondsRemaining: resendCooldownSeconds,
    formattedRemaining: resendCooldownLabel,
    canResend: canResendAfterCooldown,
  } = useResendCooldown(activeChallenge?.resendAvailableAt);

  const expiresAtMs = parseDateMs(activeChallenge?.expiresAt);
  const expirySeconds =
    expiresAtMs === null
      ? null
      : Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
  const isChallengeExpired = expirySeconds === 0 && Boolean(activeChallenge);
  const hasActiveChallenge = Boolean(activeChallenge?.challengeId);
  const shouldAutoRequestChallenge =
    Boolean(verificationEmail) && !hasActiveChallenge && !incomingChallengeId;

  const derivedChallengeState = useMemo(() => {
    if (!activeChallenge) {
      return null;
    }

    return deriveStateFromChallenge(activeChallenge, now);
  }, [activeChallenge, now]);

  const isBusy =
    mode === "booting" ||
    mode === "requesting_challenge" ||
    mode === "confirming_otp" ||
    mode === "resending_otp";

  const isOtpState =
    mode === "pending_otp" ||
    mode === "confirming_otp" ||
    mode === "resending_otp" ||
    mode === "recoverable_error";

  const canSubmit =
    hasActiveChallenge &&
    (mode === "pending_otp" || mode === "recoverable_error") &&
    !isChallengeExpired &&
    otp.length === OTP_LENGTH &&
    !isBusy;

  const canResendActiveChallenge =
    hasActiveChallenge &&
    isOtpState &&
    !isChallengeExpired &&
    canResendAfterCooldown &&
    !isBusy;

  const canRequestFreshChallenge = Boolean(verificationEmail) && !isBusy;

  useEffect(() => {
    if (!verificationEmail || !incomingChallengeId || hasActiveChallenge) {
      return;
    }

    const nowMs = Date.now();
    const snapshot = buildChallengeSnapshot(
      verificationEmail,
      incomingChallengeId,
      incomingChallengeExpiresAt ||
        new Date(nowMs + 10 * 60 * 1000).toISOString(),
      new Date(nowMs + 60 * 1000).toISOString(),
      "pending_otp",
    );

    setEmailVerificationChallenge(snapshot);
    setPendingVerificationEmail(
      verificationEmail,
      verificationSource || "external",
    );
  }, [
    hasActiveChallenge,
    incomingChallengeExpiresAt,
    incomingChallengeId,
    setEmailVerificationChallenge,
    setPendingVerificationEmail,
    verificationEmail,
    verificationSource,
  ]);

  const markChallengeState = useCallback(
    (
      challengeState: EmailVerificationChallengeSnapshot["verificationState"],
      options: {
        lockedReason?: string | null;
        attemptCount?: number | null;
        maxAttempts?: number | null;
      } = {},
    ): void => {
      if (!activeChallenge || !verificationEmail) {
        return;
      }

      setEmailVerificationChallenge({
        ...activeChallenge,
        email: verificationEmail,
        verificationState: challengeState,
        lockedReason: options.lockedReason ?? activeChallenge.lockedReason,
        attemptCount: options.attemptCount ?? activeChallenge.attemptCount,
        maxAttempts: options.maxAttempts ?? activeChallenge.maxAttempts,
        lastResolvedAt: new Date().toISOString(),
      });
    },
    [activeChallenge, setEmailVerificationChallenge, verificationEmail],
  );

  const requestFreshChallenge = useCallback(
    async (
      nextEmail?: string,
      trigger: "auto" | "manual" = "manual",
    ): Promise<void> => {
      const targetEmail = normalizeEmail(nextEmail || verificationEmail);
      if (!targetEmail) {
        setMode("missing_context");
        setFormError(t("auth:verifyEmail.missingEmailDescription"));
        return;
      }

      if (trigger === "auto" && autoRequestedEmailRef.current === targetEmail) {
        return;
      }

      if (trigger === "auto") {
        autoRequestedEmailRef.current = targetEmail;
      }

      const contextSource =
        verificationSource === "signup" ? "signup" : "external";
      setPendingVerificationEmail(targetEmail, contextSource);
      setRecoveryEmail(targetEmail);
      setMode("requesting_challenge");
      setFormError(null);
      setScreenMessage(t("auth:verifyEmail.requestingOtp"));

      try {
        const response = await authApi.requestEmailOtpChallenge({
          email: targetEmail,
          purpose: "signup",
        });
        const payload = unwrapApiSuccess(response);

        if (payload.verified || !payload.challengeId) {
          clearPendingVerificationEmail();
          clearEmailVerificationChallenge();
          setOtp("");
          setMode("verified");
          setScreenMessage(null);
          toast.success(t("auth:toast.emailOtpVerified"));
          return;
        }

        const snapshot = buildChallengeSnapshot(
          targetEmail,
          payload.challengeId,
          payload.expiresAt || new Date().toISOString(),
          payload.resendAvailableAt || new Date().toISOString(),
          "pending_otp",
        );

        setEmailVerificationChallenge(snapshot);
        setOtp("");
        setMode("pending_otp");
        setScreenMessage(null);
        toast.success(t("auth:toast.emailOtpSent"));
      } catch (error: unknown) {
        const resolution = resolveApiError(error, "request", t);
        if (resolution.challengeState) {
          markChallengeState(resolution.challengeState, {
            lockedReason: resolution.lockedReason,
          });
        }
        setMode(resolution.nextState);
        setScreenMessage(resolution.message);
        setFormError(resolution.message);
      }
    },
    [
      clearEmailVerificationChallenge,
      clearPendingVerificationEmail,
      markChallengeState,
      setEmailVerificationChallenge,
      setPendingVerificationEmail,
      t,
      verificationEmail,
      verificationSource,
    ],
  );

  useEffect(() => {
    if (mode !== "booting") {
      return;
    }

    let cancelled = false;

    if (activeChallenge && derivedChallengeState) {
      Promise.resolve().then(() => {
        if (cancelled) {
          return;
        }
        setRecoveryEmail(verificationEmail || activeChallenge.email);
        setMode(derivedChallengeState);
      });
      return;
    }

    if (verificationEmail) {
      Promise.resolve().then(() => {
        if (cancelled) {
          return;
        }
        setRecoveryEmail(verificationEmail);
        if (shouldAutoRequestChallenge) {
          setMode("requesting_challenge");
          return;
        }

        setMode("pending_otp");
      });
      return;
    }

    Promise.resolve().then(() => {
      if (cancelled) {
        return;
      }
      setMode("missing_context");
      setScreenMessage(t("auth:verifyEmail.missingContextDescription"));
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeChallenge,
    derivedChallengeState,
    mode,
    shouldAutoRequestChallenge,
    t,
    verificationEmail,
  ]);

  useEffect(() => {
    if (
      !activeChallenge ||
      !derivedChallengeState ||
      (mode !== "pending_otp" && mode !== "recoverable_error")
    ) {
      return;
    }

    if (
      derivedChallengeState === "expired" ||
      derivedChallengeState === "invalidated" ||
      derivedChallengeState === "locked"
    ) {
      Promise.resolve().then(() => {
        setMode(derivedChallengeState);
      });
    }
  }, [activeChallenge, derivedChallengeState, mode]);

  useEffect(() => {
    if (mode !== "requesting_challenge" || !verificationEmail) {
      return;
    }

    Promise.resolve().then(() => {
      void requestFreshChallenge(verificationEmail, "auto");
    });
  }, [mode, requestFreshChallenge, verificationEmail]);

  useEffect(() => {
    if (mode === "missing_context" && !recoveryEmail && queryEmail) {
      Promise.resolve().then(() => {
        setRecoveryEmail(queryEmail);
      });
    }
  }, [mode, queryEmail, recoveryEmail]);

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
      await requestFreshChallenge(verificationEmail || recoveryEmail, "manual");
      return;
    }

    if (isChallengeExpired || (resendCooldownSeconds ?? 0) > 0) {
      return;
    }

    setMode("resending_otp");
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
        "pending_otp",
      );

      setEmailVerificationChallenge(snapshot);
      setOtp("");
      setMode("pending_otp");
      setScreenMessage(null);
      toast.success(t("auth:toast.emailOtpResent"));
    } catch (error: unknown) {
      const resolution = resolveApiError(error, "resend", t);
      if (resolution.challengeState) {
        markChallengeState(resolution.challengeState, {
          lockedReason: resolution.lockedReason,
        });
      }
      setMode(resolution.nextState);
      setFormError(resolution.message);
      setScreenMessage(resolution.message);
    }
  };

  const confirmChallenge = async (otpValue = otp): Promise<void> => {
    if (!activeChallenge || otpValue.length !== OTP_LENGTH) {
      setFormError(t("auth:verifyEmail.otpRequired"));
      return;
    }

    if (mode !== "pending_otp" && mode !== "recoverable_error") {
      return;
    }

    if (isChallengeExpired || derivedChallengeState === "expired") {
      markChallengeState("expired");
      setMode("expired");
      setFormError(t("auth:verifyEmail.otpExpired"));
      return;
    }

    setMode("confirming_otp");
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
      const resolution = resolveApiError(error, "confirm", t);
      if (resolution.challengeState) {
        markChallengeState(resolution.challengeState, {
          lockedReason: resolution.lockedReason,
        });
      }
      setMode(resolution.nextState);
      setFormError(resolution.message);
      setScreenMessage(resolution.message);
    }
  };

  const handleRecoverySubmit = async (): Promise<void> => {
    const normalized = normalizeEmail(recoveryEmail);
    if (!normalized || !isEmailLike(normalized)) {
      setFormError(t("auth:verifyEmail.recoveryEmailInvalid"));
      return;
    }

    setFormError(null);
    autoRequestedEmailRef.current = null;
    await requestFreshChallenge(normalized, "manual");
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

  const missingEmailMessage =
    !verificationEmail && mode !== "missing_context"
      ? t("auth:verifyEmail.missingEmailDescription")
      : null;

  const statusDescriptor = useMemo(() => {
    switch (mode) {
      case "pending_otp":
      case "confirming_otp":
      case "resending_otp":
        return {
          tone: "info" as const,
          title: t("auth:verifyEmail.pendingTitle"),
          description: verificationEmail
            ? t("auth:verifyEmail.subtitleWithEmail", {
                email: verificationEmail,
              })
            : t("auth:verifyEmail.pendingDescription"),
          helperText: t("auth:verifyEmail.pendingHint"),
        };
      case "expired":
        return {
          tone: "warning" as const,
          title: t("auth:verifyEmail.expiredTitle"),
          description: t("auth:verifyEmail.expiredDescription"),
          helperText: null,
        };
      case "invalidated":
        return {
          tone: "warning" as const,
          title: t("auth:verifyEmail.invalidatedTitle"),
          description: t("auth:verifyEmail.invalidatedDescription"),
          helperText: null,
        };
      case "locked":
        return {
          tone: "danger" as const,
          title: t("auth:verifyEmail.lockedTitle"),
          description:
            activeChallenge?.lockedReason ||
            t("auth:verifyEmail.lockedDescription"),
          helperText: null,
        };
      case "missing_context":
        return {
          tone: "warning" as const,
          title: t("auth:verifyEmail.missingContextTitle"),
          description: t("auth:verifyEmail.missingContextDescription"),
          helperText: null,
        };
      case "recoverable_error":
        return {
          tone: "warning" as const,
          title: t("auth:verifyEmail.recoverableErrorTitle"),
          description:
            screenMessage || t("auth:verifyEmail.recoverableErrorDescription"),
          helperText: null,
        };
      case "fatal_error":
        return {
          tone: "danger" as const,
          title: t("auth:verifyEmail.fatalErrorTitle"),
          description:
            screenMessage || t("auth:verifyEmail.serverErrorDescription"),
          helperText: null,
        };
      default:
        return {
          tone: "info" as const,
          title: t("auth:verifyEmail.title"),
          description: t("auth:verifyEmail.subtitle"),
          helperText: null,
        };
    }
  }, [
    activeChallenge?.lockedReason,
    mode,
    screenMessage,
    t,
    verificationEmail,
  ]);

  const pageTitle =
    mode === "verified"
      ? t("auth:verifyEmail.successTitle")
      : t("auth:verifyEmail.title");

  const pageDescription =
    mode === "verified"
      ? t("auth:verifyEmail.successDescription")
      : statusDescriptor.description;

  const showRecoveryForm =
    mode === "missing_context" ||
    mode === "expired" ||
    mode === "invalidated" ||
    mode === "locked" ||
    mode === "fatal_error";

  if (mode === "booting" || mode === "requesting_challenge") {
    return (
      <AuthShell maxWidth="md">
        <AuthCard className={cardClassName}>
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-elev2">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-text-inverse" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-text-primary">
            {pageTitle}
          </h1>
          <p className="mb-6 text-text-muted">{pageDescription}</p>
          <PageSpinner
            message={screenMessage || statusDescriptor.description}
          />
        </AuthCard>
      </AuthShell>
    );
  }

  if (mode === "verified") {
    return (
      <AuthShell maxWidth="md">
        <AuthCard className={cardClassName}>
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
        </AuthCard>
      </AuthShell>
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
    <AuthShell maxWidth="md">
      <AuthCard
        className={`${cardClassName} relative`}
        ariaLabel={t("auth:verifyEmail.aria.section")}
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

        <div className="mb-5">
          <VerificationStatusPanel
            title={statusDescriptor.title}
            description={statusDescriptor.description}
            helperText={statusDescriptor.helperText}
            tone={statusDescriptor.tone}
          />
        </div>

        {screenMessage && mode !== "recoverable_error" ? (
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
          {!hasActiveChallenge && verificationEmail && isOtpState ? (
            <p className="text-sm text-text-muted">
              {t("auth:verifyEmail.noActiveChallenge")}
            </p>
          ) : null}
        </div>

        {showRecoveryForm ? (
          <RequestVerificationCodeForm
            email={recoveryEmail}
            onEmailChange={setRecoveryEmail}
            onSubmit={handleRecoverySubmit}
            isLoading={isBusy}
            error={formError}
            emailLabel={t("auth:verifyEmail.recoveryEmailLabel")}
            emailPlaceholder={t("auth:verifyEmail.recoveryEmailPlaceholder")}
            submitLabel={t("auth:verifyEmail.requestFreshCode")}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <EmailOtpInput
              value={otp}
              onChange={handleOtpChange}
              onComplete={(value) => {
                if (
                  value.length === OTP_LENGTH &&
                  (mode === "pending_otp" || mode === "recoverable_error")
                ) {
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
                mode === "confirming_otp" ||
                mode === "resending_otp"
              }
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={mode === "confirming_otp"}
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
                isLoading={mode === "resending_otp"}
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
                onClick={() =>
                  void requestFreshChallenge(
                    verificationEmail || recoveryEmail,
                    "manual",
                  )
                }
              >
                {t("auth:verifyEmail.requestFreshCode")}
              </Button>
            </div>
          </form>
        )}

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
      </AuthCard>
    </AuthShell>
  );
};

export default VerifyEmailPage;
