/**
 * @fileoverview Checkbox component
 * Custom checkbox với animation
 */

import React, { forwardRef, useId } from "react";
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

    return (
      <div className={clsx("w-full", containerClassName)}>
        <label
          htmlFor={checkboxId}
          className={clsx(
            "inline-flex items-start gap-3 cursor-pointer",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {/* Custom checkbox */}
          <div className="relative flex-shrink-0 mt-0.5">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              className={clsx(
                "peer sr-only", // Hide default checkbox
                className,
              )}
              {...props}
            />
            {/* Custom checkbox UI */}
            <div
              className={clsx(
                "w-5 h-5 rounded border-2 transition-all duration-200",
                "flex items-center justify-center",
                // Unchecked state
                "border-gray-300 bg-white",
                // Checked state
                "peer-checked:border-telegram-primary peer-checked:bg-telegram-primary",
                // Focus state
                "peer-focus:ring-2 peer-focus:ring-telegram-primary/20 peer-focus:ring-offset-2",
                // Hover state
                !disabled &&
                  "hover:border-gray-400 peer-checked:hover:border-telegram-primary",
                // Error state
                error &&
                  "border-red-500 peer-checked:border-red-500 peer-checked:bg-red-500",
              )}
            >
              {/* Checkmark */}
              <CheckIcon
                className={clsx(
                  "w-3.5 h-3.5 text-white transition-all duration-200",
                  "opacity-0 scale-50",
                  "peer-checked:opacity-100 peer-checked:scale-100",
                )}
              />
            </div>
          </div>

          {/* Label */}
          {label && (
            <span className="text-sm text-gray-700 select-none">{label}</span>
          )}
        </label>

        {/* Error message */}
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
