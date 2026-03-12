import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../../types";
import { useAttachmentDownloadUrl } from "../../hooks";

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [didRefreshOnError, setDidRefreshOnError] = useState(false);
  const { url: resolvedUrl, isLoading, resolveUrl } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: true },
  );
  const mediaWidth = attachment.width ? Math.min(attachment.width, 300) : 240;
  const aspectRatio =
    attachment.width && attachment.height
      ? `${attachment.width} / ${attachment.height}`
      : "4 / 3";

  const hasDisplayUrl = Boolean(resolvedUrl);

  useEffect(() => {
    setIsLoaded(false);
    setIsError(false);
    setDidRefreshOnError(false);
  }, [resolvedUrl]);

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
    if (!didRefreshOnError) {
      setDidRefreshOnError(true);
      void resolveUrl(true);
      return;
    }
    setIsError(true);
  };

  return (
    <>
      <div className={clsx("relative", className)}>
        <div
          className="relative overflow-hidden rounded-lg bg-surface-overlay"
          style={{ width: mediaWidth, maxWidth: "100%", aspectRatio }}
        >
          {(!isLoaded || isLoading || !hasDisplayUrl) && !isError && (
            <div className="absolute inset-0 animate-pulse bg-surface-overlay" />
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
              onLoad={() => setIsLoaded(true)}
              onError={handleImageError}
            />
          )}
        </div>

        {caption && isLoaded && (
          <p className={clsx("mt-2 text-sm", isOwn ? "text-text-inverse/90" : "text-text-secondary")}>
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

