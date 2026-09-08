/**
 * @fileoverview FileMessageCard — displays file attachments in chat bubbles.
 *
 * Features:
 * - Inline thumbnail for images / video
 * - File icon based on MIME type
 * - File name (truncated with ellipsis)
 * - File size formatted
 * - Download button
 * - Preview button (if previewable)
 * - Hover states for actions
 * - Skeleton loading for thumbnails
 * - Edge-case: deleted, scanning, blocked, large files
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EyeIcon,
  FolderOpenIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { resolvePublicResourceUrl } from "../../config";
import { useInViewport } from "../../hooks/useInViewport";
import {
  formatFileSize,
  getFileIconType,
  getPreviewType,
  isFileTooLargeForPreview,
} from "../../utils/formatFileSize";
import type { PreviewType, FileIconType } from "../../utils/formatFileSize";
import { FileTypeIcon } from "./FileTypeIcon";
import { Skeleton, SkeletonCircle } from "../ui";
import { truncateFilename } from "../../utils/truncateFilename";
import {
  canAutoOpenDownloadedFile,
  downloadBlobWithName,
  downloadResourceWithName,
  fetchResourceBlob,
} from "../../utils/downloadFile";
import type {
  ResourceDownloadOptions,
  ResourceDownloadProgress,
} from "../../utils/downloadFile";
import { FileName } from "../common/FileName";
import { MediaThumbnail } from "../common/MediaThumbnail";
import { SafeImage } from "../common/SafeImage";
import { useLocalFile } from "../../hooks/useLocalFile";
import { useAuthStore } from "../../stores/authStore";

// ── Status types for edge cases ──────────────────────────────────────

type FileStatus = "ready" | "scanning" | "blocked" | "deleted" | "error";

type DownloadStatus =
  "idle" | "downloading" | "download-error" | "open-error" | "browser-fallback";

type FileTransferIntent = "open" | "cache" | "save-as";

interface DownloadState {
  identity: string;
  status: DownloadStatus;
  loadedBytes: number;
  totalBytes?: number;
}

const initialDownloadState = (identity: string): DownloadState => ({
  identity,
  status: "idle",
  loadedBytes: 0,
});

const throwIfDownloadAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException("Download aborted", "AbortError");
  }
};

interface SharedBlobDownload {
  controller: AbortController;
  consumers: Map<symbol, ResourceDownloadOptions["onProgress"]>;
  promise: Promise<Blob>;
  progress: { latest?: ResourceDownloadProgress };
  settled: boolean;
}

interface SharedBlobLease {
  promise: Promise<Blob>;
  release: () => void;
}

const activeBlobDownloads = new Map<string, SharedBlobDownload>();

/** Share the byte transfer when the same attachment is rendered more than once. */
const acquireAttachmentBlob = (
  identity: string,
  resolveUrl: () => Promise<string | undefined>,
  options: ResourceDownloadOptions,
): SharedBlobLease => {
  const consumerId = Symbol(identity);
  let shared = activeBlobDownloads.get(identity);
  if (!shared) {
    const controller = new AbortController();
    const consumers = new Map<symbol, ResourceDownloadOptions["onProgress"]>();
    const progress: SharedBlobDownload["progress"] = {};
    consumers.set(consumerId, options.onProgress);
    const promise = Promise.resolve()
      .then(() => {
        throwIfDownloadAborted(controller.signal);
        return resolveUrl();
      })
      .then((url) => {
        throwIfDownloadAborted(controller.signal);
        if (!url) throw new Error("Missing download URL");
        return fetchResourceBlob(url, {
          ...options,
          signal: controller.signal,
          onProgress: (nextProgress: ResourceDownloadProgress) => {
            progress.latest = nextProgress;
            for (const notify of consumers.values()) {
              notify?.(nextProgress);
            }
          },
        });
      })
      .finally(() => {
        created.settled = true;
        if (
          created.consumers.size === 0 &&
          activeBlobDownloads.get(identity) === created
        ) {
          activeBlobDownloads.delete(identity);
        }
      });
    const created: SharedBlobDownload = {
      controller,
      consumers,
      promise,
      progress,
      settled: false,
    };
    activeBlobDownloads.set(identity, created);
    shared = created;
  } else {
    shared.consumers.set(consumerId, options.onProgress);
    if (!options.signal?.aborted && shared.progress.latest) {
      options.onProgress?.(shared.progress.latest);
    }
  }

  const operation = shared;
  let released = false;
  let handleAbort: (() => void) | undefined;
  const release = () => {
    if (released) return;
    released = true;
    if (handleAbort) {
      options.signal?.removeEventListener("abort", handleAbort);
    }
    operation.consumers.delete(consumerId);
    if (operation.consumers.size === 0) {
      if (activeBlobDownloads.get(identity) === operation) {
        activeBlobDownloads.delete(identity);
      }
      if (!operation.settled) {
        operation.controller.abort();
      }
    }
  };

  const promise = new Promise<Blob>((resolve, reject) => {
    handleAbort = () => {
      if (released) return;
      release();
      reject(new DOMException("Download aborted", "AbortError"));
    };

    if (options.signal?.aborted) {
      handleAbort();
      return;
    }
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    operation.promise.then(
      (blob) => {
        if (released) return;
        if (handleAbort) {
          options.signal?.removeEventListener("abort", handleAbort);
          handleAbort = undefined;
        }
        resolve(blob);
      },
      (error: unknown) => {
        if (released) return;
        release();
        reject(error);
      },
    );
  });

  return { promise, release };
};

interface FileMessageCardProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  /** Called when user wants to preview the file */
  onPreview?: (attachment: Attachment, previewType: PreviewType) => void;
  /** Override file status for edge-case states */
  fileStatus?: FileStatus;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────

const FileMessageCardComponent: React.FC<FileMessageCardProps> = ({
  conversationId,
  attachment,
  isOwn,
  onPreview,
  fileStatus = "ready",
  className,
}) => {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");

  const previewType = getPreviewType(
    attachment.mimeType,
    attachment.fileName,
  ) as PreviewType;
  const iconType = getFileIconType(
    attachment.mimeType,
    attachment.fileName,
  ) as FileIconType;
  const size = formatFileSize(attachment.fileSize);
  const displayFileName = attachment.fileName || t("chat:file.unknown");
  // Office documents (Word/Excel/PowerPoint) + PDF/text/csv/media are all
  // previewable in-browser. Only truly opaque types (archives, unknown) and
  // oversized files fall back to download-only.
  const isPreviewable =
    previewType !== "unknown" &&
    previewType !== "archive" &&
    !isFileTooLargeForPreview(attachment.fileSize) &&
    fileStatus === "ready";

  const isImage = previewType === "image";
  const isVideo = previewType === "video";
  const showThumbnail = (isImage || isVideo) && fileStatus === "ready";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(rootRef, { rootMargin: "240px 0px" });
  const thumbnailWidth = attachment.width
    ? Math.min(attachment.width, 280)
    : 200;
  const thumbnailAspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  // Resolve download URL (lazy — not auto-resolved)
  const { resolveUrl } = useAttachmentDownloadUrl(conversationId, attachment);

  // Trạng thái "file có trên máy chưa" + mở bằng app hệ thống (chỉ desktop).
  const {
    status: localStatus,
    canOpenLocally,
    canSaveAsLocally,
    openLocal,
    reveal,
    saveLocal,
    saveAsLocal,
    markDownloaded,
  } = useLocalFile(attachment, {
    currentUserId,
    conversationId,
  });

  const downloadIdentity = JSON.stringify([
    currentUserId,
    conversationId,
    attachment.id,
    attachment.objectKey,
    attachment.fileName,
    attachment.fileSize,
  ]);
  const [storedDownloadState, setDownloadState] = useState<DownloadState>(() =>
    initialDownloadState(downloadIdentity),
  );
  const downloadState =
    storedDownloadState.identity === downloadIdentity
      ? storedDownloadState
      : initialDownloadState(downloadIdentity);
  const activeDownloadRef = useRef<AbortController | null>(null);
  const activeOpenRef = useRef(false);
  const activeDownloadIdentityRef = useRef(downloadIdentity);
  const isDownloadBusy = downloadState.status === "downloading";
  const canAutoOpenFile = canAutoOpenDownloadedFile(attachment.fileName);
  const isCheckingLocalFile = canOpenLocally && localStatus === "unknown";
  const progressPercent = downloadState.totalBytes
    ? Math.min(
        100,
        Math.round(
          (downloadState.loadedBytes / downloadState.totalBytes) * 100,
        ),
      )
    : null;
  const mediaTransferLabel =
    downloadState.status === "download-error"
      ? t("chat:file.downloadFailed", {
          defaultValue: "Tải lỗi · Thử lại",
        })
      : downloadState.status === "browser-fallback"
        ? t("chat:file.desktopSaveFallback", {
            defaultValue: "Đã tải qua trình duyệt",
          })
        : isDownloadBusy
          ? downloadState.loadedBytes === 0
            ? t("chat:file.preparingDownload", {
                defaultValue: "Đang chuẩn bị tải…",
              })
            : progressPercent === null
              ? t("chat:file.downloadingSize", {
                  defaultValue: "Đang tải {{size}}",
                  size: formatFileSize(downloadState.loadedBytes),
                })
              : t("chat:file.downloadingProgress", {
                  defaultValue: "Đang tải {{progress}}%",
                  progress: progressPercent,
                })
          : null;

  useEffect(() => {
    if (activeDownloadIdentityRef.current !== downloadIdentity) {
      activeDownloadIdentityRef.current = downloadIdentity;
      // The transfer state belongs to the previous attachment.
      setDownloadState(initialDownloadState(downloadIdentity));
    }

    return () => {
      const activeDownload = activeDownloadRef.current;
      activeDownloadRef.current = null;
      activeDownload?.abort();
    };
  }, [downloadIdentity]);

  const directThumbnailUrl = useMemo(
    () =>
      resolvePublicResourceUrl(attachment.thumbnailUrl, {
        context: "image",
        allowBlob: true,
        allowDataImage: attachment.mimeType?.startsWith("image/") === true,
      }) ?? undefined,
    [attachment.mimeType, attachment.thumbnailUrl],
  );

  // Hacom Cloud development access URLs are already routed through the local
  // Vite object proxy. Keep that same-origin path intact for inline playback;
  // ordinary Chat attachments continue through the public resource resolver.
  const directMediaUrl = useMemo(() => {
    const source = attachment.url ?? attachment.downloadUrl;
    if (source?.startsWith("/cloud-object/")) return source;
    return resolvePublicResourceUrl(source, { context: "media" }) ?? undefined;
  }, [attachment.downloadUrl, attachment.url]);

  // Thumbnail URL: use thumbnail if available, otherwise resolve on-demand only
  const {
    url: resolvedThumbnailUrl,
    isLoading: isThumbLoading,
    resolveUrl: resolveThumbnailUrl,
  } = useAttachmentDownloadUrl(conversationId, attachment, {
    autoResolve: false,
  });
  const thumbnailUrl = directThumbnailUrl || resolvedThumbnailUrl;
  const shouldResolveThumbnail = isImage && !directThumbnailUrl;

  useEffect(() => {
    if (!isVisible || !shouldResolveThumbnail || thumbnailUrl) {
      return;
    }

    void resolveThumbnailUrl();
  }, [isVisible, resolveThumbnailUrl, shouldResolveThumbnail, thumbnailUrl]);

  // Derive thumbnail state keyed to URL, automatically resets on URL change
  const thumbStateKey = thumbnailUrl ?? "";
  const [thumbState, setThumbState] = useState<{
    key: string;
    loaded: boolean;
    error: boolean;
  }>({ key: thumbStateKey, loaded: false, error: false });

  // If thumbnail URL changed, reset state by creating new state object
  const thumbLoaded =
    thumbState.key === thumbStateKey ? thumbState.loaded : false;
  const thumbError =
    thumbState.key === thumbStateKey ? thumbState.error : false;

  const setThumbLoaded = useCallback(
    (loaded: boolean) =>
      setThumbState((prev) => ({ ...prev, key: thumbStateKey, loaded })),
    [thumbStateKey],
  );
  const setThumbError = useCallback(
    (error: boolean) =>
      setThumbState((prev) => ({ ...prev, key: thumbStateKey, error })),
    [thumbStateKey],
  );

  // ─ Handlers ─

  const handleDownload = useCallback(
    async (intent: FileTransferIntent = "cache") => {
      if (activeDownloadRef.current) return;

      const controller = new AbortController();
      let blobLease: SharedBlobLease | null = null;
      activeDownloadRef.current = controller;
      setDownloadState({
        identity: downloadIdentity,
        status: "downloading",
        loadedBytes: 0,
        totalBytes: attachment.fileSize,
      });

      try {
        if (intent === "save-as" && canSaveAsLocally) {
          const copied = await saveAsLocal(undefined);
          throwIfDownloadAborted(controller.signal);
          if (copied.ok || copied.reason === "canceled") {
            setDownloadState(initialDownloadState(downloadIdentity));
            return;
          }
          if (
            copied.reason !== "missing" &&
            copied.reason !== "size-mismatch"
          ) {
            throw new Error("Could not save a local copy");
          }
        }

        const downloadOptions = {
          signal: controller.signal,
          totalBytesHint: attachment.fileSize,
          expectedBytes: attachment.fileSize,
          onProgress: ({
            loadedBytes,
            totalBytes,
          }: {
            loadedBytes: number;
            totalBytes?: number;
          }) => {
            if (controller.signal.aborted) return;
            setDownloadState({
              identity: downloadIdentity,
              status: "downloading",
              loadedBytes,
              totalBytes,
            });
          },
        };

        if (canOpenLocally) {
          // The nhat desktop bridge accepts bytes, so fetch exactly once, save
          // into its managed attachment folder, then open through shell.openPath.
          blobLease = acquireAttachmentBlob(
            downloadIdentity,
            () => resolveUrl(true),
            downloadOptions,
          );
          const blob = await blobLease.promise;
          throwIfDownloadAborted(controller.signal);

          let saved: boolean;
          try {
            saved = await saveLocal(blob);
          } finally {
            blobLease.release();
            blobLease = null;
          }
          throwIfDownloadAborted(controller.signal);

          if (intent === "save-as" && canSaveAsLocally) {
            let copied = await saveAsLocal(saved ? undefined : blob);
            throwIfDownloadAborted(controller.signal);
            if (
              saved &&
              !copied.ok &&
              (copied.reason === "missing" || copied.reason === "size-mismatch")
            ) {
              copied = await saveAsLocal(blob);
              throwIfDownloadAborted(controller.signal);
            }
            if (copied.reason === "canceled") {
              setDownloadState(initialDownloadState(downloadIdentity));
              return;
            }
            if (!copied.ok) {
              throw new Error("Could not save a local copy");
            }
            throwIfDownloadAborted(controller.signal);
            setDownloadState(initialDownloadState(downloadIdentity));
            return;
          }

          if (!saved) {
            // Cache native is best-effort. The user must still receive the
            // already-fetched file when disk permissions or capacity fail.
            downloadBlobWithName(blob, attachment.fileName);
            setDownloadState({
              identity: downloadIdentity,
              status: "browser-fallback",
              loadedBytes: blob.size,
              totalBytes: blob.size,
            });
            return;
          }

          if (intent === "save-as") {
            // Compatibility fallback for older desktop shells without native
            // Save As: reuse the fetched bytes in Chromium's download flow.
            downloadBlobWithName(blob, attachment.fileName);
          } else if (intent === "open" && canAutoOpenFile) {
            throwIfDownloadAborted(controller.signal);
            const openResult = await openLocal();
            if (!openResult.ok) {
              setDownloadState({
                identity: downloadIdentity,
                status: "open-error",
                loadedBytes: blob.size,
                totalBytes: blob.size,
              });
              return;
            }
          }
        } else {
          const downloadUrl = await resolveUrl(true);
          if (!downloadUrl) throw new Error("Missing download URL");
          throwIfDownloadAborted(controller.signal);
          await downloadResourceWithName(
            downloadUrl,
            attachment.fileName,
            downloadOptions,
          );
          throwIfDownloadAborted(controller.signal);
          markDownloaded();
        }

        throwIfDownloadAborted(controller.signal);
        setDownloadState(initialDownloadState(downloadIdentity));
      } catch {
        if (controller.signal.aborted) {
          if (activeDownloadRef.current === controller) {
            setDownloadState(initialDownloadState(downloadIdentity));
          }
        } else {
          setDownloadState((current) =>
            current.identity === downloadIdentity
              ? { ...current, status: "download-error" }
              : current,
          );
        }
      } finally {
        blobLease?.release();
        if (activeDownloadRef.current === controller) {
          activeDownloadRef.current = null;
        }
      }
    },
    [
      attachment.fileName,
      attachment.fileSize,
      canAutoOpenFile,
      canOpenLocally,
      canSaveAsLocally,
      downloadIdentity,
      markDownloaded,
      openLocal,
      resolveUrl,
      saveAsLocal,
      saveLocal,
    ],
  );

  const handleCancelDownload = useCallback(() => {
    const activeDownload = activeDownloadRef.current;
    activeDownloadRef.current = null;
    activeDownload?.abort();
    setDownloadState(initialDownloadState(downloadIdentity));
  }, [downloadIdentity]);

  const handleReveal = useCallback(async () => {
    await reveal();
  }, [reveal]);

  const handlePreview = useCallback(() => {
    if (onPreview && isPreviewable) {
      onPreview(attachment, previewType);
    }
  }, [onPreview, isPreviewable, attachment, previewType]);

  /**
   * Desktop nhat: click a remote file downloads it once into the managed cache
   * and opens it with the OS app. Web keeps in-app preview where possible and
   * otherwise hands the file to the browser download flow.
   */
  const handleCardClick = useCallback(async () => {
    if (isDownloadBusy || isCheckingLocalFile) return;

    if (canOpenLocally && localStatus === "downloaded") {
      if (!canAutoOpenFile) {
        const revealResult = await reveal();
        if (!revealResult.ok && revealResult.reason === "missing") {
          await handleDownload("cache");
        }
        return;
      }
      if (activeOpenRef.current) return;
      activeOpenRef.current = true;
      try {
        const openResult = await openLocal();
        if (openResult.ok) {
          setDownloadState(initialDownloadState(downloadIdentity));
          return;
        }
        if (openResult.reason === "missing") {
          await handleDownload(canAutoOpenFile ? "open" : "cache");
          return;
        }
        setDownloadState({
          identity: downloadIdentity,
          status: "open-error",
          loadedBytes: attachment.fileSize ?? 0,
          totalBytes: attachment.fileSize,
        });
        return;
      } finally {
        activeOpenRef.current = false;
      }
    }

    if (downloadState.status === "download-error") {
      await handleDownload(
        canOpenLocally && canAutoOpenFile ? "open" : "cache",
      );
      return;
    }

    if (canOpenLocally) {
      await handleDownload(canAutoOpenFile ? "open" : "cache");
      return;
    }

    if (isPreviewable) {
      handlePreview();
      return;
    }

    await handleDownload("cache");
  }, [
    attachment.fileSize,
    canAutoOpenFile,
    canOpenLocally,
    downloadIdentity,
    downloadState.status,
    handleDownload,
    handlePreview,
    isDownloadBusy,
    isPreviewable,
    localStatus,
    isCheckingLocalFile,
    openLocal,
    reveal,
  ]);

  // ─ Edge-case renderers ─

  if (fileStatus === "deleted") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg p-3 opacity-60",
          isOwn ? "bg-surface/20" : "bg-surface-overlay",
          className,
        )}
      >
        <ExclamationTriangleIcon className="h-8 w-8 shrink-0 text-text-muted" />
        <span className="text-sm italic text-text-muted">
          {t("chat:filePreview.deleted", {
            defaultValue: "This file has been deleted",
          })}
        </span>
      </div>
    );
  }

  if (fileStatus === "blocked") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg border border-danger/30 p-3",
          isOwn ? "bg-danger/10" : "bg-danger/5",
          className,
        )}
      >
        <ShieldExclamationIcon className="h-8 w-8 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-danger">
            {t("chat:filePreview.blocked", {
              defaultValue: "File blocked — potential threat detected",
            })}
          </p>
          <p className="text-xs text-text-muted">
            {attachment.fileName || t("chat:file.unknown")}
          </p>
        </div>
      </div>
    );
  }

  if (fileStatus === "scanning") {
    return (
      <div
        className={clsx(
          "flex items-center gap-3 rounded-lg p-3",
          isOwn ? "bg-surface/20" : "bg-surface-overlay",
          className,
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <SkeletonCircle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx(
              "truncate text-sm font-medium",
              isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))]"
                : "text-text-primary",
            )}
          >
            {attachment.fileName || t("chat:file.unknown")}
          </p>
          <p
            className={clsx(
              "text-xs",
              isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
                : "text-text-muted",
            )}
          >
            {t("chat:filePreview.scanning", { defaultValue: "Scanning…" })}
          </p>
        </div>
      </div>
    );
  }

  // ─ Image thumbnail layout ─

  if (showThumbnail && isImage) {
    return (
      <div
        ref={rootRef}
        aria-busy={isDownloadBusy}
        className={clsx(
          "group/file relative overflow-hidden rounded-lg",
          className,
        )}
      >
        {/* Skeleton */}
        <div
          className="relative overflow-hidden rounded-lg bg-surface-overlay"
          style={{
            width: thumbnailWidth,
            maxWidth: "100%",
            aspectRatio: thumbnailAspectRatio,
          }}
        >
          {(!thumbLoaded || isThumbLoading) && !thumbError && (
            <Skeleton className="absolute inset-0" rounded="lg" />
          )}

          {thumbError && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-overlay">
              <ExclamationTriangleIcon className="h-8 w-8 text-text-muted" />
            </div>
          )}

          {thumbnailUrl && !thumbError && (
            <SafeImage
              src={thumbnailUrl}
              alt={attachment.fileName || t("chat:image.previewAlt")}
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity",
                thumbLoaded ? "opacity-100" : "opacity-0",
                "hover:brightness-90",
              )}
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
              onClick={handlePreview}
              fallback={null}
            />
          )}

          {thumbLoaded && isPreviewable && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-text-primary/0 transition-colors group-hover/file:bg-text-primary/20">
              <button
                type="button"
                onClick={handlePreview}
                className="pointer-events-auto rounded-full bg-surface/90 p-2 opacity-0 shadow-md backdrop-blur transition-opacity group-hover/file:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={t("chat:filePreview.preview", {
                  defaultValue: "Preview",
                })}
              >
                <EyeIcon className="h-5 w-5 text-text-primary" />
              </button>
            </div>
          )}
        </div>

        {/* File info bar at bottom */}
        <div
          className={clsx("mt-1 flex items-center justify-between gap-2 px-1")}
        >
          <span
            className={clsx(
              "truncate text-xs",
              downloadState.status === "download-error"
                ? "text-danger"
                : isOwn
                  ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
                  : "text-text-muted",
            )}
            role={
              mediaTransferLabel
                ? downloadState.status === "download-error"
                  ? "alert"
                  : "status"
                : undefined
            }
          >
            {mediaTransferLabel || size}
          </span>
          <button
            type="button"
            onClick={
              isDownloadBusy
                ? handleCancelDownload
                : () => void handleDownload("save-as")
            }
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))/0.7] hover:text-[hsl(var(--chat-bubble-sent-text))]"
                : "text-text-muted hover:text-text-primary",
            )}
            aria-label={
              isDownloadBusy
                ? t("chat:file.cancelDownloadNamed", {
                    defaultValue: "Hủy tải {{name}}",
                    name: displayFileName,
                  })
                : downloadState.status === "download-error"
                  ? t("chat:file.retryDownloadNamed", {
                      defaultValue: "Thử tải lại {{name}}",
                      name: displayFileName,
                    })
                  : t("chat:file.download")
            }
          >
            {isDownloadBusy ? (
              <XMarkIcon className="h-[18px] w-[18px]" />
            ) : downloadState.status === "download-error" ? (
              <ExclamationCircleIcon className="h-[18px] w-[18px] text-danger" />
            ) : (
              <ArrowDownTrayIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ─ Video thumbnail layout ─

  if (showThumbnail && isVideo) {
    return (
      <div
        ref={rootRef}
        aria-busy={isDownloadBusy}
        className={clsx(
          "group/file relative overflow-hidden rounded-lg",
          className,
        )}
      >
        {/* Video placeholder */}
        <div
          className={clsx(
            "relative flex h-36 w-full max-w-[280px] cursor-pointer items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            isOwn ? "bg-surface/20" : "bg-surface-overlay",
          )}
          onClick={handlePreview}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePreview();
            }
          }}
          aria-label={t("chat:filePreview.playVideo", {
            defaultValue: "Play video",
          })}
        >
          {directMediaUrl ? (
            <video
              src={directMediaUrl}
              className="absolute inset-0 h-full w-full rounded-lg object-contain"
              controls
              preload="metadata"
              playsInline
              aria-label={displayFileName}
            />
          ) : (
            <MediaThumbnail
              attachment={attachment}
              src={attachment.thumbnailUrl}
              variant="message"
              className="absolute inset-0 h-full w-full rounded-lg"
            />
          )}
        </div>

        {/* Info bar */}
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <span
            className={clsx(
              "truncate text-xs",
              downloadState.status === "download-error"
                ? "text-danger"
                : isOwn
                  ? "text-[hsl(var(--chat-bubble-sent-text))/0.7]"
                  : "text-text-muted",
            )}
            role={
              mediaTransferLabel
                ? downloadState.status === "download-error"
                  ? "alert"
                  : "status"
                : undefined
            }
          >
            {mediaTransferLabel ||
              `${truncateFilename(displayFileName, 24)} · ${size}`}
          </span>
          <button
            type="button"
            onClick={
              isDownloadBusy
                ? handleCancelDownload
                : () => void handleDownload("save-as")
            }
            className={clsx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isOwn
                ? "text-[hsl(var(--chat-bubble-sent-text))/0.7] hover:text-[hsl(var(--chat-bubble-sent-text))]"
                : "text-text-muted hover:text-text-primary",
            )}
            aria-label={
              isDownloadBusy
                ? t("chat:file.cancelDownloadNamed", {
                    defaultValue: "Hủy tải {{name}}",
                    name: displayFileName,
                  })
                : downloadState.status === "download-error"
                  ? t("chat:file.retryDownloadNamed", {
                      defaultValue: "Thử tải lại {{name}}",
                      name: displayFileName,
                    })
                  : t("chat:file.download")
            }
          >
            {isDownloadBusy ? (
              <XMarkIcon className="h-[18px] w-[18px]" />
            ) : downloadState.status === "download-error" ? (
              <ExclamationCircleIcon className="h-[18px] w-[18px] text-danger" />
            ) : (
              <ArrowDownTrayIcon className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ─ Generic file card (PDF, documents, archives, etc.) ─

  const isDownloaded = localStatus === "downloaded";
  const willPreviewInWeb = !canOpenLocally && isPreviewable;
  const canActivateCard =
    fileStatus === "ready" && !isDownloadBusy && !isCheckingLocalFile;

  const hasDownloadError = downloadState.status === "download-error";
  const hasOpenError = downloadState.status === "open-error";
  const hasBrowserFallback = downloadState.status === "browser-fallback";
  const statusLabel = hasDownloadError
    ? t("chat:file.downloadFailed", {
        defaultValue: "Tải lỗi · Thử lại",
      })
    : hasOpenError
      ? t("chat:file.openFailed", { defaultValue: "Đã tải · Không thể tự mở" })
      : hasBrowserFallback
        ? t("chat:file.desktopSaveFallback", {
            defaultValue: "Đã tải qua trình duyệt",
          })
        : isDownloadBusy
          ? downloadState.loadedBytes === 0
            ? t("chat:file.preparingDownload", {
                defaultValue: "Đang chuẩn bị tải…",
              })
            : progressPercent === null
              ? t("chat:file.downloadingSize", {
                  defaultValue: "Đang tải {{size}}",
                  size: formatFileSize(downloadState.loadedBytes),
                })
              : t("chat:file.downloadingProgress", {
                  defaultValue: "Đang tải {{progress}}%",
                  progress: progressPercent,
                })
          : isCheckingLocalFile
            ? t("chat:file.checkingLocalFile", {
                defaultValue: "Đang kiểm tra file…",
              })
            : isDownloaded
              ? canOpenLocally
                ? t("chat:file.savedOnDevice", {
                    defaultValue: "Đã có trên máy",
                  })
                : t("chat:file.alreadyDownloaded", {
                    defaultValue: "Đã yêu cầu tải",
                  })
              : canOpenLocally
                ? canAutoOpenFile
                  ? t("chat:file.clickToDownloadAndOpen", {
                      defaultValue: "Tải và mở",
                    })
                  : t("chat:file.clickToDownload", {
                      defaultValue: "Tải về",
                    })
                : isPreviewable
                  ? t("chat:file.downloadToKeep", {
                      defaultValue: "Tải về để xem lâu dài",
                    })
                  : t("chat:file.clickToDownload", {
                      defaultValue: "Tải về",
                    });

  const cardActionLabel = isCheckingLocalFile
    ? t("chat:file.checkingLocalFile", {
        defaultValue: "Đang kiểm tra file…",
      })
    : canOpenLocally && isDownloaded
      ? canAutoOpenFile
        ? t("chat:file.openFile", {
            defaultValue: "Mở {{name}}",
            name: displayFileName,
          })
        : t("chat:file.showInFolderNamed", {
            defaultValue: "Mở thư mục chứa {{name}}",
            name: displayFileName,
          })
      : hasDownloadError
        ? t("chat:file.retryDownloadNamed", {
            defaultValue: "Thử tải lại {{name}}",
            name: displayFileName,
          })
        : canOpenLocally && canAutoOpenFile
          ? t("chat:file.downloadAndOpenFile", {
              defaultValue: "Tải và mở {{name}}",
              name: displayFileName,
            })
          : willPreviewInWeb
            ? t("chat:filePreview.previewNamed", {
                defaultValue: "Xem trước {{name}}",
                name: displayFileName,
              })
            : t("chat:file.downloadNamed", {
                defaultValue: "Tải {{name}}",
                name: displayFileName,
              });

  const downloadActionLabel = isDownloadBusy
    ? t("chat:file.cancelDownloadNamed", {
        defaultValue: "Hủy tải {{name}}",
        name: displayFileName,
      })
    : hasDownloadError
      ? t("chat:file.retryDownloadNamed", {
          defaultValue: "Thử tải lại {{name}}",
          name: displayFileName,
        })
      : isDownloaded
        ? t("chat:file.redownloadNamed", {
            defaultValue: "Tải lại {{name}}",
            name: displayFileName,
          })
        : t("chat:file.downloadOnlyNamed", {
            defaultValue: "Chỉ tải {{name}}",
            name: displayFileName,
          });
  const liveStatusLabel =
    hasDownloadError || hasOpenError || hasBrowserFallback
      ? statusLabel
      : isDownloadBusy
        ? t("chat:file.downloadingNamed", {
            defaultValue: "Đang tải {{name}}",
            name: displayFileName,
          })
        : null;

  return (
    <div
      className={clsx(
        "group/file relative flex min-w-0 w-[24rem] max-w-full items-center overflow-hidden rounded-2xl border border-border/80 bg-surface p-3 transition-colors duration-150 hover:border-primary/30",
        className,
      )}
      aria-busy={isDownloadBusy || isCheckingLocalFile}
    >
      <button
        type="button"
        onClick={() => void handleCardClick()}
        disabled={!canActivateCard}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 disabled:cursor-progress"
        aria-label={cardActionLabel}
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center">
          <FileTypeIcon
            type={iconType}
            fileName={attachment.fileName}
            variant="tile"
          />
        </span>

        <span className="min-w-0 flex-1">
          <FileName
            name={displayFileName}
            title={attachment.fileName}
            className="text-sm font-semibold text-text-primary"
          />
          <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs">
            <span className="shrink-0 text-text-muted">{size}</span>
            <span className="shrink-0 text-text-muted/50">·</span>
            <span
              className={clsx(
                "flex min-w-0 items-center gap-1 overflow-hidden",
                hasDownloadError || hasOpenError
                  ? "text-danger"
                  : isDownloaded || hasBrowserFallback
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-primary",
              )}
            >
              {isDownloadBusy ? null : isCheckingLocalFile ? (
                <ArrowPathIcon className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
              ) : hasDownloadError || hasOpenError ? (
                <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" />
              ) : isDownloaded || hasBrowserFallback ? (
                <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
              ) : null}
              <span
                className="min-w-0 truncate tabular-nums"
                title={statusLabel}
              >
                {willPreviewInWeb &&
                !hasDownloadError &&
                !hasOpenError &&
                !isDownloadBusy ? (
                  <>
                    <span className="hidden group-hover/file:inline">
                      {t("chat:file.clickToPreview", {
                        defaultValue: "Nhấn để xem trước",
                      })}
                    </span>
                    <span className="group-hover/file:hidden">
                      {statusLabel}
                    </span>
                  </>
                ) : (
                  statusLabel
                )}
              </span>
            </span>
          </span>
        </span>
      </button>

      {liveStatusLabel && (
        <span
          className="sr-only"
          role={hasDownloadError || hasOpenError ? "alert" : "status"}
          aria-live={hasDownloadError || hasOpenError ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {liveStatusLabel}
        </span>
      )}
      <div className="ml-3 flex min-w-[5.75rem] shrink-0 items-center justify-end gap-1">
        {canOpenLocally && isDownloaded && !isDownloadBusy && (
          <button
            type="button"
            onClick={() => void handleReveal()}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={t("chat:file.showInFolderNamed", {
              defaultValue: "Mở thư mục chứa {{name}}",
              name: displayFileName,
            })}
          >
            <FolderOpenIcon className="h-[18px] w-[18px]" />
          </button>
        )}

        <button
          type="button"
          onClick={
            isDownloadBusy
              ? handleCancelDownload
              : () => void handleDownload("save-as")
          }
          disabled={isCheckingLocalFile}
          className={clsx(
            "flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
            isDownloadBusy && "border-primary/40 bg-primary/5 text-primary",
          )}
          aria-label={downloadActionLabel}
        >
          {isDownloadBusy ? (
            <XMarkIcon className="h-[18px] w-[18px]" />
          ) : (
            <ArrowDownTrayIcon className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>

      {isDownloadBusy && (
        <span
          className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-primary/10"
          role="progressbar"
          aria-label={statusLabel}
          aria-valuetext={statusLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent ?? undefined}
        >
          <span
            className={clsx(
              "block h-full bg-primary transition-[width] duration-150",
              progressPercent === null &&
                "animate-pulse motion-reduce:animate-none",
            )}
            style={{
              width:
                progressPercent === null
                  ? "35%"
                  : String(progressPercent) + "%",
            }}
          />
        </span>
      )}
    </div>
  );
};

export const FileMessageCard = React.memo(FileMessageCardComponent);

export default FileMessageCard;
