/**
 * @fileoverview RadioGroup component for settings
 * Used for theme, font-size, density selectors.
 */

import React from "react";
import clsx from "clsx";

interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface RadioGroupProps<T extends string> {
  label: string;
  description?: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Render options as pill buttons instead of standard radios */
  variant?: "default" | "pills" | "cards" | "list";
  className?: string;
}

export function RadioGroup<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  variant = "default",
  className,
}: RadioGroupProps<T>) {
  const header = (
    <div className="mb-2">
      <span className="block text-sm font-medium text-text-primary">
        {label}
      </span>
      {description && (
        <span className="mt-0.5 block text-xs text-text-muted">
          {description}
        </span>
      )}
    </div>
  );

  if (variant === "pills") {
    return (
      <div className={clsx("py-3", className)}>
        {header}
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium",
                "transition-micro",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                value === opt.value
                  ? "bg-primary text-text-inverse shadow-xs"
                  : "bg-surface-overlay text-text-secondary hover:bg-surface-hover",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={clsx("py-3", className)}>
        <div className="mb-3">{header}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={clsx(
                "flex flex-col items-center gap-2 rounded-[1rem] border px-3 py-3.5",
                "transition-micro",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                value === opt.value
                  ? "border-primary/30 bg-primary/6 shadow-xs"
                  : "border-border/70 bg-surface hover:border-border-strong hover:bg-surface-hover",
              )}
            >
              {opt.icon && (
                <div
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-[0.9rem]",
                    value === opt.value
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-overlay text-text-muted",
                  )}
                >
                  {opt.icon}
                </div>
              )}
              <span
                className={clsx(
                  "text-sm font-medium",
                  value === opt.value ? "text-primary" : "text-text-primary",
                )}
              >
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-xs text-text-muted">
                  {opt.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={clsx("py-1", className)}>
        {header}
        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={clsx(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                value === opt.value
                  ? "border-primary/25 bg-primary/8"
                  : "border-border/70 bg-surface hover:bg-surface-hover",
              )}
            >
              <span
                className={clsx(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  value === opt.value ? "border-primary" : "border-border-strong",
                )}
              >
                {value === opt.value ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                ) : null}
              </span>
              {opt.icon ? (
                <span
                  className={clsx(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    value === opt.value
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-border/70 bg-surface-overlay text-text-muted",
                  )}
                >
                  {opt.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">
                  {opt.label}
                </span>
                {opt.description ? (
                  <span className="mt-1 block text-xs leading-5 text-text-muted">
                    {opt.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default: standard radio list
  return (
    <fieldset
      className={clsx("py-3", className)}
      role="radiogroup"
      aria-label={label}
    >
      <legend className="mb-2">{header}</legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-[1rem] px-3 py-2.5",
              "transition-micro hover:bg-surface-hover",
              value === opt.value && "bg-primary/5",
            )}
          >
            <div
              className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                "transition-all duration-200",
                value === opt.value ? "border-primary" : "border-border-strong",
              )}
            >
              {value === opt.value && (
                <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              )}
            </div>
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <div>
              <span className="text-sm font-medium text-text-primary">
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 block text-xs text-text-muted">
                  {opt.description}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default RadioGroup;
