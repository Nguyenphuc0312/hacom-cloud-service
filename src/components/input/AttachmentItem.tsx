/**
 * @fileoverview AttachmentItem — single file card in the attachment tray.
 *
 * Shows:
 * - Thumbnail (image/video) or icon (pdf/doc/other)
 * - Filename (truncated)
 * - File size
 * - Status badge: queued / uploading / ready / failed / blocked
 * - Progress bar during upload
 * - Remove button (X)
 * - Retry button when failed
 */

import React, { useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  DocumentTextIcon,
  FilmIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { AttachmentDraft } from "../../types/attachmentDraft";
import { formatFileSize } from "../../utils/formatFileSize";

interface AttachmentItemProps {
  draft: AttachmentDraft;
  onRemove: (localId: string) => void;
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
}

// ── Kind → Icon mapping ─────────────────────────────────────────────

const KindIcon: React.FC<{
  kind: AttachmentDraft["kind"];
  className?: string;
}> = ({ kind, className }) => {
  switch (kind) {
    case "image":
      return <PhotoIcon className={className} />;
    case "video":
      return <FilmIcon className={className} />;
    case "pdf":
      return <DocumentTextIcon className={clsx(className, "text-danger")} />;
    case "doc":
      return <DocumentTextIcon className={clsx(className, "text-primary")} />;
    default:
      return <DocumentTextIcon className={className} />;
  }
};

// ── Status badge ────────────────────────────────────────────────────

const StatusBadge: React.FC<{
  status: AttachmentDraft["status"];
  t: (key: string, opts?: Record<string, unknown>) => string;
}> = ({ status, t }) => {
  switch (status) {
    case "queued":
      return (
        <span className="text-[10px] font-medium text-text-muted">
          {t("chat:attachmentTray.queued")}
        </span>
      );
    case "uploading":
      return (
        <span className="text-[10px] font-medium text-primary">
          {t("chat:attachmentTray.uploading")}
        </span>
      );
    case "ready":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success">
          <CheckCircleIcon className="h-3 w-3" />
          {t("chat:attachmentTray.ready")}
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger">
          <ExclamationTriangleIcon className="h-3 w-3" />
          {t("chat:attachmentTray.failed")}
        </span>
      );
    case "blocked":
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-danger">
          <ShieldExclamationIcon className="h-3 w-3" />
          {t("chat:attachmentTray.blocked")}
        </span>
      );
    default:
      return null;
  }
};

// ── Component ───────────────────────────────────────────────────────

const AttachmentItemComponent: React.FC<AttachmentItemProps> = ({
  draft,
  onRemove,
  onCancel,
  onRetry,
}) => {
  const { t } = useTranslation();

  const handleRemoveOrCancel = useCallback(() => {
    if (draft.status === "uploading") {
      onCancel(draft.localId);
    } else {
      onRemove(draft.localId);
    }
  }, [draft.localId, draft.status, onCancel, onRemove]);

  const handleRetry = useCallback(() => {
    onRetry(draft.localId);
  }, [draft.localId, onRetry]);

  const hasPreview =
    draft.previewUrl && (draft.kind === "image" || draft.kind === "video");

  return (
    <div
      className={clsx(
        "group relative flex flex-col items-center gap-1",
        "w-[5.5rem] shrink-0 rounded-lg border border-border bg-surface-overlay p-1.5",
        "transition-colors hover:bg-surface-hover",
        draft.status === "failed" && "border-danger/40",
        draft.status === "blocked" && "border-danger/40",
      )}
      role="listitem"
      aria-label={`${draft.file.name} — ${draft.status}`}
    >
      {/* Remove / Cancel button */}
      <button
        type="button"
        onClick={handleRemoveOrCancel}
        className={clsx(
          "absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full",
          "bg-surface border border-border shadow-sm",
          "text-text-muted hover:bg-danger hover:text-text-inverse hover:border-danger",
          "opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={
          draft.status === "uploading"
            ? t("chat:attachmentTray.cancelUpload")
            : t("chat:attachmentTray.remove")
        }
      >
        <XMarkIcon className="h-3 w-3" />
      </button>

      {/* Thumbnail / Icon */}
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded">
        {hasPreview ? (
          <>
            {draft.kind === "image" ? (
              <img
                src={draft.previewUrl}
                alt=""
                className="h-12 w-full rounded object-cover"
                draggable={false}
              />
            ) : (
              <div className="relative flex h-12 w-full items-center justify-center bg-black/10 rounded">
                <FilmIcon className="h-5 w-5 text-text-muted" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-12 w-full items-center justify-center rounded bg-surface">
            <KindIcon kind={draft.kind} className="h-6 w-6 text-text-muted" />
          </div>
        )}

        {/* Progress overlay */}
        {draft.status === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-black/40">
            <span className="text-xs font-bold text-white">
              {draft.progress}%
            </span>
          </div>
        )}
      </div>

      {/* Filename */}
      <p
        className="w-full truncate text-center text-[11px] font-medium text-text-secondary"
        title={draft.file.name}
      >
        {draft.file.name}
      </p>

      {/* Size + Status */}
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="text-[10px] text-text-muted">
          {formatFileSize(draft.file.size)}
        </span>
        <StatusBadge status={draft.status} t={t} />
      </div>

      {/* Progress bar */}
      {(draft.status === "uploading" || draft.status === "queued") && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${draft.progress}%` }}
            role="progressbar"
            aria-valuenow={draft.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("chat:attachmentTray.uploadProgress", {
              name: draft.file.name,
              progress: draft.progress,
              defaultValue: `${draft.file.name} upload progress: ${draft.progress}%`,
            })}
          />
        </div>
      )}

      {/* Retry button for failed */}
      {draft.status === "failed" && (
        <button
          type="button"
          onClick={handleRetry}
          className={clsx(
            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
            "text-danger hover:bg-danger/10 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          )}
          aria-label={t("chat:attachmentTray.retryUpload", {
            name: draft.file.name,
            defaultValue: `Retry upload ${draft.file.name}`,
          })}
        >
          <ArrowPathIcon className="h-3 w-3" />
          {t("chat:attachmentTray.retry")}
        </button>
      )}

      {/* Error message */}
      {draft.error && draft.status === "failed" && (
        <p
          className="w-full truncate text-center text-[9px] text-danger"
          title={draft.error}
          role="alert"
        >
          {draft.error}
        </p>
      )}
    </div>
  );
};

export const AttachmentItem = React.memo(AttachmentItemComponent);

export default AttachmentItem;
