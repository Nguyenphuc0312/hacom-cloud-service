/**
 * @fileoverview FilePreviewModal — full-screen preview for images, videos, PDFs.
 *
 * Features:
 * - Dark backdrop with blur
 * - ESC / click-outside to close
 * - Arrow key navigation for gallery
 * - Image: zoom (wheel / pinch), drag pan, fit-to-screen, double-click reset
 * - Video: native HTML5 player
 * - PDF: iframe viewer with download fallback
 * - Unsupported: file info + download
 * - Focus trap, role="dialog", aria attributes
 * - Responsive: mobile full-screen, swipe-down to close
 * - Smooth animations (fade / scale)
 * - Keyboard accessible
 * - Revokes object URLs on unmount
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { IconButton } from "../ui";
import { FileTypeIcon } from "../message/FileTypeIcon";
import {
  formatFileSize,
  getFileIconType,
  getFileExtension,
} from "../../utils/formatFileSize";
import type { PreviewType } from "../../utils/formatFileSize";
import type { PreviewTarget } from "../../hooks/useFilePreview";

// ── Props ────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;
const SWIPE_THRESHOLD = 100;

// ── Component ────────────────────────────────────────────────────────

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
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Drag state (not part of reset key)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });

  // Mobile swipe
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Created object URLs to revoke on unmount
  const objectUrlsRef = useRef<string[]>([]);

  const previewType: PreviewType = current?.previewType ?? "unsupported";
  const fileName = current?.attachment.fileName ?? "";
  const fileSize = formatFileSize(current?.attachment.fileSize);
  const iconType = getFileIconType(
    current?.attachment.mimeType,
    current?.attachment.fileName,
  );
  const extension = getFileExtension(fileName || "file");

  // ─ Reset state on target change ─
  // Derive a stable "reset key" from index + URL to auto-reset internal state without useEffect
  const resetKey = `${currentIndex}:${secureUrl ?? ""}`;
  const [viewState, setViewState] = useState({
    key: resetKey,
    scale: 1,
    position: { x: 0, y: 0 },
    imgLoaded: false,
    imgError: false,
    swipeOffset: 0,
  });

  // If resetKey changed, derive fresh defaults
  const isStale = viewState.key !== resetKey;
  const scale = isStale ? 1 : viewState.scale;
  const position = useMemo(
    () => (isStale ? { x: 0, y: 0 } : viewState.position),
    [isStale, viewState.position],
  );
  const imgLoaded = isStale ? false : viewState.imgLoaded;
  const imgError = isStale ? false : viewState.imgError;
  const swipeOffset = isStale ? 0 : viewState.swipeOffset;

  const setScale = useCallback(
    (updater: number | ((prev: number) => number)) =>
      setViewState((prev) => {
        const key = resetKey;
        const base = prev.key === key ? prev.scale : 1;
        const next = typeof updater === "function" ? updater(base) : updater;
        return { ...prev, key, scale: next };
      }),
    [resetKey],
  );
  const setPosition = useCallback(
    (pos: { x: number; y: number }) =>
      setViewState((prev) => ({ ...prev, key: resetKey, position: pos })),
    [resetKey],
  );
  const setImgLoaded = useCallback(
    (v: boolean) =>
      setViewState((prev) => ({ ...prev, key: resetKey, imgLoaded: v })),
    [resetKey],
  );
  const setImgError = useCallback(
    (v: boolean) =>
      setViewState((prev) => ({ ...prev, key: resetKey, imgError: v })),
    [resetKey],
  );
  const setSwipeOffset = useCallback(
    (v: number) =>
      setViewState((prev) => ({ ...prev, key: resetKey, swipeOffset: v })),
    [resetKey],
  );

  // ─ Focus trap & body scroll lock ─

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    containerRef.current?.focus();

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ─ Cleanup object URLs ─

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  // ─ Keyboard handler ─

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (hasPrev) onPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (hasNext) onNext();
          break;
        case "+":
        case "=":
          e.preventDefault();
          setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
          break;
        case "-":
          e.preventDefault();
          setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE));
          break;
        case "0":
          e.preventDefault();
          setScale(1);
          setPosition({ x: 0, y: 0 });
          break;
      }
    },
    [onClose, hasPrev, hasNext, onPrev, onNext, setScale, setPosition],
  );

  // ─ Zoom handlers ─

  const handleZoomIn = useCallback(
    () => setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE)),
    [setScale],
  );
  const handleZoomOut = useCallback(
    () => setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE)),
    [setScale],
  );
  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [setScale, setPosition]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (previewType !== "image") return;
      e.preventDefault();
      setScale((s) => {
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta));
      });
    },
    [previewType, setScale],
  );

  // ─ Drag (pan) handlers ─

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1 || previewType !== "image") return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      posStartRef.current = { ...position };
    },
    [scale, position, previewType],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: posStartRef.current.x + (e.clientX - dragStartRef.current.x),
        y: posStartRef.current.y + (e.clientY - dragStartRef.current.y),
      });
    },
    [isDragging, setPosition],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ─ Touch handlers (mobile swipe-down to close + pinch zoom) ─

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && scale <= 1) {
        const dy = e.touches[0].clientY - touchStartRef.current.y;
        if (dy > 0) {
          setSwipeOffset(dy);
        }
      }
    },
    [scale, setSwipeOffset],
  );

  const handleTouchEnd = useCallback(() => {
    if (swipeOffset > SWIPE_THRESHOLD) {
      onClose();
    }
    setSwipeOffset(0);
  }, [swipeOffset, onClose, setSwipeOffset]);

  // ─ Download handler ─

  const handleDownload = useCallback(async () => {
    if (!secureUrl) return;
    try {
      const response = await fetch(secureUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.push(blobUrl);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        fileName || `file-${Date.now()}.${extension.toLowerCase() || "bin"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(secureUrl, "_blank");
    }
  }, [secureUrl, fileName, extension]);

  const handleImageError = useCallback(() => {
    setImgError(true);
  }, [setImgError]);

  // ─ Swipe transform ─

  const swipeStyle = useMemo(
    () =>
      swipeOffset > 0
        ? {
            transform: `translateY(${swipeOffset}px) scale(${1 - swipeOffset / 1000})`,
            opacity: 1 - swipeOffset / 400,
          }
        : undefined,
    [swipeOffset],
  );

  // ─ Render ─

  if (!isOpen) return null;

  const renderContent = () => {
    // Loading state
    if (isLoadingUrl) {
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <span className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-text-inverse/40 border-t-text-inverse" />
          <p className="text-sm text-text-inverse/60">
            {t("chat:filePreview.loading", {
              defaultValue: "Loading preview…",
            })}
          </p>
        </div>
      );
    }

    // Error state
    if (urlError && !secureUrl) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-surface/10 p-8 backdrop-blur">
          <ExclamationTriangleIcon className="h-12 w-12 text-warning" />
          <p className="text-center text-sm text-text-inverse/80">
            {t("chat:filePreview.urlError", {
              defaultValue:
                "Failed to load preview. The link may have expired.",
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
    }

    if (!secureUrl || !current) {
      return null;
    }

    switch (previewType) {
      // ── Image preview ──
      case "image":
        return (
          <div
            className={clsx(
              "relative max-h-full max-w-full overflow-hidden",
              scale > 1 ? "cursor-grab" : "cursor-zoom-in",
              isDragging && "cursor-grabbing",
            )}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleResetZoom}
            onClick={(e) => e.stopPropagation()}
            style={swipeStyle}
          >
            {!imgLoaded && !imgError && (
              <div className="flex h-[50vh] w-[50vw] max-w-[600px] items-center justify-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-text-inverse/40 border-t-text-inverse" />
              </div>
            )}

            {imgError ? (
              <div className="flex flex-col items-center gap-3 p-8">
                <ExclamationTriangleIcon className="h-12 w-12 text-warning" />
                <p className="text-sm text-text-inverse/70">
                  {t("chat:image.failedToLoad")}
                </p>
                <button
                  type="button"
                  onClick={() => void onRefreshUrl()}
                  className="flex items-center gap-2 rounded-lg bg-surface/20 px-3 py-1.5 text-sm text-text-inverse hover:bg-surface/30"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  {t("chat:filePreview.retry", { defaultValue: "Retry" })}
                </button>
              </div>
            ) : (
              <img
                ref={imageRef}
                src={secureUrl}
                alt={fileName || t("chat:image.previewAlt")}
                className={clsx(
                  "max-h-[90vh] max-w-[90vw] select-none object-contain transition-transform duration-200",
                  !imgLoaded && "invisible",
                )}
                style={{
                  transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                }}
                onLoad={() => setImgLoaded(true)}
                onError={handleImageError}
                draggable={false}
              />
            )}
          </div>
        );

      // ── Video preview ──
      case "video":
        return (
          <div
            className="flex max-h-[85vh] max-w-[90vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            style={swipeStyle}
          >
            <video
              ref={videoRef}
              src={secureUrl}
              controls
              autoPlay
              className="max-h-[85vh] max-w-[90vw] rounded-lg"
              controlsList="nodownload"
              playsInline
            >
              <track kind="captions" />
              {t("chat:filePreview.videoNotSupported", {
                defaultValue: "Your browser does not support video playback.",
              })}
            </video>
          </div>
        );

      // ── PDF preview ──
      case "pdf":
        return (
          <div
            className="flex h-[85vh] w-[90vw] max-w-4xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`${secureUrl}#toolbar=0`}
              className="h-full w-full rounded-lg border-0 bg-white"
              title={fileName || "PDF Preview"}
              sandbox="allow-same-origin allow-scripts"
            />
            <p className="mt-2 text-xs text-text-inverse/50">
              {t("chat:filePreview.pdfFallback", {
                defaultValue:
                  "Can't see the PDF? Click the download button above.",
              })}
            </p>
          </div>
        );

      // ── Unsupported ──
      default:
        return (
          <div
            className="flex flex-col items-center gap-4 rounded-xl bg-surface/10 p-8 text-center backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface/20">
              <FileTypeIcon type={iconType} className="h-8 w-8" />
            </div>
            <div>
              <p className="mb-1 text-lg font-medium text-text-inverse">
                {fileName || t("chat:file.unknown")}
              </p>
              <p className="text-sm text-text-inverse/60">
                {fileSize}
                {extension ? ` · ${extension}` : ""}
              </p>
            </div>
            <p className="text-sm text-text-inverse/50">
              {t("chat:filePreview.noPreview", {
                defaultValue: "Preview is not available for this file type.",
              })}
            </p>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {t("chat:file.download")}
            </button>
          </div>
        );
    }
  };

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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-text-primary/95 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Top toolbar ── */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        {/* File info */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-text-inverse/10">
            <FileTypeIcon type={iconType} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-inverse">
              {fileName || t("chat:file.unknown")}
            </p>
            <p className="text-xs text-text-inverse/50">
              {fileSize}
              {totalItems > 1 && ` · ${currentIndex + 1} / ${totalItems}`}
            </p>
          </div>
        </div>

        {/* Toolbar buttons */}
        <div className="flex items-center gap-1">
          {/* Zoom controls (image only) */}
          {previewType === "image" && imgLoaded && (
            <>
              <IconButton
                icon={<MagnifyingGlassMinusIcon className="h-5 w-5" />}
                aria-label={t("chat:filePreview.zoomOut", {
                  defaultValue: "Zoom out",
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomOut();
                }}
                variant="ghost"
                className="text-text-inverse hover:bg-text-inverse/10"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
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
                onClick={(e) => {
                  e.stopPropagation();
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetZoom();
                }}
                variant="ghost"
                className="text-text-inverse hover:bg-text-inverse/10"
              />

              <div className="mx-1 h-6 w-px bg-text-inverse/20" />
            </>
          )}

          {/* Download */}
          <IconButton
            icon={<ArrowDownTrayIcon className="h-5 w-5" />}
            aria-label={t("chat:file.download")}
            onClick={(e) => {
              e.stopPropagation();
              void handleDownload();
            }}
            variant="ghost"
            className="text-text-inverse hover:bg-text-inverse/10"
            disabled={!secureUrl}
          />

          {/* Close */}
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

      {/* ── Navigation arrows ── */}
      {totalItems > 1 && (
        <>
          {hasPrev && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
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
          {hasNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
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
        </>
      )}

      {/* ── Main content ── */}
      <div className="relative z-[1] flex items-center justify-center">
        {renderContent()}
      </div>

      {/* ── Bottom bar — keyboard hints (desktop only) ── */}
      {previewType === "image" && imgLoaded && (
        <div className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 text-xs text-text-inverse/40 sm:block">
          {t("chat:filePreview.instructions", {
            defaultValue:
              "Scroll to zoom · Double-click to reset · Arrow keys to navigate",
          })}
        </div>
      )}
    </div>
  );
};

export const FilePreviewModal = React.memo(FilePreviewModalComponent);

export default FilePreviewModal;
