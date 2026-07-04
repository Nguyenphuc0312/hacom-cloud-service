import React, { useState } from "react";
import clsx from "clsx";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

/** Rounded card with a collapsible body — the info-panel section shell shared by GroupInfo & UserProfile. */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  defaultOpen = true,
  danger = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = React.useId();

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl border bg-surface",
        danger ? "border-red-200 bg-red-50/30" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={clsx(
          "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors",
          danger ? "hover:bg-red-50/60" : "hover:bg-surface-hover",
        )}
        aria-expanded={open}
        aria-controls={sectionId}
      >
        <span className={clsx("shrink-0", danger ? "text-red-600" : "text-text-muted")}>
          {icon}
        </span>
        <span
          className={clsx(
            "flex-1 text-sm font-medium",
            danger ? "text-red-600" : "text-text-primary",
          )}
        >
          {title}
        </span>
        {badge}
        <ChevronDownIcon
          className={clsx(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            danger ? "text-red-600" : "text-text-muted",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={sectionId}
          className={clsx(
            "border-t",
            danger ? "border-red-200" : "border-border",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
