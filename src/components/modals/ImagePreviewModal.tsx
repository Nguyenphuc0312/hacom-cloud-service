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
  /** Sender info for single-image mode */
  senderName?: string;
  senderAvatar?: string;
  sentAt?: Date | string;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type ZoomState = { scale: number; x: number; y: number };
const DEFAULT_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

const VIEWER_BTN =
  "flex items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:bg-white/35";

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

function getDayLabel(sentAt: Date | string | undefined): string {
  if (!sentAt) return "Ảnh";
  const d = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  if (isNaN(d.getTime())) return "Ảnh";
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays === 0 ? "Hôm nay" : diffDays === 1 ? "Hôm qua" : d.toLocaleDateString("vi-VN");
}

/** Each MessageGroup = 1 thumbnail cell (the first image + "+N" badge if > 1) */
interface MessageGroup {
  indices: number[];   // all image indices in this message
  dayLabel: string;
}

function groupByMessage(images: GalleryImage[]): { dayLabel: string; groups: MessageGroup[] }[] {
  // Step 1: cluster consecutive images that share the same groupKey (or fall back to sender+minute)
  const msgGroups: MessageGroup[] = [];
  images.forEach((img, idx) => {
    const key = img.groupKey
      ?? `${img.senderName ?? ""}__${img.sentAt ? new Date(img.sentAt).toISOString().slice(0, 16) : idx}`;
    const last = msgGroups[msgGroups.length - 1];
    if (last && images[last.indices[0]].groupKey
          ? images[last.indices[0]].groupKey === img.groupKey
          : last?.indices.length > 0 &&
            `${images[last.indices[0]].senderName ?? ""}__${images[last.indices[0]].sentAt ? new Date(images[last.indices[0]].sentAt!).toISOString().slice(0, 16) : last.indices[0]}` === key
    ) {
      last.indices.push(idx);
    } else {
      msgGroups.push({ indices: [idx], dayLabel: getDayLabel(img.sentAt) });
    }
  });

  // Step 2: bucket by day label (preserve insertion order)
  const dayMap: Map<string, MessageGroup[]> = new Map();
  msgGroups.forEach((mg) => {
    if (!dayMap.has(mg.dayLabel)) dayMap.set(mg.dayLabel, []);
    dayMap.get(mg.dayLabel)!.push(mg);
  });

  return Array.from(dayMap.entries()).map(([dayLabel, groups]) => ({ dayLabel, groups }));
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt,
  images,
  initialIndex = 0,
  senderName,
  senderAvatar,
  sentAt,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
  const dayMessageGroups = useMemo(() => groupByMessage(gallery), [gallery]);

  // Mount animation
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Sync index when caller changes initialIndex or reopens
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

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

  const resolvedSenderName = current.senderName ?? "";
  const resolvedSenderAvatar = current.senderAvatar;
  const resolvedSentAt = formatSentAt(current.sentAt);

  const content = (
    /* Backdrop — click outside to close */
    <div
      className={clsx(
        "fixed inset-0 flex items-center justify-center p-6 transition-[background-color] duration-150 ease-out",
        mounted ? "bg-black/75" : "bg-transparent",
      )}
      style={{ zIndex: "var(--hc-z-overlay)" }}
      onClick={onClose}
    >
      {/* ── Modal container (compact, centered) ─────────────────── */}
      <div
        className={clsx(
          "relative flex max-h-[90dvh] max-w-[90vw] flex-col overflow-hidden rounded-2xl bg-[#1a1a1a] shadow-2xl transition-[transform,opacity] duration-[180ms] ease-out",
          showThumbnailPanel ? "w-[820px]" : "w-auto",
          mounted ? "opacity-100 scale-100" : "opacity-0 scale-[0.93]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Top bar ───────────────────────────────────────────── */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
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
              className={clsx(VIEWER_BTN, "h-7 w-7")}
            >
              <MagnifyingGlassMinusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="min-w-[48px] rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-white hover:bg-white/25"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label={t("profile:imagePreview.zoomIn", { defaultValue: "Phóng to" })}
              className={clsx(VIEWER_BTN, "h-7 w-7")}
            >
              <MagnifyingGlassPlusIcon className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-white/20" />
            <button
              type="button"
              onClick={() => void handleDownload()}
              aria-label={t("profile:imagePreview.download", { defaultValue: "Tải về" })}
              className={clsx(VIEWER_BTN, "h-7 w-7")}
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("profile:imagePreview.close", { defaultValue: "Đóng" })}
              className={clsx(VIEWER_BTN, "ml-1 h-8 w-8")}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Body: image area + thumbnail panel ──────────────────── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Image area */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-black/40">
            {/* Vertical nav buttons */}
            {showNav && (
              <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  disabled={!hasPrev}
                  aria-label="Ảnh trước"
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                    hasPrev
                      ? "bg-black/50 text-white hover:bg-black/70"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <ChevronUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  disabled={!hasNext}
                  aria-label="Ảnh tiếp theo"
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                    hasNext
                      ? "bg-black/50 text-white hover:bg-black/70"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Image — drag/zoom area */}
            <div
              className={clsx(
                "flex h-full w-full items-center justify-center p-4",
                scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
              )}
              onWheel={handleWheel}
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
                  className={clsx(
                    "max-h-[calc(90dvh-96px)] max-w-full select-none object-contain",
                    !isDragging && "transition-[transform,opacity,scale] duration-[180ms] ease-out",
                    mounted ? "opacity-100 scale-100" : "opacity-0 scale-95",
                  )}
                  style={{
                    transform: `scale(${scale}) translate(${x / scale}px, ${y / scale}px)`,
                  }}
                  draggable={false}
                  fallback={
                    <div className="flex flex-col items-center gap-3 text-white/40">
                      <svg className="h-12 w-12 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      <span className="text-sm">Khong tai duoc anh</span>
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
          </div>

          {/* ── Thumbnail panel (1 col, message-grouped) ─────────── */}
          {showThumbnailPanel && (
            <div className="flex w-[160px] shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#111]">
              {dayMessageGroups.map(({ dayLabel, groups }) => (
                <div key={dayLabel}>
                  {/* Day header */}
                  <p className="sticky top-0 z-10 bg-[#111]/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                    {dayLabel}
                  </p>

                  {/* Message group cells */}
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    {groups.map((mg) => {
                      const firstIdx = mg.indices[0];
                      const firstImg = gallery[firstIdx];
                      const extra = mg.indices.length - 1;
                      const isActive = mg.indices.includes(currentIndex);

                      return (
                        <button
                          key={firstIdx}
                          ref={(el) => { thumbnailRefs.current[firstIdx] = el; }}
                          type="button"
                          onClick={() => setCurrentIndex(firstIdx)}
                          className={clsx(
                            "relative aspect-[4/3] w-full overflow-hidden rounded-lg transition-all",
                            isActive
                              ? "ring-2 ring-white ring-offset-1 ring-offset-black/50"
                              : "opacity-70 hover:opacity-100",
                          )}

                        >
                          <SafeImage
                            src={firstImg.url}
                            alt={firstImg.alt ?? `Ảnh ${firstIdx + 1}`}
                            className="h-full w-full object-cover"
                            draggable={false}
                            fallback={
                              <div className="flex h-full w-full items-center justify-center bg-white/10 text-white/40">
                                <span className="text-xs">Anh</span>
                              </div>
                            }
                          />

                          {/* +N badge overlay */}
                          {extra > 0 && (
                            <div className="absolute inset-0 flex items-end justify-end bg-black/30 p-1.5">
                              <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
                                +{extra}
                              </span>
                            </div>
                          )}

                          {/* Sender name overlay (bottom-left) */}
                          {firstImg.senderName && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
                              <span className="block truncate text-[10px] font-medium text-white/90">
                                @{firstImg.senderName.split(" ").pop()}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Bottom bar: sender info + hint ──────────────────────── */}
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4">
          {/* Left: avatar + sender name + time */}
          <div className="flex min-w-0 items-center gap-2">
            {(resolvedSenderName || resolvedSenderAvatar) && (
              <Avatar
                src={resolvedSenderAvatar}
                alt={resolvedSenderName}
                size="sm"
              />
            )}
            <div className="min-w-0">
              {resolvedSenderName && (
                <p className="truncate text-xs font-semibold text-white leading-tight">
                  {resolvedSenderName}
                </p>
              )}
              {resolvedSentAt && (
                <p className="truncate text-[11px] text-white/50 leading-tight">
                  {resolvedSentAt}
                </p>
              )}
            </div>
          </div>

          {/* Right: hint text */}
          <span className="shrink-0 text-[11px] text-white/30">
            {showNav
              ? t("profile:imagePreview.instructionsGallery", {
                  defaultValue: "↑ ↓ chuyển ảnh · ESC đóng · Scroll zoom",
                })
              : t("profile:imagePreview.instructions", {
                  defaultValue: "ESC / click ngoài đóng · Scroll zoom · 0 reset",
                })}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ImagePreviewModal;
