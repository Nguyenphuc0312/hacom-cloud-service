import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { EnvelopeIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, Input } from "../ui";
import type { LoginFormData } from "../../lib/validations";
import { SocialLoginRow, type SocialProvider } from "./SocialLoginRow";

export type { SocialProvider } from "./SocialLoginRow";

interface PasswordLoginFormProps {
  register: UseFormRegister<LoginFormData>;
  errors: FieldErrors<LoginFormData>;
  isLoading: boolean;
  isSubmitting: boolean;
  authError?: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onSocialLogin: (provider: SocialProvider) => void;
}

export const PasswordLoginForm: React.FC<PasswordLoginFormProps> = ({
  register,
  errors,
  isLoading,
  isSubmitting,
  authError,
  onSubmit,
  onSocialLogin,
}) => {
  const { t } = useTranslation();
  const isBusy = isLoading || isSubmitting;

  return (
    <div
      role="tabpanel"
      id="login-panel-password"
      aria-labelledby="login-tab-password"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {authError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {authError}
          </div>
        )}

        <Input
          {...register("email")}
          type="email"
          label={t("auth:login.email")}
          placeholder={t("auth:placeholders.email")}
          leftIcon={<EnvelopeIcon className="h-4 w-4" />}
          error={errors.email?.message}
          autoComplete="email"
          inputMode="email"
          disabled={isBusy}
          className="h-11 rounded-xl py-0 text-sm"
        />

        <Input
          {...register("password")}
          type="password"
          label={t("auth:login.password")}
          placeholder={t("auth:placeholders.password")}
          leftIcon={<LockClosedIcon className="h-4 w-4" />}
          error={errors.password?.message}
          autoComplete="current-password"
          disabled={isBusy}
          className="h-11 rounded-xl py-0 text-sm"
        />

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <Checkbox
            {...register("rememberMe")}
            label={t("auth:login.rememberMe")}
            disabled={isBusy}
            containerClassName="w-auto"
          />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            {t("auth:login.forgotPassword")}
          </Link>
        </div>

        <Button
          type="submit"
          fullWidth
          size="md"
          className="h-11 rounded-xl text-sm font-semibold"
          isLoading={isBusy}
          disabled={isBusy}
          aria-busy={isBusy}
        >
          {t("auth:login.submit")}
        </Button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-3 text-text-muted">
            {t("auth:login.orWith")}
          </span>
        </div>
      </div>

      <SocialLoginRow disabled={isBusy} onProviderClick={onSocialLogin} />
    </div>
  );
};

export default PasswordLoginForm;
