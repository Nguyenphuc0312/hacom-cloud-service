/**
 * @fileoverview FileTypeIconV2 - Zalo-style colored icon badges for file types.
 *
 * Features:
 * - 36x36px colored badge with rounded corners
 * - File type text (PDF, DOC, XLS, etc.) in white
 * - Color-coded by file type category
 */

import React from "react";
import clsx from "clsx";
import type { FileCategoryDisplay } from "../../utils/fileCategoryUtils";
import { getFileCategory, getFileTypeColorScheme, getFileCategoryLabel } from "../../utils/fileCategoryUtils";

interface FileTypeIconV2Props {
  mimeType?: string;
  fileName?: string;
  category?: FileCategoryDisplay;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

/**
 * Get the appropriate file type category from props
 */
function resolveCategory(
  mimeType?: string,
  fileName?: string,
  forcedCategory?: FileCategoryDisplay,
): FileCategoryDisplay {
  if (forcedCategory) return forcedCategory;
  return getFileCategory(mimeType, fileName);
}

export const FileTypeIconV2: React.FC<FileTypeIconV2Props> = ({
  mimeType,
  fileName,
  category,
  size = "md",
  showLabel = true,
  className,
}) => {
  const resolvedCategory = resolveCategory(mimeType, fileName, category);
  const colorScheme = getFileTypeColorScheme(resolvedCategory);
  const label = getFileCategoryLabel(resolvedCategory);

  const sizeClasses = {
    sm: "h-8 w-8 text-[9px]",
    md: "h-9 w-9 text-[10px]",
    lg: "h-10 w-10 text-[11px]",
  };

  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-wide",
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor: colorScheme.bg,
        color: colorScheme.text,
      }}
      role="img"
      aria-label={`${label} file`}
    >
      {showLabel && <span>{label}</span>}
    </div>
  );
};

/**
 * Thumbnail variant for image attachments
 */
interface FileThumbnailIconProps {
  thumbnailUrl?: string | null;
  mimeType?: string;
  fileName?: string;
  size?: number;
  className?: string;
}

export const FileThumbnailIcon: React.FC<FileThumbnailIconProps> = ({
  thumbnailUrl,
  mimeType,
  fileName,
  size = 48,
  className,
}) => {
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);

  // If we have a thumbnail URL, show the image
  if (thumbnailUrl && !error) {
    return (
      <div
        className={clsx(
          "relative overflow-hidden rounded-lg",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={thumbnailUrl}
          alt={fileName || "Preview"}
          className={clsx(
            "h-full w-full object-cover transition-opacity",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {!loaded && (
          <div
            className="absolute inset-0 animate-pulse rounded-lg bg-surface-overlay"
          />
        )}
      </div>
    );
  }

  // Fallback to colored icon
  return (
    <FileTypeIconV2
      mimeType={mimeType}
      fileName={fileName}
      size={size === 48 ? "lg" : size >= 64 ? "lg" : "md"}
      className={className}
    />
  );
};

export default FileTypeIconV2;
