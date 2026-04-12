import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { AuthCard, AuthShell } from "../../../components/auth";
import { toast } from "../../../components/ui";
import { ROUTE_PATHS } from "../../../router/paths";
import { useAuthStore } from "../../../stores";
import { activationAuthApi } from "../../auth/api/authApi";
import { resolveAuthFailure } from "../../auth/utils/authErrorMapper";
import type { AuthStatus } from "../../auth/model/authState";
import { ActivationRequiredPage } from "../components/ActivationRequiredPage";
import { VerifyOtpForm } from "../components/VerifyOtpForm";
import { SetInitialPasswordForm } from "../components/SetInitialPasswordForm";

const formatCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

type ActivationStep = "required" | "verify_otp" | "set_password";

const hasLoginToken = (
  payload: unknown,
): payload is {
  accessToken?: string;
  tokens?: { accessToken?: string };
} => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return true;
};

export const ActivationFlowPage: React.FC = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activationContext,
    applyLoginResponse,
    setActivationContext,
    authStatus,
    setAuthStatus,
  } = useAuthStore();

  const [step, setStep] = React.useState<ActivationStep>("required");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = React.useState(0);

  const from =
    (location.state as { from?: string } | null)?.from || ROUTE_PATHS.CHAT;

  React.useEffect(() => {
    if (!activationContext) {
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
      return;
    }

    if (activationContext.nextAction === "SET_PASSWORD") {
      setStep("set_password");
      return;
    }

    if (activationContext.resendAvailableAt) {
      const delta =
        new Date(activationContext.resendAvailableAt).getTime() - Date.now();
      if (delta > 0) {
        setResendSeconds(Math.ceil(delta / 1000));
      }
    }
  }, [activationContext, navigate]);

  React.useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [resendSeconds]);

  React.useEffect(() => {
    if (authStatus === "authenticated") {
      navigate(from, { replace: true });
    }
  }, [authStatus, from, navigate]);

  const finalizeAuthenticated = React.useCallback(
    (payload: unknown) => {
      if (!hasLoginToken(payload)) {
        return false;
      }

      try {
        applyLoginResponse(payload as never, true);
        setActivationContext(null);
        toast.success(t("activation.success"));
        navigate(from, { replace: true });
        return true;
      } catch {
        return false;
      }
    },
    [applyLoginResponse, from, navigate, setActivationContext, t],
  );

  const startOtpVerification = React.useCallback(() => {
    setAuthStatus("verifying_activation");
    setError(null);
  }, [setAuthStatus]);

  const finishActivationPending = React.useCallback(
    (nextStatus: AuthStatus = "activation_required") => {
      setAuthStatus(nextStatus);
      setIsBusy(false);
    },
    [setAuthStatus],
  );

  const handleRequestOtp = React.useCallback(async () => {
    if (!activationContext) return;

    setIsBusy(true);
    setError(null);

    try {
      const result = await activationAuthApi.requestOtp({
        activationTicket: activationContext.activationTicket,
      });
      setStep("verify_otp");
      if (result.resendAvailableAt) {
        const delta =
          new Date(result.resendAvailableAt).getTime() - Date.now();
        setResendSeconds(delta > 0 ? Math.ceil(delta / 1000) : 0);
      } else {
        setResendSeconds(60);
      }
      setActivationContext({
        ...activationContext,
        maskedEmail: result.maskedEmail,
        nextAction: result.nextAction,
        resendAvailableAt: result.resendAvailableAt,
      });
      toast.success(t("activation.required.otpSent"));
    } catch (cause) {
      const failure = resolveAuthFailure(cause, t);
      setError(failure.message);
    } finally {
      finishActivationPending();
    }
  }, [activationContext, finishActivationPending, setActivationContext, t]);

  const handleResendOtp = React.useCallback(async () => {
    if (!activationContext) return;

    setIsBusy(true);
    setError(null);

    try {
      const result = await activationAuthApi.resendOtp({
        activationTicket: activationContext.activationTicket,
      });
      if (result.resendAvailableAt) {
        const delta =
          new Date(result.resendAvailableAt).getTime() - Date.now();
        setResendSeconds(delta > 0 ? Math.ceil(delta / 1000) : 0);
      } else {
        setResendSeconds(60);
      }
      setActivationContext({
        ...activationContext,
        maskedEmail: result.maskedEmail,
        nextAction: result.nextAction,
        resendAvailableAt: result.resendAvailableAt,
      });
      toast.success(t("activation.verifyOtp.resent"));
    } catch (cause) {
      const failure = resolveAuthFailure(cause, t);
      setError(failure.message);
    } finally {
      finishActivationPending();
    }
  }, [activationContext, finishActivationPending, setActivationContext, t]);

  const handleVerifyOtp = React.useCallback(async () => {
    if (!activationContext) return;

    if (password !== confirmPassword) {
      setError(t("activation.setPassword.mismatch"));
      return;
    }

    startOtpVerification();
    setIsBusy(true);

    try {
      const result = await activationAuthApi.verifyOtp({
        activationTicket: activationContext.activationTicket,
        otp,
        newPassword: password,
      });

      if (finalizeAuthenticated(result)) {
        return;
      }

      const requiresPassword =
        result.requiresPasswordSetup || result.nextAction === "SET_PASSWORD";

      if (requiresPassword) {
        setStep("set_password");
        setActivationContext({
          ...activationContext,
          nextAction: "SET_PASSWORD",
          verificationProof: result.verificationProof || null,
        });
        toast.info(t("activation.setPassword.required"));
      }
    } catch (cause) {
      const failure = resolveAuthFailure(cause, t);
      setError(failure.message);
    } finally {
      finishActivationPending();
    }
  }, [
    activationContext,
    confirmPassword,
    finalizeAuthenticated,
    finishActivationPending,
    otp,
    password,
    setActivationContext,
    startOtpVerification,
    t,
  ]);

  const handleSetPassword = React.useCallback(async () => {
    if (!activationContext) return;

    if (password !== confirmPassword) {
      setError(t("activation.setPassword.mismatch"));
      return;
    }

    startOtpVerification();
    setIsBusy(true);

    try {
      const result = await activationAuthApi.setInitialPassword({
        activationTicket: activationContext.activationTicket,
        otp,
        newPassword: password,
        password,
        confirmPassword,
        verificationProof: activationContext.verificationProof || undefined,
      });

      if (!finalizeAuthenticated(result)) {
        setError(t("activation.setPassword.submitFailed"));
      }
    } catch (cause) {
      const failure = resolveAuthFailure(cause, t);
      setError(failure.message);
    } finally {
      finishActivationPending();
    }
  }, [
    activationContext,
    confirmPassword,
    finalizeAuthenticated,
    finishActivationPending,
    otp,
    password,
    startOtpVerification,
    t,
  ]);

  if (!activationContext) {
    return null;
  }

  return (
    <AuthShell maxWidth="md">
      <AuthCard ariaLabel={t("activation.title")}>
        <header className="mb-6 text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-text-inverse shadow-sm">
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {t("activation.title")}
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {t("activation.subtitle")}
          </p>
        </header>

        {step === "required" && (
          <ActivationRequiredPage
            maskedEmail={activationContext.maskedEmail}
            isSubmitting={isBusy}
            error={error}
            onRequestOtp={handleRequestOtp}
          />
        )}

        {step === "verify_otp" && (
          <VerifyOtpForm
            otp={otp}
            password={password}
            confirmPassword={confirmPassword}
            onOtpChange={setOtp}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            isSubmitting={isBusy}
            canResend={resendSeconds <= 0}
            resendCountdownLabel={formatCountdown(resendSeconds)}
            error={error}
            onSubmit={handleVerifyOtp}
            onResend={handleResendOtp}
          />
        )}

        {step === "set_password" && (
          <SetInitialPasswordForm
            password={password}
            confirmPassword={confirmPassword}
            isSubmitting={isBusy}
            error={error}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onSubmit={handleSetPassword}
          />
        )}

        <p className="mt-6 text-center text-sm text-text-muted">
          <Link
            to={ROUTE_PATHS.LOGIN}
            className="font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {t("activation.backToLogin")}
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
};

export default ActivationFlowPage;
