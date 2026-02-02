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
    // In a real app, this would trigger a download
    window.open(attachment.url, "_blank");
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-3 p-3 rounded-lg min-w-[200px]",
        isOwn ? "bg-white/10" : "bg-gray-100",
        className,
      )}
    >
      {/* File icon */}
      <div
        className={clsx(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl",
          isOwn ? "bg-white/20" : "bg-gray-200",
        )}
      >
        {icon}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            "font-medium text-sm truncate",
            isOwn ? "text-white" : "text-gray-900",
          )}
        >
          {attachment.fileName || "Unknown file"}
        </p>
        <p
          className={clsx("text-xs", isOwn ? "text-white/70" : "text-gray-500")}
        >
          {size} • {extension}
        </p>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className={clsx(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
          isOwn
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-gray-200 hover:bg-gray-300 text-gray-600",
        )}
        aria-label="Download file"
      >
        <ArrowDownTrayIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default FileMessage;
