/**
 * @fileoverview LinkPreviewCard - Enhanced link preview with OG metadata.
 *
 * Features:
 * - OG image (full width, max height 200px)
 * - Domain in uppercase
 * - Title (bold, max 2 lines)
 * - Description (max 3 lines)
 * - Clickable card opens link in new tab
 * - Loading skeleton while fetching OG data
 * - Fallback to simple link preview if no OG data
 */

import React, { useMemo } from "react";
import clsx from "clsx";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "../ui";
import type { LinkPreviewMeta } from "./linkPreviewUtils";
import { buildLinkMeta } from "./linkPreviewUtils";

interface LinkPreviewCardProps {
  url: string;
  isOwn: boolean;
  /** OG metadata (fetched by backend) */
  meta?: LinkPreviewMeta;
  /** Whether OG data is still loading */
  isLoading?: boolean;
  /** Skeleton height for loading state */
  skeletonHeight?: number;
  className?: string;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  isOwn,
  meta,
  isLoading = false,
  skeletonHeight = 160,
  className,
}) => {
  // Use provided meta or build basic meta
  const linkMeta = useMemo(
    () => meta || buildLinkMeta(url),
    [meta, url],
  );

  // Favicon via Google's public service
  const faviconUrl = useMemo(
    () => `https://www.google.com/s2/favicons?sz=32&domain=${linkMeta.hostname}`,
    [linkMeta.hostname],
  );

  const textColor = isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary";
  const secondaryTextColor = isOwn
    ? "text-[hsl(var(--chat-bubble-sent-text))/0.6]"
    : "text-text-muted";
  const borderColor = isOwn
    ? "border-[hsl(var(--chat-bubble-sent-text))/0.15]"
    : "border-border";

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        className={clsx(
          "w-full max-w-[360px] overflow-hidden rounded-xl border",
          borderColor,
          "bg-surface-overlay/60",
          className,
        )}
      >
        {/* OG Image skeleton */}
        <Skeleton
          className="w-full"
          height={skeletonHeight}
          rounded="none"
        />

        <div className="p-3">
          {/* Domain skeleton */}
          <Skeleton width={100} height={12} className="mb-2" />

          {/* Title skeleton */}
          <Skeleton width="80%" height={16} className="mb-1" />

          {/* Description skeleton */}
          <Skeleton width="100%" height={12} className="mb-0.5" />
          <Skeleton width="90%" height={12} />
        </div>
      </div>
    );
  }

  const hasOgImage = Boolean(linkMeta.imageUrl);
  const hasDescription = Boolean(linkMeta.description);
  const hasTitle = Boolean(linkMeta.title) && linkMeta.title !== linkMeta.hostname;

  return (
    <a
      href={linkMeta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        "group/link block w-full max-w-[360px] overflow-hidden rounded-xl border no-underline transition-colors",
        borderColor,
        isOwn
          ? "bg-[hsl(var(--chat-bubble-sent-text))/0.08] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.14]"
          : "bg-surface-overlay/60 hover:bg-surface-overlay",
        className,
      )}
    >
      {/* OG Image */}
      {hasOgImage && (
        <div className="relative w-full overflow-hidden" style={{ maxHeight: 200 }}>
          <img
            src={linkMeta.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        {/* Domain + favicon */}
        <div className="mb-1 flex items-center gap-1.5">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface/30">
            <img
              src={faviconUrl}
              alt=""
              className="h-3 w-3"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <span className={clsx("text-[11px] font-medium uppercase tracking-wide", secondaryTextColor)}>
            {linkMeta.siteName || linkMeta.hostname}
          </span>
        </div>

        {/* Title */}
        {hasTitle && (
          <p
            className={clsx(
              "mb-1 text-sm font-semibold leading-tight line-clamp-2",
              textColor,
            )}
          >
            {linkMeta.title}
          </p>
        )}

        {/* Description */}
        {hasDescription && (
          <p
            className={clsx(
              "text-[13px] leading-relaxed line-clamp-3",
              secondaryTextColor,
            )}
          >
            {linkMeta.description}
          </p>
        )}

        {/* Original URL (only show if no title/description) */}
        {!hasTitle && !hasDescription && (
          <p
            className={clsx(
              "truncate text-xs",
              secondaryTextColor,
            )}
          >
            {linkMeta.url}
          </p>
        )}
      </div>

      {/* External link icon */}
      <div className="absolute bottom-3 right-3">
        <ArrowUpRightIcon
          className={clsx(
            "h-4 w-4 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5",
            secondaryTextColor,
          )}
        />
      </div>
    </a>
  );
};

export default LinkPreviewCard;
