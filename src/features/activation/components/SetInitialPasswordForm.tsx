import React from "react";
import { useTranslation } from "react-i18next";
import { Input, Button } from "../../../components/ui";
<<<<<<< HEAD
=======
import { PASSWORD_MIN_LENGTH } from "../../../constants/passwordPolicy";
import { calculatePasswordStrength } from "../../../lib/validations";
>>>>>>> origin/main

interface SetInitialPasswordFormProps {
  password: string;
  confirmPassword: string;
  error: string | null;
  isSubmitting: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}

export const SetInitialPasswordForm: React.FC<SetInitialPasswordFormProps> = ({
  password,
  confirmPassword,
  error,
  isSubmitting,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}) => {
  const { t } = useTranslation("auth");

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("activation.setPassword.title")}
        </h2>
        <p className="text-sm text-text-secondary">
          {t("activation.setPassword.description")}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

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
      />

      <Button
        type="button"
        fullWidth
        size="lg"
        isLoading={isSubmitting}
        disabled={
          isSubmitting ||
          password.length < PASSWORD_MIN_LENGTH ||
          confirmPassword.length < PASSWORD_MIN_LENGTH ||
          password !== confirmPassword
        }
        onClick={() => {
          void onSubmit();
        }}
      >
        {t("activation.setPassword.submit")}
      </Button>
    </section>
  );
};

export default SetInitialPasswordForm;
