import React, { useEffect } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useOtpInput } from "../../hooks/useOtpInput";

export interface EmailOtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: string | null;
  hint?: string;
  label?: string;
  onComplete?: (value: string) => void;
}

export const EmailOtpInput: React.FC<EmailOtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
  error,
  hint,
  label,
  onComplete,
}) => {
  const { t } = useTranslation();
  const {
    digits,
    isComplete,
    setInputRef,
    handleChange,
    handleKeyDown,
    handlePaste,
    focusIndex,
  } = useOtpInput({
    value,
    onChange,
    length,
    autoFocus,
    disabled,
    onComplete,
  });

  useEffect(() => {
    if (autoFocus && !disabled) {
      focusIndex(0);
    }
  }, [autoFocus, disabled, focusIndex]);

  return (
    <div
      className="w-full"
      role="group"
      aria-label={label || t("auth:verifyEmail.otpLabel")}
    >
      {label ? (
        <label className="mb-2 block text-sm font-medium text-text-secondary">
          {label}
        </label>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {digits.map((digit, index) => {
          const slotLabel = t("auth:verifyEmail.otpSlotLabel", {
            index: index + 1,
            length,
          });

          return (
            <input
              key={index}
              ref={setInputRef(index)}
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={(event) => handlePaste(index, event)}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              disabled={disabled}
              maxLength={1}
              aria-label={slotLabel}
              aria-invalid={Boolean(error)}
              className={clsx(
                "h-12 rounded-xl border bg-surface text-center text-lg font-semibold text-text-primary",
                "shadow-sm transition-all duration-200",
                "focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/20",
                error &&
                  "border-danger focus:border-danger focus:ring-danger/20",
                !error &&
                  isComplete &&
                  "border-success focus:border-success focus:ring-success/20",
                disabled && "cursor-not-allowed bg-surface-overlay opacity-70",
              )}
            />
          );
        })}
      </div>

      {error ? (
        <p
          className="mt-2 flex items-center gap-1 text-sm text-danger"
          role="alert"
        >
          <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-sm text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
};

export default EmailOtpInput;
