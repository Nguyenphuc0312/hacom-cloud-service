import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UseFormRegisterReturn } from "react-hook-form";

interface PasswordFieldProps {
  label: string;
  placeholder: string;
  registration: UseFormRegisterReturn;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  /** Extra content rendered below the input (e.g. password strength meter). */
  children?: React.ReactNode;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  placeholder,
  registration,
  error,
  disabled,
  autoComplete,
  children,
}) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          {...registration}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="w-full h-11 px-3 pr-10 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          aria-label={
            show
              ? t("common.actions.hidePassword")
              : t("common.actions.showPassword")
          }
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {children}
    </div>
  );
};

export default PasswordField;
