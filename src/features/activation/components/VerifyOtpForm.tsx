import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui";
import { EmailOtpInput } from "../../../components/auth";

interface VerifyOtpFormProps {
  otp: string;
  onOtpChange: (value: string) => void;
  isSubmitting: boolean;
  canResend: boolean;
  resendCountdownLabel: string;
  error: string | null;
  onSubmit: () => Promise<void>;
  onResend: () => Promise<void>;
}

export const VerifyOtpForm: React.FC<VerifyOtpFormProps> = ({
  otp,
  onOtpChange,
  isSubmitting,
  canResend,
  resendCountdownLabel,
  error,
  onSubmit,
  onResend,
}) => {
  const { t } = useTranslation("auth");

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
        disabled={isSubmitting || otp.length !== 6}
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
