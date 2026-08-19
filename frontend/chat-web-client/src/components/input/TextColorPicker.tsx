import React from "react";
import clsx from "clsx";

interface TextColorPickerProps {
  activeColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// Fixed swatch row (Zalo-style) — a curated palette, not a free-form picker.
// null = clear/default (inherit theme text color).
const SWATCHES: Array<{ value: string | null; label: string }> = [
  { value: null, label: "Mặc định" },
  { value: "#E53935", label: "Đỏ" },
  { value: "#F4511E", label: "Cam" },
  { value: "#F9A825", label: "Vàng" },
  { value: "#43A047", label: "Xanh lá" },
  { value: "#1565C0", label: "Xanh dương" },
  { value: "#5E35B1", label: "Tím" },
  { value: "#6D4C41", label: "Nâu" },
  { value: "#757575", label: "Xám" },
];

export const TextColorPicker: React.FC<TextColorPickerProps> = ({
  activeColor,
  onSelect,
  onClose,
  className,
  style,
}) => {
  const pickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      role="menu"
      style={style}
      className={clsx(
        "flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised p-2 shadow-lg shadow-black/10 ring-1 ring-black/5",
        className,
      )}
    >
      {SWATCHES.map((swatch) => {
        const isActive = swatch.value === (activeColor ?? null);
        return (
          <button
            key={swatch.value ?? "default"}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            title={swatch.label}
            onClick={() => {
              onSelect(swatch.value);
              onClose();
            }}
            className={clsx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
              isActive && "ring-2 ring-offset-1 ring-primary",
            )}
          >
            {swatch.value ? (
              <span
                className="h-full w-full rounded-full border border-black/10"
                style={{ backgroundColor: swatch.value }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-full border border-border bg-surface text-[10px] font-bold text-text-secondary">
                A
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TextColorPicker;
