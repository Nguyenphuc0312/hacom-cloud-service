import React from "react";
import { useTranslation } from "react-i18next";
import {
  EnvelopeIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../../components/ui";

interface ActivationRequiredPageProps {
  maskedEmail: string | null;
  isSubmitting: boolean;
  error: string | null;
  onRequestOtp: () => Promise<void>;
}

export const ActivationRequiredPage: React.FC<ActivationRequiredPageProps> = ({
  maskedEmail,
  isSubmitting,
  error,
  onRequestOtp,
}) => {
  const { t } = useTranslation("auth");

  return (
    <section className="space-y-5">
      <header className="space-y-3">
        <div className="inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
          <ShieldCheckIcon className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary">
          {t("activation.required.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("activation.required.description")}
        </p>
        {maskedEmail ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-overlay px-3 py-3 text-sm text-text-primary">
            <EnvelopeIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div className="space-y-1">
              <p className="font-medium">
                {t("activation.required.maskedEmail", { email: maskedEmail })}
              </p>
              <p className="text-xs text-text-muted">
                {t("activation.required.maskedEmailHint", {
                  defaultValue:
                    "The OTP will only be sent to the masked company email on file.",
                })}
              </p>
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        fullWidth
        size="lg"
        isLoading={isSubmitting}
        disabled={isSubmitting}
        onClick={() => {
          void onRequestOtp();
        }}
      >
        {t("activation.required.sendOtp")}
      </Button>
    </section>
  );
};

export default ActivationRequiredPage;
