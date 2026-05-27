import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import {
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import type { LoginFormData } from "../../lib/validations";
import { translateI18nMessage } from "../../utils/userMessages";

interface PasswordLoginFormProps {
  register: UseFormRegister<LoginFormData>;
  errors: FieldErrors<LoginFormData>;
  isLoading: boolean;
  isSubmitting: boolean;
  authError?: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}

export const PasswordLoginForm: React.FC<PasswordLoginFormProps> = ({
  register,
  errors,
  isLoading,
  isSubmitting,
  authError,
  onSubmit,
}) => {
  const isBusy = isLoading || isSubmitting;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const loginIdentifierError = translateI18nMessage(
    errors.loginIdentifier?.message,
    t,
  );
  const passwordError = translateI18nMessage(errors.password?.message, t);

  return (
    <div
      role="tabpanel"
      id="login-panel-password"
      aria-labelledby="login-tab-password"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {authError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {authError}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="loginIdentifier" className="text-sm font-bold text-text-primary">
            {t("auth:login.loginIdentifier")}
          </label>
          <div className="relative">
            <input
              id="loginIdentifier"
              {...register("loginIdentifier")}
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username webauthn"
              placeholder="name@hacomholdings.vn"
              disabled={isBusy}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-sm font-medium text-text-primary outline-none transition-all focus:border-[hsl(var(--color-primary))] focus:ring-2 focus:ring-[hsl(var(--color-focus-ring)/0.1)] disabled:opacity-60"
              aria-invalid={Boolean(loginIdentifierError)}
            />
          </div>
          {loginIdentifierError && (
            <p className="mt-1 text-xs font-semibold text-danger">{loginIdentifierError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-bold text-text-primary">
              {t("auth:login.password")}
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder={t("auth:placeholders.password")}
              autoComplete="current-password"
              disabled={isBusy}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 pr-12 text-sm font-medium text-text-primary outline-none transition-all focus:border-[hsl(var(--color-primary))] focus:ring-2 focus:ring-[hsl(var(--color-focus-ring)/0.1)] disabled:opacity-60"
              aria-invalid={Boolean(passwordError)}
            />
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t("auth:login.hidePassword") : t("auth:login.showPassword")}
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
          {passwordError && (
            <p className="mt-1 text-xs font-semibold text-danger">{passwordError}</p>
          )}
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              {...register("rememberMe")}
              className="h-4 w-4 rounded border-border accent-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20"
            />
            <span className="text-sm font-medium text-text-secondary">{t("auth:login.rememberMe")}</span>
          </label>
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="text-sm font-bold text-text-muted transition-colors hover:text-text-secondary"
          >
            {t("auth:login.forgotPassword")}
          </button>
        </div>


        <Button
          type="submit"
          fullWidth
          className={"h-12 rounded-xl bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857] text-sm font-bold text-white transition-all hover:brightness-105 active:scale-95 shadow-lg shadow-[#C41E3A]/25"}
          isLoading={isBusy}
          disabled={isBusy}
          aria-busy={isBusy}
        >
          {t("auth:login.submitCta")}
        </Button>
      </form>
    </div>
  );
};

export default PasswordLoginForm;
