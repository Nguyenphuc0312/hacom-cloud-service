/**
 * @fileoverview Input component
 * Form input with semantic tokens.
 */

import React, { forwardRef, useState, useId } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isValid?: boolean;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      isValid,
      type = "text",
      disabled,
      className,
      containerClassName,
      id,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const uniqueId = useId();
    const inputId = id || `input-${uniqueId}`;

    const { t } = useTranslation();

    // decode i18n marker produced by validation when i18n wasn't initialized
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

    const isPasswordType = type === "password";
    const inputType = isPasswordType && showPassword ? "text" : type;

    return (
      <div className={clsx("w-full", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-body-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <span className="block h-5 w-5">{leftIcon}</span>
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={inputType}
            disabled={disabled}
            className={clsx(
              "w-full rounded-lg border bg-surface px-4 py-2.5",
              "text-body-sm text-text-primary placeholder:text-text-muted",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              !error &&
                !isValid &&
                "border-border focus:border-primary focus:ring-focus/20",
              error &&
                "border-danger pr-10 focus:border-danger focus:ring-danger/20",
              isValid &&
                !error &&
                "border-success pr-10 focus:border-success focus:ring-success/20",
              disabled &&
                "cursor-not-allowed border-disabled-border bg-disabled-bg text-text-disabled opacity-70",
              leftIcon && "pl-11",
              (rightIcon || isPasswordType) && "pr-11",
              className,
            )}
            {...props}
          />

          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {rightIcon && !isPasswordType && !error && !isValid && (
              <span className="h-5 w-5 text-text-muted">{rightIcon}</span>
            )}

            {isPasswordType && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-text-muted transition-colors hover:text-text-secondary focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            )}

            {displayError && (
              <ExclamationCircleIcon className="h-5 w-5 text-danger" />
            )}

            {isValid && !error && (
              <CheckCircleIcon className="h-5 w-5 text-success" />
            )}
          </div>
        </div>

        {displayError && (
          <p className="mt-2 flex items-center gap-1 text-body-sm text-danger">
            <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
            {displayError}
          </p>
        )}

        {hint && !error && (
          <p className="mt-2 text-body-sm text-text-muted">{hint}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      disabled,
      className,
      containerClassName,
      id,
      ...props
    },
    ref,
  ) => {
    const uniqueId = useId();
    const textareaId = id || `textarea-${uniqueId}`;
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
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-2 block text-body-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          className={clsx(
            "w-full resize-none rounded-lg border bg-surface px-4 py-2.5",
            "text-body-sm text-text-primary placeholder:text-text-muted",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            !error && "border-border focus:border-primary focus:ring-focus/20",
            error && "border-danger focus:border-danger focus:ring-danger/20",
            disabled &&
              "cursor-not-allowed border-disabled-border bg-disabled-bg text-text-disabled opacity-70",
            className,
          )}
          {...props}
        />

        {displayError && (
          <p className="mt-2 flex items-center gap-1 text-body-sm text-danger">
            <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
            {displayError}
          </p>
        )}

        {hint && !error && (
          <p className="mt-2 text-body-sm text-text-muted">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export default Input;
