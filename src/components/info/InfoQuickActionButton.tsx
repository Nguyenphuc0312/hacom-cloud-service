import React from "react";
import clsx from "clsx";

interface InfoQuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  warning?: boolean;
  onClick: () => void;
  ariaLabel?: string;
  badge?: React.ReactNode;
}

export const InfoQuickActionButton: React.FC<InfoQuickActionButtonProps> = ({
  icon,
  label,
  active = false,
  disabled = false,
  warning = false,
  onClick,
  ariaLabel,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="group relative flex min-w-0 flex-col items-center gap-2 px-0.5 py-1 text-center transition-colors disabled:opacity-60"
    aria-label={ariaLabel ?? label}
  >
    <span
      className={clsx(
        "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
        warning
          ? "bg-warning/10 text-warning group-hover:bg-warning/15"
          : active
            ? "bg-[#e8ebf0] text-text-secondary"
            : "bg-[#eef1f5] text-primary group-hover:bg-[#e4e8ef]",
      )}
    >
      {icon}
      {badge}
    </span>
    <span className="min-h-[32px] max-w-[88px] text-center text-[13px] font-medium leading-4 text-text-secondary">
      {label}
    </span>
  </button>
);

export default InfoQuickActionButton;
