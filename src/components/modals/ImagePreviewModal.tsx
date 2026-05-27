import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

interface GalleryImage {
  url: string;
  alt?: string;
}

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single-image mode (backward-compatible) */
  imageUrl?: string;
  alt?: string;
  /** Gallery mode: pass all images + which one to open */
  images?: GalleryImage[];
  initialIndex?: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type ZoomState = { scale: number; x: number; y: number };
const DEFAULT_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

const VIEWER_BTN =
  "flex items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:bg-white/35";

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt,
  images,
  initialIndex = 0,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Normalise to gallery array regardless of which props were used
  const gallery = useMemo<GalleryImage[]>(() => {
    if (images && images.length > 0) return images;
    if (imageUrl) return [{ url: imageUrl, alt }];
    return [];
  }, [images, imageUrl, alt]);

  const current = gallery[currentIndex] ?? gallery[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < gallery.length - 1;
  const showNav = gallery.length > 1;

  // Sync index when caller changes initialIndex or reopens
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

  // Reset zoom whenever the displayed image changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(DEFAULT_ZOOM);
  }, [currentIndex, isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(gallery.length - 1, i + 1));
  }, [gallery.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard: ESC, arrows, zoom +/-/0
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => ({ ...z, scale: Math.min(+(z.scale + 0.25).toFixed(2), MAX_SCALE) }));
      } else if (e.key === "-") {
        setZoom((z) => ({ ...z, scale: Math.max(+(z.scale - 0.25).toFixed(2), MIN_SCALE) }));
      } else if (e.key === "0") {
        setZoom(DEFAULT_ZOOM);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose, goPrev, goNext]);

  const handleZoomIn = useCallback(
    () => setZoom((z) => ({ ...z, scale: Math.min(+(z.scale + 0.25).toFixed(2), MAX_SCALE) })),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => ({ ...z, scale: Math.max(+(z.scale - 0.25).toFixed(2), MIN_SCALE) })),
    [],
  );
  const handleResetZoom = useCallback(() => setZoom(DEFAULT_ZOOM), []);

  const handleDownload = useCallback(async () => {
    if (!current?.url) return;
    try {
      const response = await fetch(current.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image-${Date.now()}.${blob.type.split("/")[1] || "jpg"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      if (current?.url) window.open(current.url, "_blank");
    }
  }, [current]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((z) => ({
      ...z,
      scale: Math.min(Math.max(+(z.scale + delta).toFixed(2), MIN_SCALE), MAX_SCALE),
    }));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom.scale <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y };
    },
    [zoom.scale, zoom.x, zoom.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setZoom((z) => ({
        ...z,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  if (!isOpen || !current || typeof document === "undefined") return null;

  const resolvedAlt = current.alt ?? t("profile:imagePreview.defaultAlt", { defaultValue: "Ảnh" });
  const { scale, x, y } = zoom;

  const content = (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 9999, backgroundColor: "rgba(0, 0, 0, 0.92)" }}
      onClick={onClose}
    >
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div
        className="flex h-14 shrink-0 items-center justify-between gap-3 px-4"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: file name + counter */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-white/70" title={resolvedAlt}>
            {resolvedAlt}
          </span>
          {showNav && (
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums text-white/70">
              {currentIndex + 1} / {gallery.length}
            </span>
          )}
        </div>

        {/* Right: zoom + download + close */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label={t("profile:imagePreview.zoomOut", { defaultValue: "Thu nhỏ" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <MagnifyingGlassMinusIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="min-w-[52px] rounded-full bg-white/15 px-2 py-1 text-xs font-semibold tabular-nums text-white hover:bg-white/25"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label={t("profile:imagePreview.zoomIn", { defaultValue: "Phóng to" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <MagnifyingGlassPlusIcon className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => void handleDownload()}
            aria-label={t("profile:imagePreview.download", { defaultValue: "Tải về" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile:imagePreview.close", { defaultValue: "Đóng" })}
            className={clsx(VIEWER_BTN, "ml-1 h-9 w-9")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Image area with side-nav arrows ─────────────────────── */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {/* Prev arrow */}
        {showNav && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            disabled={!hasPrev}
            aria-label="Ảnh trước"
            className={clsx(
              "absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-all",
              hasPrev
                ? "bg-black/50 text-white hover:bg-black/70"
                : "pointer-events-none opacity-0",
            )}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}

        {/* Image — drag/zoom area */}
        <div
          className={clsx(
            "flex h-full w-full items-center justify-center",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
          )}
          onClick={(e) => e.stopPropagation()}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleResetZoom}
        >
          <img
            key={current.url}
            src={current.url}
            alt={resolvedAlt}
            className="max-h-[calc(100dvh-96px)] max-w-[calc(100vw-112px)] select-none object-contain"
            style={{
              transform: `scale(${scale}) translate(${x / scale}px, ${y / scale}px)`,
              transition: isDragging ? "none" : "transform 0.12s ease",
            }}
            draggable={false}
          />
        </div>

        {/* Next arrow */}
        {showNav && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            disabled={!hasNext}
            aria-label="Ảnh tiếp theo"
            className={clsx(
              "absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-all",
              hasNext
                ? "bg-black/50 text-white hover:bg-black/70"
                : "pointer-events-none opacity-0",
            )}
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ── Hint bar ─────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-center">
        <span className="text-xs text-white/30">
          {showNav
            ? t("profile:imagePreview.instructionsGallery", {
                defaultValue: "← → để chuyển ảnh · ESC để đóng · Scroll để zoom",
              })
            : t("profile:imagePreview.instructions", {
                defaultValue: "ESC / click ngoài để đóng · Scroll để zoom · 0 để reset",
              })}
        </span>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ImagePreviewModal;
