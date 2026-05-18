/**
 * @fileoverview FileStatus - Display file download/upload status.
 *
 * Status types:
 * - loading: Showing progress
 * - downloaded: File exists locally
 * - cloud: File exists on cloud
 * - failed: Download failed
 * - ready: Ready to download
 */

import React from "react";
import clsx from "clsx";
import {
  CheckCircleIcon,
  CloudArrowDownIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { t } from "i18next";

export type FileStatusType =
  | "loading"
  | "downloaded"
  | "cloud"
  | "failed"
  | "ready";

interface FileStatusProps {
  status: FileStatusType;
  progress?: number;
  isOwn?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const FileStatus: React.FC<FileStatusProps> = ({
  status,
  progress = 0,
  isOwn = false,
  onRetry,
  className,
}) => {
  const textColor = isOwn
    ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
    : "text-text-muted";

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <span className={clsx("flex items-center gap-1 text-xs", textColor)}>
            {t("chat:file.downloading", { defaultValue: "Đang tải..." })}
            {" "}
            {Math.round(progress)}%
          </span>
        );

      case "downloaded":
        return (
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            {t("chat:file.downloaded", { defaultValue: "Đã có trên máy" })}
          </span>
        );

      case "cloud":
        return (
          <span className="flex items-center gap-1 text-xs text-blue-500">
            <CloudArrowDownIcon className="h-3.5 w-3.5" />
            {t("chat:file.onCloud", { defaultValue: "Đã có trên Cloud" })}
          </span>
        );

      case "failed":
        return (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-red-500">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {t("chat:file.downloadFailed", { defaultValue: "Tải thất bại" })}
            </span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 text-xs text-red-500 underline transition-colors hover:text-red-400"
              >
                <ArrowPathIcon className="h-3 w-3" />
                {t("chat:file.retry", { defaultValue: "Thử lại" })}
              </button>
            )}
          </div>
        );

      case "ready":
      default:
        return (
          <span className={clsx("text-xs", textColor)}>
            {t("chat:file.readyToDownload", { defaultValue: "Sẵn sàng tải về" })}
          </span>
        );
    }
  };

  return (
    <div className={clsx("flex items-center", className)}>
      {renderContent()}
    </div>
  );
};

export default FileStatus;
