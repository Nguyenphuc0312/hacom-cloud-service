import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import {
  formatFileSize,
  getFileIcon,
  getFileExtension,
} from "../../utils/formatFileSize";

interface FileMessageProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  className?: string;
}

export const FileMessage: React.FC<FileMessageProps> = ({
  conversationId,
  attachment,
  isOwn,
  className,
}) => {
  const { t } = useTranslation();
  const icon = getFileIcon(attachment.fileName || "file");
  const extension = getFileExtension(attachment.fileName || "file");
  const size = formatFileSize(attachment.fileSize);
  const { resolveUrl, isLoading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
  );

  const handleDownload = async () => {
    const downloadUrl = await resolveUrl(true);
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank");
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
          {attachment.fileName || t("chat:file.unknown")}
        </p>
        <p className={clsx("text-xs", isOwn ? "text-text-inverse/70" : "text-text-muted")}>
          {size} • {extension}
        </p>
      </div>

      <button
        onClick={() => void handleDownload()}
        disabled={isLoading}
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          isOwn
            ? "bg-surface/25 text-text-inverse hover:bg-surface/35"
            : "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text-primary",
        )}
        aria-label={t("chat:file.download")}
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default FileMessage;
