/**
 * @fileoverview StickerMessage - Sticker display component.
 *
 * Features:
 * - 120x120px display size (100x100 on mobile)
 * - No bubble background - displays directly on chat background
 * - Click to show sticker info (optional)
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { SafeImage } from "../common/SafeImage";

interface StickerMessageProps {
  conversationId: string;
  attachment: Attachment;
  className?: string;
}

export const StickerMessage: React.FC<StickerMessageProps> = ({
  conversationId,
  attachment,
  className,
}) => {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useInViewport(containerRef, { rootMargin: "200px 0px" });

  const { url: stickerUrl, resolveUrl, isLoading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: false, intent: "preview" },
  );

  // Resolve sticker URL when visible
  useEffect(() => {
    if (isVisible && !stickerUrl && !isLoading) {
      void resolveUrl();
    }
  }, [isVisible, stickerUrl, isLoading, resolveUrl]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(false);
    setError(true);
  }, []);

  // Get sticker name from metadata or filename
  const stickerMeta = attachment as unknown as Record<string, unknown>;
  const stickerName = (stickerMeta.name as string) || attachment.fileName || t("chat:sticker", { defaultValue: "Sticker" });

  return (
    <div
      ref={containerRef}
      className={clsx("sticker-message", className)}
      role="img"
      aria-label={stickerName}
    >
      {/* Loading skeleton */}
      {(!loaded || isLoading) && !error && (
        <div
          className="skeleton flex h-[120px] w-[120px] items-center justify-center rounded-lg"
          style={{ width: 120, height: 120 }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1976D2] border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="flex h-[120px] w-[120px] items-center justify-center rounded-lg bg-surface-overlay"
          style={{ width: 120, height: 120 }}
        >
          <span className="text-4xl">🖼️</span>
        </div>
      )}

      {/* Sticker image */}
      {stickerUrl && !error && (
        <div
          className="relative overflow-hidden"
          style={{ width: 120, height: 120 }}
        >
          <SafeImage
            src={stickerUrl}
            alt={stickerName}
            className={clsx(
              "h-full w-full object-contain transition-opacity",
              loaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={handleLoad}
            onError={handleError}
            fallback={null}
          />

          {/* HD badge if applicable */}
          {(stickerMeta.isHd as boolean) && (
            <div className="absolute left-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-semibold text-white">
              HD
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StickerMessage;
