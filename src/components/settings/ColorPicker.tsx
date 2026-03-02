/**
 * @fileoverview ColorPicker — accent color selector (Zalo-style circles)
 */

import React from "react";
import clsx from "clsx";
import { CheckIcon } from "@heroicons/react/24/solid";
import type { AccentColor } from "../../settings/types";

interface ColorPickerProps {
  label: string;
  description?: string;
  value: AccentColor;
  onChange: (color: AccentColor) => void;
  className?: string;
}

const ACCENT_OPTIONS: { value: AccentColor; hsl: string; name: string }[] = [
  { value: "blue", hsl: "hsl(206, 100%, 41%)", name: "Blue" },
  { value: "green", hsl: "hsl(152, 76%, 33%)", name: "Green" },
  { value: "purple", hsl: "hsl(268, 83%, 47%)", name: "Purple" },
  { value: "orange", hsl: "hsl(24, 100%, 50%)", name: "Orange" },
  { value: "pink", hsl: "hsl(340, 82%, 52%)", name: "Pink" },
  { value: "teal", hsl: "hsl(180, 70%, 35%)", name: "Teal" },
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  description,
  value,
  onChange,
  className,
}) => {
  return (
    <div className={clsx("py-3", className)}>
      <div className="mb-3">
        <span className="block text-sm font-medium text-text-primary">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs text-text-muted">
            {description}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {ACCENT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.name}
            aria-label={opt.name}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "relative flex h-9 w-9 items-center justify-center rounded-full",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              value === opt.value && "ring-2 ring-offset-2 ring-offset-surface",
            )}
            style={{
              backgroundColor: opt.hsl,
              ...(value === opt.value
                ? { boxShadow: `0 0 0 2px ${opt.hsl}` }
                : {}),
            }}
          >
            {value === opt.value && (
              <CheckIcon className="h-4 w-4 text-white drop-shadow-sm" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ColorPicker;
