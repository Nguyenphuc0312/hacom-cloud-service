/**
 * MessageItemSelection Component
 * Handles the checkbox UI for message selection mode
 * Responsible for: Rendering checkbox, handling change events
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { MessageItemSelectionProps } from "./types";

/**
 * MessageItemSelection - Checkbox component for message selection
 * Displayed only when isSelectionMode is true
 * Prevents event bubbling to avoid parent click handlers
 */
export const MessageItemSelection: React.FC<MessageItemSelectionProps> = ({
  isSelectionMode,
  isSelected,
  messageId,
  onToggleSelect,
}) => {
  const { t } = useTranslation();

  if (!isSelectionMode) {
    return null;
  }

  const handleChange = () => {
    onToggleSelect(messageId);
  };

  // Prevent event bubbling when clicking checkbox
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex shrink-0 items-center pt-2">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleChange}
        onClick={handleClick}
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
        aria-label={t("chat:selection.selectMessage", {
          defaultValue: "Chọn tin nhắn",
        })}
      />
    </div>
  );
};

MessageItemSelection.displayName = "MessageItemSelection";
