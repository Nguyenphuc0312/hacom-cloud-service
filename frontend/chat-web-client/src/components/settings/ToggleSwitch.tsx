/**
 * @fileoverview Toggle switch component for settings
 * Accessible, keyboard-navigable toggle with label + description.
 */

import React, { useId } from "react";
import clsx from "clsx";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}) => {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 rounded-[1rem] px-3 py-3",
        "transition-colors duration-150",
        !disabled && "hover:bg-surface-overlay/72",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <span id={id} className="block text-sm font-medium text-text-primary">
          {label}
        </span>
        {description && (
          <span
            id={descriptionId}
            className="mt-0.5 block text-xs leading-5 text-text-secondary"
          >
            {description}
          </span>
        )}
      </div>

      <button
        role="switch"
        type="button"
        aria-checked={checked}
        aria-labelledby={id}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full",
          "transition-all duration-200 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          checked ? "bg-[#1565C0] shadow-xs" : "bg-border-strong/55",
          disabled && "pointer-events-none",
        )}
      >
        <span
          className={clsx(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm",
            "transition-transform duration-200 ease-in-out",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
};

export default ToggleSwitch;
