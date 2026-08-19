import React from "react";
import clsx from "clsx";
import {
  DocumentIcon,
  PhotoIcon,
  PlayIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { resolvePublicResourceUrl } from "../../config";
import {
  formatFileSize,
  getFileIconType,
} from "../../utils/formatFileSize";
import {
  getAttachmentDisplayName,
  getAttachmentKind,
  getAttachmentSize,
} from "../../utils/mediaFallback";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { FileName } from "./FileName";
import { SafeImage } from "./SafeImage";

type MediaThumbnailVariant = "grid" | "message" | "reply" | "preview";

type AttachmentLike = {
  id?: string | null;
  type?: string | null;
  objectKey?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fileId?: string | null;
  originalName?: string | null;
  name?: string | null;
  size?: number | null;
  sizeBytes?: number | null;
  messageType?: string | null;
};

interface MediaThumbnailProps {
  attachment?: AttachmentLike | null;
  src?: string | null;
  variant?: MediaThumbnailVariant;
  className?: string;
  imageClassName?: string;
  showFileName?: boolean;
  showFileSize?: boolean;
  alt?: string;
  retryOnSignedUrlExpired?: boolean;
  onRetrySource?: (src: string) => void;
  onImageError?: (src: string) => void;
}

const variantClasses: Record<MediaThumbnailVariant, string> = {
  grid: "aspect-square rounded-md",
  message: "h-36 w-full max-w-[280px] rounded-lg",
  reply: "h-10 w-10 rounded-lg",
  preview: "h-12 w-full rounded",
};

const iconSizeClasses: Record<MediaThumbnailVariant, string> = {
  grid: "h-6 w-6",
  message: "h-10 w-10",
  reply: "h-4 w-4",
  preview: "h-5 w-5",
};

const shouldShowNameDefault = (variant: MediaThumbnailVariant): boolean =>
  variant === "grid" || variant === "message";

export const ImageFallback: React.FC<{
  variant?: MediaThumbnailVariant;
  label?: string;
  className?: string;
}> = ({ variant = "grid", label = "Hinh anh", className }) => (
  <div
    className={clsx(
      "flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-overlay text-text-muted",
      className,
    )}
  >
    <PhotoIcon className={iconSizeClasses[variant]} aria-hidden="true" />
    {variant !== "reply" && (
      <span className="max-w-full truncate px-2 text-xs font-medium">{label}</span>
    )}
  </div>
);

export const VideoFallback: React.FC<{
  name?: string;
  variant?: MediaThumbnailVariant;
  className?: string;
}> = ({ name, variant = "grid", className }) => (
  <div
    className={clsx(
      "relative flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-overlay p-2 text-text-muted",
      className,
    )}
  >
    <VideoCameraIcon className={iconSizeClasses[variant]} aria-hidden="true" />
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 shadow-sm ring-1 ring-border">
      <PlayIcon className="ml-0.5 h-5 w-5 text-text-primary" aria-hidden="true" />
    </div>
    {variant !== "reply" && name && (
      <span className="max-w-full truncate text-center text-xs font-medium">
        {name}
      </span>
    )}
  </div>
);

export const FileFallback: React.FC<{
  attachment?: AttachmentLike | null;
  variant?: MediaThumbnailVariant;
  className?: string;
}> = ({ attachment, variant = "grid", className }) => {
  const name = getAttachmentDisplayName(attachment);
  const size = getAttachmentSize(attachment);
  const iconType = getFileIconType(attachment?.mimeType ?? undefined, name);

  return (
    <div
      className={clsx(
        "flex h-full w-full min-w-0 items-center justify-center gap-2 bg-surface-overlay p-2 text-text-muted",
        variant === "grid" || variant === "message" ? "flex-col" : "flex-row",
        className,
      )}
    >
      {iconType ? (
        <FileTypeIcon type={iconType} className={iconSizeClasses[variant]} />
      ) : (
        <DocumentIcon className={iconSizeClasses[variant]} aria-hidden="true" />
      )}
      {variant !== "reply" && (
        <div className="min-w-0 max-w-full text-center">
          <FileName
            name={name}
            className="text-xs font-medium text-text-secondary"
          />
          {size && (
            <p className="truncate text-[10px] text-text-muted">
              {formatFileSize(size)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  attachment,
  src,
  variant = "grid",
  className,
  imageClassName,
  showFileName,
  alt,
  retryOnSignedUrlExpired,
  onRetrySource,
  onImageError,
}) => {
  const kind = getAttachmentKind(attachment);
  const displayName = getAttachmentDisplayName(attachment);
  const shouldShowName = showFileName ?? shouldShowNameDefault(variant);
  const rawImageSource =
    src ??
    attachment?.thumbnailUrl ??
    (kind === "image" ? attachment?.url ?? attachment?.downloadUrl : null);
  const imageSource = rawImageSource
    ? resolvePublicResourceUrl(rawImageSource, {
        context: "image",
        allowBlob: true,
        allowDataImage: kind === "image",
      })
    : null;

  const fallback =
    kind === "video" ? (
      <VideoFallback
        name={shouldShowName ? displayName : undefined}
        variant={variant}
      />
    ) : kind === "image" ? (
      <ImageFallback
        variant={variant}
        label={shouldShowName ? "Hinh anh" : undefined}
      />
    ) : (
      <FileFallback attachment={attachment} variant={variant} />
    );

  if (kind !== "image" && kind !== "video") {
    return (
      <div className={clsx("overflow-hidden", variantClasses[variant], className)}>
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-surface-overlay",
        variantClasses[variant],
        className,
      )}
    >
      <SafeImage
        src={imageSource}
        alt={alt ?? displayName}
        className={clsx("h-full w-full", imageClassName)}
        objectFit="cover"
        fallback={fallback}
        retryOnSignedUrlExpired={retryOnSignedUrlExpired}
        onRetrySource={onRetrySource}
        onError={(_, failedSrc) => onImageError?.(failedSrc)}
      />
      {kind === "video" && imageSource && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 shadow-md">
            <PlayIcon className="ml-0.5 h-5 w-5 text-text-primary" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaThumbnail;
