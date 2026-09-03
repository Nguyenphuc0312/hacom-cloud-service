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
      <label
        htmlFor={registration.name}
        className="mb-1 block text-sm font-medium text-text-secondary"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...registration}
          id={registration.name}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="h-11 w-full rounded-lg border border-border px-3 pr-12 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label={
            show
              ? t("common:actions.hidePassword")
              : t("common:actions.showPassword")
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
