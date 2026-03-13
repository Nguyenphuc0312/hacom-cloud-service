/**
 * @fileoverview DensityToggle
 * A small, professional toggle for switching between comfortable and compact density.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AdjustmentsHorizontalIcon,
  Bars2Icon,
  Bars3Icon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import type { ChatDensity } from "../../stores/uiStore";

interface DensityToggleProps {
  density: ChatDensity;
  onChange: (density: ChatDensity) => void;
  className?: string;
}

const densityOptions: { value: ChatDensity; icon: typeof Bars3Icon }[] = [
  { value: "auto", icon: AdjustmentsHorizontalIcon },
  { value: "comfortable", icon: Bars3Icon },
  { value: "compact", icon: Bars2Icon },
  { value: "expanded", icon: RectangleStackIcon },
];

export const DensityToggle: React.FC<DensityToggleProps> = ({
  density,
  onChange,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-overlay p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label={t("chat:density.label", { defaultValue: "Display density" })}
    >
      {densityOptions.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={density === value}
          onClick={() => onChange(value)}
          className={clsx(
            "inline-flex items-center justify-center rounded-md p-1.5 transition-micro",
            density === value
              ? "bg-surface text-text-primary shadow-xs"
              : "text-text-secondary hover:text-text-primary",
          )}
          title={t(`chat:density.${value}`, { defaultValue: value })}
          aria-label={t(`chat:density.${value}`, { defaultValue: value })}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
};

export default DensityToggle;
