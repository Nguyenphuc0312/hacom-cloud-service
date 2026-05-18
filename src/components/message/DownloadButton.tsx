/**
 * @fileoverview DownloadButton - Download action button for file messages.
 *
 * Features:
 * - Shows download icon when file not downloaded
 * - Shows folder icon when file is downloaded
 * - Loading state during download
 * - Disabled state when processing
 */

import React from "react";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import { t } from "i18next";

interface DownloadButtonProps {
  isDownloaded?: boolean;
  isLoading?: boolean;
  isOwn?: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  isDownloaded = false,
  isLoading = false,
  isOwn = false,
  onClick,
  disabled = false,
  size = "md",
  className,
}) => {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-8 w-8",
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const baseClasses = clsx(
    "flex shrink-0 items-center justify-center rounded-full transition-all duration-150",
    sizeClasses[size],
    "disabled:cursor-not-allowed disabled:opacity-50",
  );

  const ownClasses = isDownloaded
    ? "bg-[hsl(var(--chat-bubble-sent-text))/0.15] text-[hsl(var(--chat-bubble-sent-text))] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.25]"
    : "bg-[hsl(var(--chat-bubble-sent-text))/0.15] text-[hsl(var(--chat-bubble-sent-text))] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.25]";

  const otherClasses = isDownloaded
    ? "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary"
    : "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={clsx(
        baseClasses,
        isOwn ? ownClasses : otherClasses,
        className,
      )}
      aria-label={
        isDownloaded
          ? t("chat:file.openFolder", { defaultValue: "Mở thư mục chứa file" })
          : t("chat:file.download", { defaultValue: "Tải về" })
      }
    >
      {isLoading ? (
        <ArrowDownTrayIcon className={clsx(iconSize, "animate-pulse")} />
      ) : isDownloaded ? (
        <FolderOpenIcon className={iconSize} />
      ) : (
        <ArrowDownTrayIcon className={iconSize} />
      )}
    </button>
  );
};

export default DownloadButton;
