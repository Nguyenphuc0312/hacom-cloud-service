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
  menuWidth: number = 176,
  menuHeight: number = 220,
): { x: number; y: number } {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let x = position.x;
  let y = position.y;

  if (x + menuWidth > viewport.width) {
    x = viewport.width - menuWidth - 10;
  }

  if (y + menuHeight > viewport.height) {
    y = viewport.height - menuHeight - 10;
  }

  return { x: Math.max(10, x), y: Math.max(10, y) };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  className,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-dropdown min-w-44 rounded-md border border-border bg-surface py-1 shadow-elev2",
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
            <div className="my-1 h-px bg-border" role="separator" />
          )}

          <button
            className={clsx(
              "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
              item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
            )}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            {item.icon && <span className="h-5 w-5 shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
