import React, { useEffect, useRef, useMemo, useCallback } from "react";
import clsx from "clsx";
import type { ContextMenuItem } from "../../types";

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
  className?: string;
}

function calculateAdjustedPosition(
  position: { x: number; y: number },
  menuWidth: number = 200,
  menuHeight: number = 240,
): { x: number; y: number } {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let x = position.x;
  let y = position.y;

  if (x + menuWidth > viewport.width) {
    x = viewport.width - menuWidth - 8;
  }

  if (y + menuHeight > viewport.height) {
    y = viewport.height - menuHeight - 8;
  }

  return { x: Math.max(8, x), y: Math.max(8, y) };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  className,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const adjustedPosition = useMemo(
    () => calculateAdjustedPosition(position),
    [position],
  );

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleClickOutside, handleEscape]);

  // Auto-focus first item for keyboard accessibility
  useEffect(() => {
    requestAnimationFrame(() => {
      firstItemRef.current?.focus();
    });
  }, []);

  const enabledItems = items.filter((item) => !item.disabled);

  return (
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-dropdown min-w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-elev3",
        "animate-fade-in",
        className,
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
      role="menu"
      aria-orientation="vertical"
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.divider && index > 0 && (
            <div className="my-1 h-px bg-border/60" role="separator" />
          )}

          <button
            ref={index === 0 ? firstItemRef : undefined}
            className={clsx(
              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-micro",
              item.disabled
                ? "cursor-not-allowed opacity-40"
                : item.danger
                  ? "text-danger hover:bg-danger/8 active:bg-danger/12"
                  : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary active:bg-surface-active",
              "focus-visible:outline-none focus-visible:bg-surface-overlay",
            )}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            role="menuitem"
            disabled={item.disabled}
            tabIndex={item.disabled ? -1 : 0}
          >
            {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
