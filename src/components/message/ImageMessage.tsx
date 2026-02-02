import React, { useState } from "react";
import clsx from "clsx";
import type { Attachment } from "../../types";

interface ImageMessageProps {
  attachment: Attachment;
  caption?: string;
  isOwn: boolean;
  className?: string;
}

export const ImageMessage: React.FC<ImageMessageProps> = ({
  attachment,
  caption,
  isOwn,
  className,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState(false);

  const handleImageClick = () => {
    setShowFullScreen(true);
  };

  const handleClose = () => {
    setShowFullScreen(false);
  };

  return (
    <>
      <div className={clsx("relative", className)}>
        {/* Loading skeleton */}
        {!isLoaded && !isError && (
          <div
            className="bg-gray-200 animate-pulse rounded-lg"
            style={{
              width: attachment.width ? Math.min(attachment.width, 300) : 200,
              height: attachment.height
                ? Math.min(attachment.height, 200)
                : 150,
            }}
          />
        )}

        {/* Error state */}
        {isError && (
          <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4 text-gray-500 text-sm">
            Failed to load image
          </div>
        )}

        {/* Image */}
        <img
          src={attachment.url}
          alt={attachment.fileName || "Image"}
          className={clsx(
            "rounded-lg max-w-full cursor-pointer transition-opacity",
            isLoaded ? "opacity-100" : "opacity-0 absolute top-0 left-0",
            "hover:opacity-95",
          )}
          style={{
            maxWidth: "300px",
            maxHeight: "200px",
            objectFit: "cover",
          }}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsError(true)}
          onClick={handleImageClick}
        />

        {/* Caption */}
        {caption && isLoaded && (
          <p
            className={clsx(
              "text-sm mt-2",
              isOwn ? "text-white/90" : "text-gray-700",
            )}
          >
            {caption}
          </p>
        )}
      </div>

      {/* Fullscreen modal */}
      {showFullScreen && (
        <div
          className="fixed inset-0 z-modal bg-black/90 flex items-center justify-center animate-fade-in"
          onClick={handleClose}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={handleClose}
            aria-label="Close"
          >
            <svg
              className="w-8 h-8"
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
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default ImageMessage;
