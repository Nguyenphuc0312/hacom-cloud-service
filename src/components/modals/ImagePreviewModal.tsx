import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from "@heroicons/react/24/outline";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt?: string;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type ZoomState = { scale: number; x: number; y: number };
const DEFAULT_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

// Shared viewer button style — white icon on semi-transparent dark pill
// Gives clear contrast against BOTH dark overlay AND bright images
const VIEWER_BTN =
  "flex items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:bg-white/35";

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset zoom whenever the image URL changes or viewer opens fresh
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(DEFAULT_ZOOM);
  }, [imageUrl, isOpen]);

  // Lock body scroll while viewer is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Keyboard shortcuts — attached to document so no focus required
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [isOpen, onClose]);

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
    try {
      const response = await fetch(imageUrl);
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
      window.open(imageUrl, "_blank");
    }
  }, [imageUrl]);

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

  if (!isOpen || typeof document === "undefined") return null;

  const resolvedAlt = alt || t("profile:imagePreview.defaultAlt", { defaultValue: "Ảnh" });
  const { scale, x, y } = zoom;

  const content = (
    <div
      className="fixed inset-0 flex flex-col"
      // Hard-coded dark color so it's theme-independent — never light in any mode
      style={{ zIndex: 9999, backgroundColor: "rgba(0, 0, 0, 0.92)" }}
      onClick={onClose}
    >
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div
        className="flex h-14 shrink-0 items-center justify-between gap-3 px-4"
        // Slightly darker stripe so toolbar visually separates from image area
        style={{ backgroundColor: "rgba(0, 0, 0, 0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* File name */}
        <span className="min-w-0 truncate text-sm font-medium text-white/70" title={resolvedAlt}>
          {resolvedAlt}
        </span>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Zoom out */}
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label={t("profile:imagePreview.zoomOut", { defaultValue: "Thu nhỏ" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <MagnifyingGlassMinusIcon className="h-4 w-4" />
          </button>

          {/* Zoom level — click to reset */}
          <button
            type="button"
            onClick={handleResetZoom}
            className="min-w-[52px] rounded-full bg-white/15 px-2 py-1 text-xs font-semibold tabular-nums text-white hover:bg-white/25"
          >
            {Math.round(scale * 100)}%
          </button>

          {/* Zoom in */}
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label={t("profile:imagePreview.zoomIn", { defaultValue: "Phóng to" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <MagnifyingGlassPlusIcon className="h-4 w-4" />
          </button>

          {/* Divider */}
          <div className="mx-1 h-5 w-px bg-white/20" />

          {/* Download */}
          <button
            type="button"
            onClick={() => void handleDownload()}
            aria-label={t("profile:imagePreview.download", { defaultValue: "Tải về" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>

          {/* Close — larger, higher contrast */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile:imagePreview.close", { defaultValue: "Đóng" })}
            className={clsx(VIEWER_BTN, "h-9 w-9 ml-1")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Image area ──────────────────────────────────────────── */}
      <div
        className={clsx(
          "flex min-h-0 flex-1 items-center justify-center overflow-hidden",
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
          src={imageUrl}
          alt={resolvedAlt}
          className="max-h-[calc(100dvh-96px)] max-w-[calc(100vw-32px)] select-none object-contain"
          style={{
            transform: `scale(${scale}) translate(${x / scale}px, ${y / scale}px)`,
            transition: isDragging ? "none" : "transform 0.12s ease",
          }}
          draggable={false}
        />
      </div>

      {/* ── Hint bar ────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-center">
        <span className="text-xs text-white/30">
          {t("profile:imagePreview.instructions", {
            defaultValue: "ESC / click ngoài để đóng · Scroll để zoom · Nhấn 0 để reset",
          })}
        </span>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ImagePreviewModal;
