import React, { useState } from "react";
import clsx from "clsx";
import type { Attachment } from "../../types";

interface ImageMessageProps {
  attachment: Attachment;
  caption?: string;
  isOwn: boolean;
  onClick?: (imageUrl: string) => void;
  className?: string;
}

export const ImageMessage: React.FC<ImageMessageProps> = ({
  attachment,
  caption,
  isOwn,
  onClick,
  className,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);

  const handleImageClick = () => {
    if (onClick) {
      onClick(attachment.url);
    } else {
      setShowFullScreen(true);
    }
  };

  const handleClose = () => {
    setShowFullScreen(false);
  };

  return (
    <>
      <div className={clsx("relative", className)}>
        {!isLoaded && !isError && (
          <div
            className="animate-pulse rounded-lg bg-surface-overlay"
            style={{
              width: attachment.width ? Math.min(attachment.width, 300) : 200,
              height: attachment.height
                ? Math.min(attachment.height, 200)
                : 150,
            }}
          />
        )}

        {isError && (
          <div className="flex items-center justify-center rounded-lg bg-surface-overlay p-4 text-sm text-text-muted">
            Failed to load image
          </div>
        )}

        <img
          className={clsx(
            "h-auto max-w-full cursor-pointer rounded object-cover transition-opacity",
            isLoaded ? "opacity-100" : "absolute left-0 top-0 opacity-0",
            "hover:opacity-95",
          )}
          style={{
            maxWidth: "300px",
            maxHeight: 300,
            objectFit: "cover",
          }}
          src={attachment.url}
          alt={caption || attachment.fileName || "image"}
          onClick={handleImageClick}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsError(true)}
        />

        {caption && isLoaded && (
          <p className={clsx("mt-2 text-sm", isOwn ? "text-text-inverse/90" : "text-text-secondary")}>
            {caption}
          </p>
        )}
      </div>

      {showFullScreen && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-surface-overlay/95 backdrop-blur-md animate-fade-in"
          onClick={handleClose}
        >
          <button
            className="absolute right-4 top-4 rounded-full border border-border bg-surface/80 p-2 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            onClick={handleClose}
            aria-label="Close"
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
            src={attachment.url}
            alt={attachment.fileName || "Image"}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-elev3"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default ImageMessage;
