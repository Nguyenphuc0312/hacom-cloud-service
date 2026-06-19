/**
 * @fileoverview Checkbox component
 * Custom checkbox with semantic design tokens.
 */

import React, { forwardRef, useId } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { CheckIcon } from "@heroicons/react/24/solid";

interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label?: React.ReactNode;
  error?: string;
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { label, error, disabled, className, containerClassName, id, ...props },
    ref,
  ) => {
    const uniqueId = useId();
    const checkboxId = id || `checkbox-${uniqueId}`;
    const { t } = useTranslation();

    let displayError: string | undefined = error;
    if (error && error.startsWith("__I18N__")) {
      try {
        const payload = error.replace("__I18N__", "");
        const sep = payload.indexOf("::");
        const key = payload.slice(0, sep);
        const json = payload.slice(sep + 2) || "{}";
        const params = JSON.parse(json);
        displayError = t(key, params as Record<string, unknown>);
      } catch {
        displayError = error;
      }
    }

    return (
      <div className={clsx("w-full", containerClassName)}>
        <label
          htmlFor={checkboxId}
          className={clsx(
            "inline-flex cursor-pointer items-start gap-3",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="relative mt-1 shrink-0">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              className={clsx("peer sr-only", className)}
              {...props}
            />

            <div
              className={clsx(
                "flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200",
                "border-border bg-surface",
                "peer-checked:border-[#1565C0] peer-checked:bg-[#1565C0]",
                "peer-focus:ring-2 peer-focus:ring-[#1976D2]/30 peer-focus:ring-offset-2",
                !disabled && "hover:border-border-strong",
                error &&
                  "border-danger peer-checked:border-danger peer-checked:bg-danger",
              )}
            >
              <CheckIcon
                className={clsx(
                  "h-4 w-4 text-text-inverse transition-all duration-200",
                  "scale-50 opacity-0",
                  "peer-checked:scale-100 peer-checked:opacity-100",
                )}
              />
            </div>
          </div>

          {label && (
            <span className="select-none text-sm text-text-secondary">
              {label}
            </span>
          )}
        </label>

        {displayError && (
          <p className="mt-2 text-sm text-danger">{displayError}</p>
        )}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
