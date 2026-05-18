/**
 * @fileoverview StickerSearchInput - Search input component for sticker picker.
 */

import React, { useCallback, useRef, useEffect } from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface StickerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export const StickerSearchInput: React.FC<StickerSearchInputProps> = ({
  value,
  onChange,
  onClear,
  placeholder = "Tìm sticker...",
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={clsx("relative", className)}>
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={clsx(
          "w-full rounded-lg border border-border bg-surface-overlay py-2 pl-9 pr-8 text-sm",
          "placeholder:text-text-muted",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          aria-label="Clear search"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default StickerSearchInput;
