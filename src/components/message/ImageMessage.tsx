import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";
import { useInViewport } from "../../hooks/useInViewport";
import { Skeleton } from "../ui";

interface ImageMessageProps {
  conversationId: string;
  attachment: Attachment;
  caption?: string;
  isOwn: boolean;
  onClick?: (imageUrl: string) => void;
  className?: string;
}

export const ImageMessage: React.FC<ImageMessageProps> = ({
  conversationId,
  attachment,
  caption,
  isOwn,
  onClick,
  className,
}) => {
  const { t } = useTranslation();
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const refreshedSourceRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useInViewport(containerRef, { rootMargin: "320px 0px" });
  const {
    url: resolvedUrl,
    isLoading,
    resolveUrl,
  } = useAttachmentDownloadUrl(conversationId, attachment, {
    autoResolve: false,
  });
  const mediaWidth = attachment.width ? Math.min(attachment.width, 300) : 240;
  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  const activeSource = resolvedUrl || null;
  const hasDisplayUrl = Boolean(activeSource);
  const hasCaption = Boolean(caption);
  const isLoaded = Boolean(activeSource && loadedSource === activeSource);
  const isError = Boolean(activeSource && failedSource === activeSource);

  useEffect(() => {
    if (!isVisible || activeSource || isError) {
      return;
    }

    void resolveUrl();
  }, [activeSource, isError, isVisible, resolveUrl]);

  const handleImageClick = async () => {
    const imageUrl = resolvedUrl || (await resolveUrl());
    if (!imageUrl) return;

    if (onClick) {
      onClick(imageUrl);
    } else {
      setShowFullScreen(true);
    }
  };

  const handleClose = () => {
    setShowFullScreen(false);
  };

  const handleImageError = () => {
    if (!activeSource) {
      return;
    }

    if (refreshedSourceRef.current !== activeSource) {
      refreshedSourceRef.current = activeSource;
      void resolveUrl(true);
      return;
    }

    setFailedSource(activeSource);
  };

  return (
    <>
      <div className={clsx("relative", className)}>
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-lg bg-surface-overlay"
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio }}
        >
          {(!isLoaded || isLoading || !hasDisplayUrl) && !isError && (
            <Skeleton className="absolute inset-0" rounded="lg" />
          )}

          {isError && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-sm text-text-muted">
              {t("chat:image.failedToLoad")}
            </div>
          )}

          {hasDisplayUrl && (
            <img
              className={clsx(
                "absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity duration-150",
                isLoaded ? "opacity-100" : "opacity-0",
                "hover:opacity-95",
              )}
              src={resolvedUrl}
              alt={caption || attachment.fileName || t("chat:image.previewAlt")}
              onClick={() => void handleImageClick()}
              onLoad={() => {
                if (!activeSource) return;
                setLoadedSource(activeSource);
                setFailedSource((previous) =>
                  previous === activeSource ? null : previous,
                );
              }}
              onError={handleImageError}
            />
          )}
        </div>

        {hasCaption && (
          <p
            className={clsx(
              "mt-2 min-h-5 text-sm transition-opacity duration-150",
              isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.9]" : "text-text-secondary",
              isLoaded ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!isLoaded}
          >
            {caption}
          </p>
        )}
      </div>

      {showFullScreen && resolvedUrl && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-surface-overlay/95 backdrop-blur-md animate-fade-in"
          onClick={handleClose}
        >
          <button
            className="absolute right-4 top-4 rounded-full border border-border bg-surface/80 p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            onClick={handleClose}
            aria-label={t("chat:image.close")}
          >
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <img
            src={resolvedUrl}
            alt={attachment.fileName || t("chat:image.previewAlt")}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-elev3"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default ImageMessage;
