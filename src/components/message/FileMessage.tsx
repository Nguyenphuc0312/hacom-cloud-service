import React from "react";
import clsx from "clsx";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import {
  formatFileSize,
  getFileIcon,
  getFileExtension,
} from "../../utils/formatFileSize";

interface FileMessageProps {
  attachment: Attachment;
  isOwn: boolean;
  className?: string;
}

export const FileMessage: React.FC<FileMessageProps> = ({
  attachment,
  isOwn,
  className,
}) => {
  const icon = getFileIcon(attachment.fileName || "file");
  const extension = getFileExtension(attachment.fileName || "file");
  const size = formatFileSize(attachment.fileSize);

  const handleDownload = () => {
    window.open(attachment.url, "_blank");
  };

  return (
    <div
      className={clsx(
        "flex min-w-0 max-w-full items-center gap-3 rounded-md p-3 sm:max-w-md",
        isOwn ? "bg-surface/20" : "bg-surface-overlay",
        className,
      )}
    >
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl",
          isOwn ? "bg-surface/25" : "bg-surface",
        )}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate break-all text-sm font-medium",
            isOwn ? "text-text-inverse" : "text-text-primary",
          )}
        >
          {attachment.fileName || "Unknown file"}
        </p>
        <p className={clsx("text-xs", isOwn ? "text-text-inverse/70" : "text-text-muted")}>
          {size} • {extension}
        </p>
      </div>

      <button
        onClick={handleDownload}
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          isOwn
            ? "bg-surface/25 text-text-inverse hover:bg-surface/35"
            : "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary",
        )}
        aria-label="Download file"
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default FileMessage;
