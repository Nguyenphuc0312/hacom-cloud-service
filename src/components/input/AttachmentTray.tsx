/**
 * @fileoverview AttachmentTray — horizontal scrolling tray of pending attachments.
 *
 * Appears above the composer when there are pending attachment drafts.
 * Scrolls horizontally on all viewports (touch + mouse wheel).
 *
 * Features:
 * - Horizontal scroll with overflow indicators
 * - Summary line: "X files · Y MB"
 * - Blocks send when uploads in progress (shows inline message)
 * - Responsive: fixed height, scrollable
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { AttachmentItem } from "./AttachmentItem";
import type { AttachmentDraft } from "../../types/attachmentDraft";
import { formatFileSize } from "../../utils/formatFileSize";

interface AttachmentTrayProps {
  drafts: AttachmentDraft[];
  onRemove: (localId: string) => void;
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onClearAll: () => void;
  hasUploadingDrafts: boolean;
  hasFailedDrafts: boolean;
  className?: string;
}

const AttachmentTrayComponent: React.FC<AttachmentTrayProps> = ({
  drafts,
  onRemove,
  onCancel,
  onRetry,
  onClearAll,
  hasUploadingDrafts,
  hasFailedDrafts,
  className,
}) => {
  const { t } = useTranslation();

  if (drafts.length === 0) return null;

  const totalSize = drafts.reduce((sum, d) => sum + d.file.size, 0);
  const readyCount = drafts.filter((d) => d.status === "ready").length;

  return (
    <div
      className={clsx(
        "border-b border-border bg-surface-overlay",
        "animate-content-fade",
        className,
      )}
      role="region"
      aria-label={t("chat:attachmentTray.region", {
        count: drafts.length,
        defaultValue: "{{count}} attached files",
      })}
    >
      {/* Header line */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>
            {t("chat:attachmentTray.summary", {
              count: drafts.length,
              size: formatFileSize(totalSize),
              defaultValue: "{{count}} files · {{size}}",
            })}
          </span>
          {hasUploadingDrafts && (
            <span className="text-primary">
              {t("chat:attachmentTray.uploadingStatus", {
                defaultValue: "Uploading…",
              })}
            </span>
          )}
          {hasFailedDrafts && !hasUploadingDrafts && (
            <span className="text-danger">
              {t("chat:attachmentTray.someFailedStatus", {
                defaultValue: "Some uploads failed",
              })}
            </span>
          )}
          {!hasUploadingDrafts &&
            !hasFailedDrafts &&
            readyCount === drafts.length && (
              <span className="text-success">
                {t("chat:attachmentTray.allReadyStatus", {
                  defaultValue: "All ready",
                })}
              </span>
            )}
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className={clsx(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-text-muted",
            "hover:bg-surface-active hover:text-text-primary transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          )}
          aria-label={t("chat:attachmentTray.clearAll", {
            defaultValue: "Remove all files",
          })}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          {t("chat:attachmentTray.clearAllLabel", {
            defaultValue: "Clear all",
          })}
        </button>
      </div>

      {/* Scrollable tray */}
      <div
        className={clsx(
          "flex gap-2 overflow-x-auto px-3 pb-2",
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
        )}
        role="list"
        aria-label={t("chat:attachmentTray.fileList", {
          defaultValue: "Attached files",
        })}
      >
        {drafts.map((draft) => (
          <AttachmentItem
            key={draft.localId}
            draft={draft}
            onRemove={onRemove}
            onCancel={onCancel}
            onRetry={onRetry}
          />
        ))}
      </div>

      {/* Inline warning when trying to send with uploads in progress */}
      {hasUploadingDrafts && (
        <p className="px-3 pb-2 text-[11px] text-warning">
          {t("chat:attachmentTray.waitForUploads", {
            defaultValue: "Please wait for uploads to finish before sending",
          })}
        </p>
      )}
    </div>
  );
};

export const AttachmentTray = React.memo(AttachmentTrayComponent);

export default AttachmentTray;
