/**
 * @fileoverview Input component
 * Form input với nhiều variants và states
 */

import React, { forwardRef, useState, useId } from "react";
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

    const isPasswordType = type === "password";
    const inputType = isPasswordType && showPassword ? "text" : type;

    return (
      <div className={clsx("w-full", containerClassName)}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}

        {/* Input wrapper */}
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <span className="w-5 h-5 block">{leftIcon}</span>
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            disabled={disabled}
            className={clsx(
              // Base styles
              "w-full px-4 py-2.5 rounded-lg",
              "border bg-white text-gray-900 placeholder-gray-400",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              // Normal state
              !error &&
                !isValid &&
                "border-gray-300 focus:border-telegram-primary focus:ring-telegram-primary/20",
              // Error state
              error &&
                "border-red-500 focus:border-red-500 focus:ring-red-500/20 pr-10",
              // Valid state
              isValid &&
                !error &&
                "border-green-500 focus:border-green-500 focus:ring-green-500/20 pr-10",
              // Disabled state
              disabled && "bg-gray-100 cursor-not-allowed opacity-60",
              // Padding adjustments
              leftIcon && "pl-11",
              (rightIcon || isPasswordType) && "pr-11",
              className,
            )}
            {...props}
          />

          {/* Right side: validation icons or password toggle */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {/* Custom right icon */}
            {rightIcon && !isPasswordType && !error && !isValid && (
              <span className="text-gray-400 w-5 h-5">{rightIcon}</span>
            )}

            {/* Password toggle */}
            {isPasswordType && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeSlashIcon className="w-5 h-5" />
                ) : (
                  <EyeIcon className="w-5 h-5" />
                )}
              </button>
            )}

            {/* Error icon */}
            {error && (
              <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
            )}

            {/* Valid icon */}
            {isValid && !error && (
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Hint text */}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

/**
 * Textarea component
 */
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

    return (
      <div className={clsx("w-full", containerClassName)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          className={clsx(
            "w-full px-4 py-2.5 rounded-lg",
            "border bg-white text-gray-900 placeholder-gray-400",
            "transition-all duration-200 resize-none",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            !error &&
              "border-gray-300 focus:border-telegram-primary focus:ring-telegram-primary/20",
            error &&
              "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            disabled && "bg-gray-100 cursor-not-allowed opacity-60",
            className,
          )}
          {...props}
        />

        {error && (
          <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
            {error}
          </p>
        )}

        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export default Input;
