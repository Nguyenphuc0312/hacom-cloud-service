/**
 * @fileoverview FilePreviewModal - Unified file preview modal with support for all file types.
 * Supports image, video, audio, PDF, text, CSV, documents, and archives.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MusicalNoteIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { IconButton, Skeleton } from "../ui";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { SafeImage } from "../common/SafeImage";
import { TextPreview, CsvPreview, DocumentPreview, ExcelPreview, WordPreview, ArchivePreview, PdfPreview, PdfJsViewer } from "../preview";
import type { PreviewType } from "../../utils/mimeRegistry";
import {
  getMimePreviewType,
} from "../../utils/mimeRegistry";
import {
  formatFileSize,
  getFileExtension,
  getIconTypeFromPreviewType,
} from "../../utils/filePreviewUtils";
import type { PreviewTarget } from "../../hooks/useFilePreview";
import {
  downloadResourceWithName,
  openResourceInNewTab,
} from "../../utils/downloadFile";
import { truncateFilename } from "../../utils/truncateFilename";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  current: PreviewTarget | null;
  currentIndex: number;
  totalItems: number;
  secureUrl: string | null;
  isLoadingUrl: boolean;
  urlError: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRefreshUrl: () => Promise<void>;
  /** "full" (mặc định) = ảnh/video gần full màn; "compact" = nhỏ hơn (dùng cho
   *  danh sách file lịch, đỡ chói mắt). Chỉ đổi cỡ media, không đổi doc/pdf. */
  size?: "full" | "compact";
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;

const FilePreviewModalComponent: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  current,
  currentIndex,
  totalItems,
  secureUrl,
  isLoadingUrl,
  urlError,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onRefreshUrl,
  size = "full",
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Cỡ media (ảnh/video). Compact → khung nhỏ hẳn (max ~640px), ở giữa, không
  // còn cảm giác full màn. Full = gần full viewport như lightbox chat.
  const mediaBox =
    size === "compact"
      ? "max-h-[60vh] max-w-[min(640px,80vw)]"
      : "max-h-[88vh] max-w-[92vw]";
  const resetKey = `${currentIndex}:${secureUrl ?? ""}`;
  const [scaleState, setScaleState] = useState({ key: resetKey, value: 1 });

  // Get preview type from attachment
  const attachment = current?.attachment;
  const previewType: PreviewType = useMemo(() => {
    if (!attachment) return "unknown";
    return getMimePreviewType(attachment.mimeType, attachment.fileName);
  }, [attachment]);

  const fileName = attachment?.fileName ?? "";
  // Tên dài → cắt giữa giữ đuôi (….docx) như chuẩn file chat; tooltip giữ tên đầy đủ.
  const displayName = fileName ? truncateFilename(fileName, 48) : "";
  const fileMimeType = attachment?.mimeType ?? "";
  const fileSize = formatFileSize(attachment?.fileSize);
  const extension = getFileExtension(fileName || "file");
  const iconType = getIconTypeFromPreviewType(previewType);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    containerRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const scale = scaleState.key === resetKey ? scaleState.value : 1;

  const handleZoomIn = useCallback(() => {
    setScaleState((currentScale) => {
      const baseScale = currentScale.key === resetKey ? currentScale.value : 1;
      return {
        key: resetKey,
        value: Math.min(MAX_SCALE, baseScale + ZOOM_STEP),
      };
    });
  }, [resetKey]);

  const handleZoomOut = useCallback(() => {
    setScaleState((currentScale) => {
      const baseScale = currentScale.key === resetKey ? currentScale.value : 1;
      return {
        key: resetKey,
        value: Math.max(MIN_SCALE, baseScale - ZOOM_STEP),
      };
    });
  }, [resetKey]);

  const handleResetZoom = useCallback(() => {
    setScaleState({ key: resetKey, value: 1 });
  }, [resetKey]);

  const handleDownload = useCallback(async () => {
    if (!secureUrl) return;
    await downloadResourceWithName(
      secureUrl,
      fileName || `file-${Date.now()}.${extension.toLowerCase() || "bin"}`,
    );
  }, [extension, fileName, secureUrl]);

  const handleOpenInNewTab = useCallback(() => {
    if (!secureUrl) return;
    const inlineViewable = ["image", "pdf", "video", "audio", "text"].includes(
      previewType,
    );
    openResourceInNewTab(secureUrl, fileName, inlineViewable);
  }, [fileName, previewType, secureUrl]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "ArrowLeft":
          if (hasPrev) {
            event.preventDefault();
            onPrev();
          }
          break;
        case "ArrowRight":
          if (hasNext) {
            event.preventDefault();
            onNext();
          }
          break;
        case "+":
        case "=":
          if (previewType === "image") {
            event.preventDefault();
            handleZoomIn();
          }
          break;
        case "-":
          if (previewType === "image") {
            event.preventDefault();
            handleZoomOut();
          }
          break;
        case "0":
          if (previewType === "image") {
            event.preventDefault();
            handleResetZoom();
          }
          break;
      }
    },
    [
      handleResetZoom,
      handleZoomIn,
      handleZoomOut,
      hasNext,
      hasPrev,
      onClose,
      onNext,
      onPrev,
      previewType,
    ],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (previewType !== "image") return;
      event.preventDefault();
      if (event.deltaY > 0) {
        handleZoomOut();
      } else {
        handleZoomIn();
      }
    },
    [handleZoomIn, handleZoomOut, previewType],
  );

  const metadataLine = useMemo(() => {
    const parts = [fileSize];
    if (extension) {
      parts.push(extension);
    }
    if (fileMimeType) {
      parts.push(fileMimeType);
    }
    if (totalItems > 1) {
      parts.push(`${currentIndex + 1} / ${totalItems}`);
    }
    return parts.filter(Boolean).join(" - ");
  }, [currentIndex, extension, fileMimeType, fileSize, totalItems]);

  const renderUnavailableState = () => (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-text-inverse/12 bg-text-inverse/6 p-8 text-center backdrop-blur">
      <ExclamationTriangleIcon className="h-10 w-10 text-warning" />
      <p className="max-w-sm text-sm text-text-inverse/80">
        {t("chat:filePreview.urlError", {
          defaultValue: "Failed to load preview. The link may have expired.",
        })}
      </p>
      <button
        type="button"
        onClick={() => void onRefreshUrl()}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover"
      >
        <ArrowPathIcon className="h-4 w-4" />
        {t("chat:filePreview.retry", { defaultValue: "Retry" })}
      </button>
    </div>
  );

  const renderUnsupportedPreview = () => (
    <div
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-text-inverse/12 bg-text-inverse/6 p-5 backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-text-inverse/10">
          <FileTypeIcon type={iconType} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-text-inverse" title={fileName}>
            {displayName || t("chat:file.unknown")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-inverse/58">
            {extension && (
              <span className="rounded-full border border-text-inverse/12 px-2 py-0.5">
                {extension}
              </span>
            )}
            <span>{fileSize}</span>
            {fileMimeType && (
              <span className="truncate break-all">{fileMimeType}</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-text-inverse/60">
        {t("chat:filePreview.noPreview", {
          defaultValue: "Preview is not available for this file type.",
        })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleDownload()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          {t("chat:file.download")}
        </button>
        <button
          type="button"
          onClick={handleOpenInNewTab}
          className="flex items-center gap-2 rounded-lg border border-text-inverse/12 px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-text-inverse/8"
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          {t("chat:filePreview.openInNewTab", {
            defaultValue: "Open in new tab",
          })}
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (isLoadingUrl) {
      return (
        <div
          className="flex h-full w-full items-center justify-center p-6"
          aria-busy="true"
          aria-label={t("chat:filePreview.loading", {
            defaultValue: "Loading preview...",
          })}
          role="status"
        >
          <div className="w-full max-w-3xl space-y-4">
            <Skeleton className="aspect-video w-full bg-text-inverse/16" rounded="lg" />
            <div className="mx-auto flex max-w-md items-center justify-center gap-3">
              <Skeleton className="h-3 flex-1 bg-text-inverse/16" rounded="full" />
              <Skeleton className="h-3 w-20 bg-text-inverse/16" rounded="full" />
            </div>
          </div>
        </div>
      );
    }

    if (!current || (!secureUrl && urlError)) {
      return renderUnavailableState();
    }

    if (!current || !secureUrl) {
      return null;
    }

    // Text file preview
    if (previewType === "text") {
      return (
        <TextPreview
          url={secureUrl}
          fileName={fileName}
          fileSize={current.attachment.fileSize}
        />
      );
    }

    // CSV file preview
    if (previewType === "csv") {
      return (
        <CsvPreview
          url={secureUrl}
          fileName={fileName}
          fileSize={current.attachment.fileSize}
        />
      );
    }

    // PDF preview using PDF.js for cross-origin support
    if (previewType === "pdf") {
      if (secureUrl) {
        return (
          <PdfJsViewer
            url={secureUrl}
            fileName={fileName}
            fileSize={current.attachment.fileSize}
          />
        );
      }
      return (
        <PdfPreview
          url=""
          fileName={fileName}
          fileSize={current.attachment.fileSize}
        />
      );
    }

    // Word .docx → render client-side (docx-preview), chạy được cả localhost.
    const ext = extension.toLowerCase();
    const isDocx =
      ext === "docx" || fileMimeType.includes("wordprocessingml");
    const isXlsx =
      ext === "xlsx" ||
      ext === "xls" ||
      fileMimeType.includes("spreadsheetml") ||
      fileMimeType.includes("ms-excel");

    if (previewType === "document" && isDocx) {
      return <WordPreview url={secureUrl} fileName={fileName} />;
    }

    // Excel .xlsx/.xls → render bảng client-side (SheetJS).
    if (previewType === "spreadsheet" && isXlsx) {
      return <ExcelPreview url={secureUrl} fileName={fileName} />;
    }

    // Còn lại (.doc cũ, .pptx, ODF…) → Office Online viewer + fallback card.
    if (previewType === "document" || previewType === "spreadsheet" || previewType === "presentation") {
      return (
        <DocumentPreview
          url={secureUrl}
          fileName={fileName}
          fileSize={current.attachment.fileSize}
          mimeType={fileMimeType}
          previewType={previewType}
        />
      );
    }

    // Archive fallback
    if (previewType === "archive") {
      return (
        <ArchivePreview
          url={secureUrl}
          fileName={fileName}
          fileSize={current.attachment.fileSize}
          mimeType={fileMimeType}
        />
      );
    }

    // Image preview
    if (previewType === "image") {
      return (
        <div
          className={clsx(
            "flex items-center justify-center overflow-hidden",
            mediaBox,
          )}
          onClick={(event) => event.stopPropagation()}
          onWheel={handleWheel}
        >
          <SafeImage
            src={secureUrl}
            alt={fileName || t("chat:image.previewAlt")}
            className={clsx(
              "select-none object-contain transition-transform duration-150",
              mediaBox,
            )}
            style={{ transform: `scale(${scale})` }}
            draggable={false}
            fallback={
              <div className="flex min-h-[240px] min-w-[280px] flex-col items-center justify-center gap-2 rounded-xl bg-surface-overlay text-text-muted">
                <ExclamationTriangleIcon className="h-8 w-8" />
                <span className="text-sm">Khong tai duoc anh</span>
              </div>
            }
          />
        </div>
      );
    }

    // Video preview
    if (previewType === "video") {
      return (
        <div
          className={clsx("flex items-center justify-center", mediaBox)}
          onClick={(event) => event.stopPropagation()}
        >
          <video
            src={secureUrl}
            controls
            playsInline
            preload="metadata"
            className={clsx("rounded-xl", mediaBox)}
          >
            <track kind="captions" />
            {t("chat:filePreview.videoNotSupported", {
              defaultValue: "Your browser does not support video playback.",
            })}
          </video>
        </div>
      );
    }

    // Audio preview
    if (previewType === "audio") {
      return (
        <div
          className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-text-inverse/12 bg-text-inverse/6 p-5 backdrop-blur"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-text-inverse/10">
              <MusicalNoteIcon className="h-6 w-6 text-text-inverse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-inverse" title={fileName}>
                {displayName || t("chat:file.unknown")}
              </p>
              <p className="mt-1 text-xs text-text-inverse/58">
                {metadataLine}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-text-primary/24 p-3">
            <audio
              src={secureUrl}
              controls
              preload="metadata"
              className="w-full"
            >
              {t("chat:filePreview.audioNotSupported", {
                defaultValue: "Your browser does not support audio playback.",
              })}
            </audio>
          </div>
        </div>
      );
    }

    // Unknown type fallback
    return renderUnsupportedPreview();
  };

  if (!isOpen) {
    return null;
  }

  // Check if this preview type uses full-width layout
  const isFullWidth = [
    "pdf",
    "text",
    "csv",
    "document",
    "spreadsheet",
    "presentation",
  ].includes(previewType);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-modal flex items-center justify-center animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={t("chat:filePreview.modalLabel", {
        defaultValue: "File preview",
      })}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-text-primary/95 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-text-inverse/10">
            <FileTypeIcon type={iconType} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-inverse" title={fileName}>
              {displayName || t("chat:file.unknown")}
            </p>
            <p className="truncate text-xs text-text-inverse/50">
              {metadataLine}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {previewType === "image" && secureUrl && (
            <>
              <IconButton
                icon={<MagnifyingGlassMinusIcon className="h-5 w-5" />}
                aria-label={t("chat:filePreview.zoomOut", {
                  defaultValue: "Zoom out",
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  handleZoomOut();
                }}
                variant="ghost"
                className="text-text-inverse hover:bg-text-inverse/10"
              />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleResetZoom();
                }}
                className="rounded-lg px-2 py-1.5 text-sm text-text-inverse hover:bg-text-inverse/10"
              >
                {Math.round(scale * 100)}%
              </button>
              <IconButton
                icon={<MagnifyingGlassPlusIcon className="h-5 w-5" />}
                aria-label={t("chat:filePreview.zoomIn", {
                  defaultValue: "Zoom in",
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  handleZoomIn();
                }}
                variant="ghost"
                className="text-text-inverse hover:bg-text-inverse/10"
              />
              <IconButton
                icon={<ArrowsPointingOutIcon className="h-5 w-5" />}
                aria-label={t("chat:filePreview.fitToScreen", {
                  defaultValue: "Fit to screen",
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  handleResetZoom();
                }}
                variant="ghost"
                className="text-text-inverse hover:bg-text-inverse/10"
              />
              <div className="mx-1 h-6 w-px bg-text-inverse/20" />
            </>
          )}

          <IconButton
            icon={<ArrowDownTrayIcon className="h-5 w-5" />}
            aria-label={t("chat:file.download")}
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload();
            }}
            variant="ghost"
            className="text-text-inverse hover:bg-text-inverse/10"
            disabled={!secureUrl}
          />
          <IconButton
            icon={<ArrowTopRightOnSquareIcon className="h-5 w-5" />}
            aria-label={t("chat:filePreview.openInNewTab", {
              defaultValue: "Open in new tab",
            })}
            onClick={(event) => {
              event.stopPropagation();
              handleOpenInNewTab();
            }}
            variant="ghost"
            className="text-text-inverse hover:bg-text-inverse/10"
            disabled={!secureUrl}
          />
          <IconButton
            icon={<XMarkIcon className="h-5 w-5" />}
            aria-label={t("chat:filePreview.close", {
              defaultValue: "Close preview",
            })}
            onClick={onClose}
            variant="ghost"
            className="text-text-inverse hover:bg-text-inverse/10"
          />
        </div>
      </div>

      {totalItems > 1 && hasPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-inverse/10 text-text-inverse transition-colors hover:bg-text-inverse/20 sm:left-4 sm:h-12 sm:w-12"
          aria-label={t("chat:filePreview.previous", {
            defaultValue: "Previous file",
          })}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      )}

      {totalItems > 1 && hasNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-text-inverse/10 text-text-inverse transition-colors hover:bg-text-inverse/20 sm:right-4 sm:h-12 sm:w-12"
          aria-label={t("chat:filePreview.next", {
            defaultValue: "Next file",
          })}
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      )}

      <div className={clsx(
        "relative z-[1] flex items-center justify-center px-4",
        isFullWidth && "w-full"
      )}>
        {renderContent()}
      </div>

      {previewType === "image" && secureUrl && (
        <div className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 text-xs text-text-inverse/40 sm:block">
          {t("chat:filePreview.instructions", {
            defaultValue: "Scroll to zoom - Arrow keys to navigate",
          })}
        </div>
      )}
    </div>
  );
};

export const FilePreviewModal = React.memo(FilePreviewModalComponent);

export default FilePreviewModal;
