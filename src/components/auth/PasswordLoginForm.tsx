import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import type { LoginFormData } from "../../lib/validations";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import { translateI18nMessage } from "../../utils/userMessages";

interface PasswordLoginFormProps {
  register: UseFormRegister<LoginFormData>;
  errors: FieldErrors<LoginFormData>;
  isLoading: boolean;
  isSubmitting: boolean;
  authError?: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  passwordValue?: string;
}

export const PasswordLoginForm: React.FC<PasswordLoginFormProps> = ({
  register,
  errors,
  isLoading,
  isSubmitting,
  authError,
  onSubmit,
  passwordValue = ""
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

        <div>
          <label htmlFor="loginIdentifier" className="block text-sm font-medium text-slate-700 mb-1">
            Email hoặc số điện thoại
          </label>
          <input
            id="loginIdentifier"
            {...register("loginIdentifier")}
            type="text"
            placeholder="Nhập email hoặc số điện thoại"
            disabled={isBusy}
            className="w-full h-11 px-3 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
          />
          {loginIdentifierError && (
            <p className="mt-1 text-xs text-danger">{loginIdentifierError}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Mật khẩu
          </label>
          <div className="relative">
            <input
              id="password"
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="Nhập mật khẩu"
              disabled={isBusy}
              className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-300 focus:border-[#2b7ff6] focus:ring-1 focus:ring-[#2b7ff6] outline-none transition-colors text-sm"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
          {passwordError && (
            <p className="mt-1 text-xs text-danger">{passwordError}</p>
          )}
        </div>

        <PasswordStrengthIndicator password={passwordValue} />

        <Button
          type="submit"
          fullWidth
          size="md"
          className="h-11 rounded-lg bg-[#2b7ff6] text-sm font-semibold text-white hover:bg-blue-600"
          isLoading={isBusy}
          disabled={isBusy}
          aria-busy={isBusy}
        >
          Đăng Nhập
        </Button>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="flex-1 h-11 rounded-lg border border-slate-200 bg-slate-50 text-[#2b7ff6] font-semibold text-sm hover:bg-slate-100 transition-colors"
          >
            Quên mật khẩu
          </button>
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="flex-1 h-11 rounded-lg bg-[#2b7ff6] hover:bg-blue-600 text-white font-semibold text-sm transition-colors"
          >
            Đăng ký
          </button>
        </div>
      </form>
    </div>
  );
};

export default PasswordLoginForm;
