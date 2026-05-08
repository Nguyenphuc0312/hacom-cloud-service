import React from "react";
import { useTranslation } from "react-i18next";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "../../../components/ui";
import { EmailOtpInput } from "../../../components/auth";
import { PASSWORD_MIN_LENGTH } from "../../../constants/passwordPolicy";
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
  const passwordsMatch = password === confirmPassword;

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("activation.verifyOtp.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("activation.verifyOtp.description")}
        </p>
        <div className="rounded-xl border border-border bg-surface-overlay px-3 py-3 text-sm text-text-secondary">
          <div className="flex items-start gap-3">
            <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div className="space-y-1">
              <p className="font-medium text-text-primary">
                {t("activation.verifyOtp.passwordStepTitle", {
                  defaultValue: "Verify OTP and set your first password",
                })}
              </p>
              <p>
                {t("activation.verifyOtp.passwordStepDescription", {
                  defaultValue:
                    "This environment completes activation in one submission.",
                })}
              </p>
            </div>
          </div>
        </div>
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

      <Input
        type="password"
        value={confirmPassword}
        onChange={(event) => onConfirmPasswordChange(event.target.value)}
        label={t("activation.setPassword.confirmPassword")}
        placeholder={t("auth:placeholders.password")}
        disabled={isSubmitting}
        error={
          confirmPassword.length > 0 && !passwordsMatch
            ? t("activation.setPassword.mismatch")
            : undefined
        }
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
          password.length < PASSWORD_MIN_LENGTH ||
          confirmPassword.length < PASSWORD_MIN_LENGTH ||
          !passwordsMatch
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
