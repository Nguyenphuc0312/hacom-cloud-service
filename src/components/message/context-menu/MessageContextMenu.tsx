/**
 * @fileoverview MessageContextMenu - Right-click/long-press context menu for messages.
 *
 * Features:
 * - Desktop: right-click trigger
 * - Mobile: long-press trigger (300ms)
 * - Actions: reply, forward, copy link, pin, download, delete
 * - Dividers between action groups
 * - Danger styling for destructive actions
 * - Auto-positioning within viewport
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import type { ContextMenuItem, MessageContextMenuOptions } from "./buildMessageContextMenuItems";

interface MessageContextMenuProps {
  /** Menu items to display */
  items: ContextMenuItem[];
  /** Whether the menu is open */
  isOpen: boolean;
  /** Position (x, y) - will be adjusted to stay within viewport */
  position: { x: number; y: number };
  /** Callback when menu should close */
  onClose: () => void;
  className?: string;
}

export type { MessageContextMenuOptions };

const MENU_MIN_WIDTH = 180;
const MENU_APPROX_HEIGHT = 240;
const PADDING = 8;

/**
 * Calculate adjusted position to keep menu within viewport
 */
function calculateAdjustedPosition(
  position: { x: number; y: number },
  menuWidth: number = MENU_MIN_WIDTH,
  menuHeight: number = MENU_APPROX_HEIGHT,
): { x: number; y: number } {
  if (typeof window === "undefined") {
    return position;
  }

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let x = position.x;
  let y = position.y;

  // Adjust horizontal position
  if (x + menuWidth > viewport.width - PADDING) {
    x = Math.max(PADDING, viewport.width - menuWidth - PADDING);
  }

  // Adjust vertical position
  if (y + menuHeight > viewport.height - PADDING) {
    y = Math.max(PADDING, viewport.height - menuHeight - PADDING);
  }

  return { x, y };
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  items,
  isOpen,
  position,
  onClose,
  className,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position based on actual menu size
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    setAdjustedPosition(calculateAdjustedPosition(position, rect.width, rect.height));
  }, [isOpen, position]);

  // Click outside to close
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Escape key to close
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, handleClickOutside, handleEscape]);

  // Auto-focus first item
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        firstItemRef.current?.focus();
      });
    }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  // Filter out empty items
  const visibleItems = items.filter(item => !item.divider || items.indexOf(item) > 0);

  return createPortal(
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-dropdown overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-elev3",
        "animate-fade-in min-w-[180px]",
        className,
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
      role="menu"
      aria-orientation="vertical"
    >
      {visibleItems.map((item, index) => (
        <React.Fragment key={item.id}>
          {/* Divider */}
          {item.divider && index > 0 && (
            <div className="my-1 h-px bg-border/60" role="separator" />
          )}

          {/* Menu item */}
          <button
            ref={index === 0 ? firstItemRef : undefined}
            className={clsx(
              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-micro",
              item.disabled
                ? "cursor-not-allowed opacity-40"
                : item.danger
                  ? "text-danger hover:bg-danger/8 active:bg-danger/12"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active",
              "focus-visible:outline-none focus-visible:bg-surface-hover",
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
            {item.icon && (
              <span className="h-4 w-4 shrink-0">{item.icon}</span>
            )}
            <span className="flex-1">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
};

export default MessageContextMenu;
