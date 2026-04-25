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
import { IconButton } from "../ui";
import { FileTypeIcon } from "../message/FileTypeIcon";
import {
  formatFileSize,
  getFileExtension,
  getFileIconType,
} from "../../utils/formatFileSize";
import type { PreviewType } from "../../utils/formatFileSize";
import type { PreviewTarget } from "../../hooks/useFilePreview";

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
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const resetKey = `${currentIndex}:${secureUrl ?? ""}`;
  const [scaleState, setScaleState] = useState({ key: resetKey, value: 1 });

  const previewType: PreviewType = current?.previewType ?? "unsupported";
  const fileName = current?.attachment.fileName ?? "";
  const fileMimeType = current?.attachment.mimeType ?? "";
  const fileSize = formatFileSize(current?.attachment.fileSize);
  const extension = getFileExtension(fileName || "file");
  const iconType = getFileIconType(
    current?.attachment.mimeType,
    current?.attachment.fileName,
  );

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

    try {
      const response = await fetch(secureUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download =
        fileName || `file-${Date.now()}.${extension.toLowerCase() || "bin"}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(secureUrl, "_blank", "noopener,noreferrer");
    }
  }, [extension, fileName, secureUrl]);

  const handleOpenInNewTab = useCallback(() => {
    if (!secureUrl) return;
    window.open(secureUrl, "_blank", "noopener,noreferrer");
  }, [secureUrl]);

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
          <p className="truncate text-sm font-medium text-text-inverse">
            {fileName || t("chat:file.unknown")}
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
        <div className="flex flex-col items-center justify-center gap-4">
          <span className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-text-inverse/35 border-t-text-inverse" />
          <p className="text-sm text-text-inverse/60">
            {t("chat:filePreview.loading", {
              defaultValue: "Loading preview...",
            })}
          </p>
        </div>
      );
    }

    if (!current || (!secureUrl && urlError)) {
      return renderUnavailableState();
    }

    if (!current || !secureUrl) {
      return null;
    }

    switch (previewType) {
      case "image":
        return (
          <div
            className="flex max-h-[88vh] max-w-[92vw] items-center justify-center overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            onWheel={handleWheel}
          >
            <img
              src={secureUrl}
              alt={fileName || t("chat:image.previewAlt")}
              className="max-h-[88vh] max-w-[92vw] select-none object-contain transition-transform duration-150"
              style={{ transform: `scale(${scale})` }}
              draggable={false}
            />
          </div>
        );

      case "video":
        return (
          <div
            className="flex max-h-[85vh] max-w-[92vw] items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <video
              src={secureUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[85vh] max-w-[92vw] rounded-xl"
            >
              <track kind="captions" />
              {t("chat:filePreview.videoNotSupported", {
                defaultValue: "Your browser does not support video playback.",
              })}
            </video>
          </div>
        );

      case "audio":
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
                <p className="truncate text-sm font-medium text-text-inverse">
                  {fileName || t("chat:file.unknown")}
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
                autoPlay
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

      case "pdf":
        return (
          <div
            className="flex h-[85vh] w-[92vw] max-w-5xl flex-col items-center"
            onClick={(event) => event.stopPropagation()}
          >
            <iframe
              src={`${secureUrl}#toolbar=0`}
              className="h-full w-full rounded-xl border-0 bg-white"
              title={fileName || "PDF Preview"}
              sandbox="allow-same-origin"
            />
            <p className="mt-2 text-xs text-text-inverse/50">
              {t("chat:filePreview.pdfFallback", {
                defaultValue: "Cannot render PDF preview. Open in a new tab.",
              })}
            </p>
          </div>
        );

      default:
        return renderUnsupportedPreview();
    }
  };

  if (!isOpen) {
    return null;
  }

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
            <p className="truncate text-sm font-medium text-text-inverse">
              {fileName || t("chat:file.unknown")}
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

      <div className={clsx("relative z-[1] flex items-center justify-center px-4", previewType === "pdf" && "w-full")}>
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
