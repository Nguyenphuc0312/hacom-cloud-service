import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "../../../components/ui";
import { EmailOtpInput } from "../../../components/auth";
import { calculatePasswordStrength } from "../../../lib/validations";

interface VerifyOtpFormProps {
  otp: string;
  password: string;
  confirmPassword: string;
  onOtpChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  isSubmitting: boolean;
  canResend: boolean;
  resendCountdownLabel: string;
  error: string | null;
  onSubmit: () => Promise<void>;
  onResend: () => Promise<void>;
}

export const VerifyOtpForm: React.FC<VerifyOtpFormProps> = ({
  otp,
  password,
  confirmPassword,
  onOtpChange,
  onPasswordChange,
  onConfirmPasswordChange,
  isSubmitting,
  canResend,
  resendCountdownLabel,
  error,
  onSubmit,
  onResend,
}) => {
  const { t } = useTranslation("auth");
  const strength = calculatePasswordStrength(password);
  const strengthLabel =
    strength === "strong"
      ? t("activation.setPassword.strong")
      : strength === "medium"
        ? t("activation.setPassword.medium")
        : t("activation.setPassword.weak");

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("activation.verifyOtp.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("activation.verifyOtp.description")}
        </p>
      </header>

      <EmailOtpInput
        value={otp}
        onChange={onOtpChange}
        disabled={isSubmitting}
        error={error || undefined}
        hint={t("activation.verifyOtp.hint")}
        label={t("activation.verifyOtp.otpLabel")}
      />

      <Input
        type="password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        label={t("activation.setPassword.password")}
        placeholder={t("auth:placeholders.password")}
        disabled={isSubmitting}
      />

      <p className="text-xs text-text-muted">
        {t("activation.setPassword.strength", { level: strengthLabel })}
      </p>

      <Input
        type="password"
        value={confirmPassword}
        onChange={(event) => onConfirmPasswordChange(event.target.value)}
        label={t("activation.setPassword.confirmPassword")}
        placeholder={t("auth:placeholders.password")}
        disabled={isSubmitting}
      />

      <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
        <span>
          {canResend
            ? t("activation.verifyOtp.canResendNow")
            : t("activation.verifyOtp.resendIn", {
                time: resendCountdownLabel,
              })}
        </span>
        <button
          type="button"
          disabled={!canResend || isSubmitting}
          onClick={() => {
            void onResend();
          }}
          className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("activation.verifyOtp.resend")}
        </button>
      </div>

      <Button
        type="button"
        fullWidth
        size="lg"
        isLoading={isSubmitting}
        disabled={
          isSubmitting ||
          otp.length !== 6 ||
          password.length < 8 ||
          confirmPassword.length < 8 ||
          password !== confirmPassword
        }
        onClick={() => {
          void onSubmit();
        }}
      >
        {t("activation.verifyOtp.submit")}
      </Button>
    </section>
  );
};

export default VerifyOtpForm;
