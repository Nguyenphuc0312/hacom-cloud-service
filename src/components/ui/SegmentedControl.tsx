import React from "react";
import clsx from "clsx";

export interface SegmentedControlOption {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface SegmentedControlProps {
  value: string;
  options: SegmentedControlOption[];
  onChange: (id: string) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  value,
  options,
  onChange,
  size = "md",
  className,
  ariaLabel,
}) => {
  const isCompact = size === "sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "segmented-control inline-flex w-full items-center gap-1 rounded-md border border-border/60 bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={clsx(
              "segmented-control__option inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] font-medium transition-micro",
              isCompact
                ? "min-h-[var(--control-height-sm)] px-2.5 text-[12px]"
                : "min-h-[var(--control-height-md)] px-3 text-body-sm",
              active
                ? "bg-surface-hover text-text-primary"
                : "text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary",
            )}
          >
            {option.icon ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {option.icon}
              </span>
            ) : null}
            <span className="truncate">{option.label}</span>
            {typeof option.count === "number" && option.count > 0 ? (
              <span
                className={clsx(
                  "inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold transition-fast",
                  active
                    ? "bg-primary/12 text-primary"
                    : "bg-surface-overlay text-text-muted",
                )}
              >
                {option.count > 99 ? "99+" : option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
