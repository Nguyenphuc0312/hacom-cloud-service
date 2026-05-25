import React from "react";
import clsx from "clsx";
import { ChevronRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface InfoMenuRowProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  badge?: number;
  expandable?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}

export const InfoMenuRow: React.FC<InfoMenuRowProps> = ({
  icon,
  label,
  count,
  badge,
  expandable = false,
  expanded = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expandable ? expanded : undefined}
      className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-text-secondary [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="shrink-0 text-sm text-text-muted">{count}</span>
      ) : null}
      {badge && badge > 0 ? (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-medium leading-none text-white">
          {badge}
        </span>
      ) : null}
      {expandable ? (
        <ChevronDownIcon
          className={clsx(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      ) : (
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
};

export default InfoMenuRow;
