import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  fileName?: string;
}

/**
 * Minimal full-screen video player for the shared-resources ("Kho lưu trữ")
 * panel. The media grid only stores image thumbnails, so a clicked video must
 * be played from its resolved (presigned) source — not shown in the image
 * lightbox, which can only render still images.
 */
export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  onClose,
  url,
  fileName,
}) => {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const timer = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(timer);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isOpen]);

  if (!isOpen || !url || typeof document === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/75 p-6"
      style={{ zIndex: "var(--hc-z-overlay)" }}
      onClick={onClose}
    >
      <div
        className={clsx(
          "relative flex max-h-[90dvh] max-w-[90vw] flex-col overflow-hidden rounded-2xl bg-[#1a1a1a] shadow-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={fileName ?? "Video"}
        tabIndex={-1}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
          <span
            className="min-w-0 truncate text-sm font-medium text-white/70"
            title={fileName}
          >
            {fileName ?? "Video"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
          <video
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="max-h-[calc(90dvh-48px)] max-w-full rounded-xl"
          >
            <track kind="captions" />
            Trình duyệt của bạn không hỗ trợ phát video.
          </video>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default VideoPlayerModal;
