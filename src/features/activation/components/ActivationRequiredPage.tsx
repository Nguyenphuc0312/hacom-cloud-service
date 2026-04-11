import React from "react";
import { useTranslation } from "react-i18next";
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
    <section className="space-y-4">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("activation.required.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("activation.required.description")}
        </p>
        {maskedEmail ? (
          <p className="rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary">
            {t("activation.required.maskedEmail", { email: maskedEmail })}
          </p>
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
