import React, { useEffect, useRef, useMemo, useCallback } from "react";
import clsx from "clsx";
import type { ContextMenuItem } from "../../types";

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
  className?: string;
}

/**
 * Calculate adjusted position to keep menu within viewport
 */
function calculateAdjustedPosition(
  position: { x: number; y: number },
  menuWidth: number = 160,
  menuHeight: number = 200,
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

  // Calculate initial position using estimated menu dimensions
  const adjustedPosition = useMemo(
    () => calculateAdjustedPosition(position),
    [position],
  );

  // Handle click outside
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Handle escape key
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
        "fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-40 animate-fade-in",
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
            <div className="h-px bg-gray-200 my-1" role="separator" />
          )}
          <button
            className={clsx(
              "w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-100 transition-colors",
              item.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700",
            )}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            {item.icon && (
              <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
            )}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
