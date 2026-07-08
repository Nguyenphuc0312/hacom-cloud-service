import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { SafeImage } from "../common/SafeImage";

export interface GalleryImage {
  url: string;
  alt?: string;
  senderName?: string;
  senderAvatar?: string;
  sentAt?: Date | string;
  /** Optional group key — images sharing the same key are shown as one thumbnail cell with +N badge */
  groupKey?: string;
}

export interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single-image mode (backward-compatible) */
  imageUrl?: string;
  alt?: string;
  /** Gallery mode: pass all images + which one to open */
  images?: GalleryImage[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Sender info for single-image mode */
  senderName?: string;
  senderAvatar?: string;
  sentAt?: Date | string;
  /** Open the full "Kho lưu trữ" panel — shown as the last filmstrip cell when the gallery exceeds the strip cap */
  onViewAll?: () => void;
}

/** How many recent thumbnails the filmstrip shows before deferring to "Kho lưu trữ" */
const FILMSTRIP_MAX = 30;

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/** Resizable card bounds (px). Card stays centered; corner drag grows/shrinks it symmetrically. */
const CARD_MIN = { w: 480, h: 360 };
type CardSize = { w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
/** Default card = 92% of viewport (matches the old max-w/max-h behaviour). */
const defaultCardSize = (): CardSize => ({
  w: Math.round(window.innerWidth * 0.92),
  h: Math.round(window.innerHeight * 0.92),
});

type ZoomState = { scale: number; x: number; y: number; rotation: number };
const DEFAULT_ZOOM: ZoomState = { scale: 0.7, x: 0, y: 0, rotation: 0 };

// Floating control in the bottom toolbar — Zalo-style pill button on the dark backdrop.
const VIEWER_BTN =
  "flex items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white active:bg-white/25";

function formatSentAt(sentAt: Date | string | undefined): string {
  if (!sentAt) return "";
  const d = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (diffDays === 0) return `${timeStr} Hôm nay`;
  if (diffDays === 1) return `${timeStr} Hôm qua`;
  return `${timeStr} ${d.toLocaleDateString("vi-VN")}`;
}

/** Zalo-style day label for the vertical filmstrip's section headers. */
function getDayLabel(sentAt: Date | string | undefined): string {
  if (!sentAt) return "Ảnh";
  const d = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  if (isNaN(d.getTime())) return "Ảnh";
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  return d.toLocaleDateString("vi-VN");
}

/** Group filmstrip cells by day label, preserving chronological order. */
function groupByDay(
  images: GalleryImage[],
  startIndex: number,
): { label: string; indices: number[] }[] {
  const out: { label: string; indices: number[] }[] = [];
  for (let i = startIndex; i < images.length; i += 1) {
    const label = getDayLabel(images[i].sentAt);
    const last = out[out.length - 1];
    if (last && last.label === label) last.indices.push(i);
    else out.push({ label, indices: [i] });
  }
  return out;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt,
  images,
  initialIndex = 0,
  onIndexChange,
  senderName,
  senderAvatar,
  sentAt,
  onViewAll,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);
  const [cardSize, setCardSize] = useState<CardSize | null>(null);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Normalise to gallery array regardless of which props were used
  const gallery = useMemo<GalleryImage[]>(() => {
    if (images && images.length > 0) return images;
    if (imageUrl) return [{ url: imageUrl, alt, senderName, senderAvatar, sentAt }];
    return [];
  }, [images, imageUrl, alt, senderName, senderAvatar, sentAt]);

  const current = gallery[currentIndex] ?? gallery[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < gallery.length - 1;
  const showNav = gallery.length > 1;
  const showThumbnailPanel = gallery.length > 1;
  // Filmstrip shows only the most-recent FILMSTRIP_MAX images (tail of the
  // chronological gallery). Older images live in "Kho lưu trữ" (onViewAll).
  const filmstripStart = Math.max(0, gallery.length - FILMSTRIP_MAX);
  const hasMoreThanStrip = filmstripStart > 0;
  const dayGroups = useMemo(
    () => groupByDay(gallery, filmstripStart),
    [gallery, filmstripStart],
  );

  // Mount animation
  useEffect(() => {
    if (isOpen) {
      setCardSize((s) => s ?? defaultCardSize());
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Keep the card within the viewport when the window shrinks
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () =>
      setCardSize((s) =>
        s
          ? {
              w: Math.min(s.w, window.innerWidth),
              h: Math.min(s.h, window.innerHeight),
            }
          : s,
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen]);

  // Sync index when caller changes initialIndex or reopens
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

  useEffect(() => {
    if (!isOpen) return;
    onIndexChange?.(currentIndex);
  }, [currentIndex, isOpen, onIndexChange]);

  // Reset zoom whenever the displayed image changes
  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
  }, [currentIndex, isOpen]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Scroll active thumbnail into view
  useEffect(() => {
    const el = thumbnailRefs.current[currentIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

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
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
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
  const handleRotate = useCallback(
    () => setZoom((z) => ({ ...z, rotation: (z.rotation + 90) % 360 })),
    [],
  );

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

  // Wheel-to-zoom via a NATIVE non-passive listener. React's onWheel is passive,
  // so its preventDefault() can't stop the browser's Ctrl+wheel page zoom — which
  // was blowing up the whole app behind the (now no longer full-bleed) overlay.
  useEffect(() => {
    const stage = stageRef.current;
    if (!isOpen || !stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom((z) => ({
        ...z,
        scale: Math.min(Math.max(+(z.scale + delta).toFixed(2), MIN_SCALE), MAX_SCALE),
      }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [isOpen]);

  // Corner resize (Zalo-style). Card is centered, so its size = 2× the distance
  // from viewport center to the pointer. One math for all four corners.
  const startCornerResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const onMove = (ev: MouseEvent) => {
      setCardSize({
        w: Math.round(
          Math.min(window.innerWidth, Math.max(CARD_MIN.w, Math.abs(ev.clientX - cx) * 2)),
        ),
        h: Math.round(
          Math.min(window.innerHeight, Math.max(CARD_MIN.h, Math.abs(ev.clientY - cy) * 2)),
        ),
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Clear after the backdrop's click event has fired, so it isn't treated as an outside-click.
      setTimeout(() => { isResizingRef.current = false; }, 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
  const { scale, x, y, rotation } = zoom;

  const resolvedSenderName = current.senderName ?? "";
  const resolvedSenderAvatar = current.senderAvatar;
  const resolvedSentAt = formatSentAt(current.sentAt);

  const content = (
    /* Dimmed backdrop — click outside the card closes */
    <div
      className={clsx(
        "fixed inset-0 flex items-center justify-center p-4 transition-opacity duration-150 ease-out sm:p-8",
        mounted ? "opacity-100" : "opacity-0",
        "bg-black/80",
      )}
      style={{ zIndex: "var(--hc-z-overlay)" }}
      onClick={() => { if (!isResizingRef.current) onClose(); }}
    >
      {/* ── Card frame (resizable from corners, rounded, bordered) ── */}
      <div
        className={clsx(
          "relative flex max-h-full max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl transition-transform duration-150 ease-out",
          mounted ? "scale-100" : "scale-95",
        )}
        style={cardSize ? { width: cardSize.w, height: cardSize.h } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Corner resize handles — drag to grow/shrink (card stays centered) */}
        {(["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
          <div
            key={corner}
            onMouseDown={startCornerResize}
            className={clsx(
              "absolute z-40 h-6 w-6",
              corner === "nw" && "left-0 top-0 cursor-nwse-resize",
              corner === "ne" && "right-0 top-0 cursor-nesw-resize",
              corner === "sw" && "bottom-0 left-0 cursor-nesw-resize",
              corner === "se" && "bottom-0 right-0 cursor-nwse-resize",
            )}
          />
        ))}
      {/* ── Title bar (solid dark, centered filename) — Zalo-style ─ */}
      <div className="relative z-30 flex h-11 shrink-0 items-center justify-between gap-3 bg-[#2a2a2a] px-4">
        {/* Left: counter */}
        <span className="w-16 shrink-0 text-xs tabular-nums text-white/50">
          {showNav ? `${currentIndex + 1} / ${gallery.length}` : ""}
        </span>
        {/* Center: filename */}
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-white/90" title={resolvedAlt}>
          {resolvedAlt}
        </span>
        {/* Right: close */}
        <div className="flex w-16 shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("profile:imagePreview.close", { defaultValue: "Đóng" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Body: image stage + vertical day-grouped filmstrip ──── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── Image stage ─────────────────────────────────────────── */}
      <div
        ref={stageRef}
        className={clsx(
          "flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4",
          scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleResetZoom}
      >
        {current.url ? (
          <SafeImage
            key={current.url}
            src={current.url}
            alt={resolvedAlt}
            objectFit="contain"
            className={clsx(
              "h-full w-full select-none",
              !isDragging && "transition-[transform,opacity,scale] duration-[180ms] ease-out",
              mounted ? "opacity-100 scale-100" : "opacity-0 scale-95",
            )}
            style={{
              transform: `scale(${scale}) translate(${x / scale}px, ${y / scale}px) rotate(${rotation}deg)`,
            }}
            draggable={false}
            fallback={
              <div className="flex flex-col items-center gap-3 text-white/40">
                <svg className="h-12 w-12 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                <span className="text-sm">Không tải được ảnh</span>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <svg className="h-12 w-12 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            <span className="text-sm">Đang tải ảnh...</span>
          </div>
        )}
      </div>

      {/* ── Prev/next chevrons — vertical stack near the filmstrip ─ */}
      {showNav && (
        <div
          className={clsx(
            "absolute top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2",
            showThumbnailPanel ? "right-[132px]" : "right-3",
          )}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            disabled={!hasPrev}
            aria-label="Ảnh trước"
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-all hover:bg-black/70",
              !hasPrev && "pointer-events-none opacity-30",
            )}
          >
            <ChevronUpIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            disabled={!hasNext}
            aria-label="Ảnh tiếp theo"
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-all hover:bg-black/70",
              !hasNext && "pointer-events-none opacity-30",
            )}
          >
            <ChevronDownIcon className="h-6 w-6" />
          </button>
        </div>
      )}

        {/* ── Vertical filmstrip (day-grouped, recent 30) ─────────── */}
        {showThumbnailPanel && (
          <div className="flex w-[120px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-white/10 bg-[#161616] px-2 pb-3 pt-3">
            {hasMoreThanStrip && onViewAll && (
              <button
                type="button"
                onClick={onViewAll}
                className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-white/10 text-xs font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                +{filmstripStart} {t("profile:imagePreview.viewAll", { defaultValue: "Xem tất cả" })}
              </button>
            )}
            {dayGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1.5">
                <p className="px-0.5 text-[11px] font-medium text-white/50">{group.label}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.indices.map((idx) => {
                    const img = gallery[idx];
                    const isActive = idx === currentIndex;
                    return (
                      <button
                        key={idx}
                        ref={(el) => { thumbnailRefs.current[idx] = el; }}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={img.alt ?? `Ảnh ${idx + 1}`}
                        className={clsx(
                          "relative aspect-square overflow-hidden rounded-md transition-all",
                          isActive
                            ? "ring-2 ring-white"
                            : "opacity-60 hover:opacity-100",
                        )}
                      >
                        <SafeImage
                          src={img.url}
                          alt={img.alt ?? `Ảnh ${idx + 1}`}
                          className="h-full w-full object-cover"
                          draggable={false}
                          fallback={
                            <div className="flex h-full w-full items-center justify-center bg-white/10 text-[9px] text-white/40">
                              Ảnh
                            </div>
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom toolbar (solid): sender left · zoom center ────── */}
      <div
        className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 bg-[#2a2a2a] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: avatar + sender + time */}
        <div className="flex w-1/3 min-w-0 items-center gap-2.5">
          {(resolvedSenderName || resolvedSenderAvatar) && (
            <Avatar src={resolvedSenderAvatar} alt={resolvedSenderName} size="sm" />
          )}
          <div className="min-w-0">
            {resolvedSenderName && (
              <p className="truncate text-sm font-medium leading-tight text-white/90">
                {resolvedSenderName}
              </p>
            )}
            {resolvedSentAt && (
              <p className="truncate text-xs leading-tight text-white/50">{resolvedSentAt}</p>
            )}
          </div>
        </div>

        {/* Center: zoom / rotate / download */}
        <div className="flex items-center gap-1">
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
            className="min-w-[52px] rounded-full px-2 py-1 text-xs font-semibold tabular-nums text-white/90 hover:bg-white/15 hover:text-white"
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
            onClick={handleRotate}
            aria-label={t("profile:imagePreview.rotate", { defaultValue: "Xoay" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            aria-label={t("profile:imagePreview.download", { defaultValue: "Tải về" })}
            className={clsx(VIEWER_BTN, "h-8 w-8")}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Right: spacer to keep the center cluster centered */}
        <div className="w-1/3" />
      </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ImagePreviewModal;
