import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { useDebounce } from "../../../hooks";
import { useGetLinkPreviewQuery } from "../../../features/api/chatApi";
import { SafeImage } from "../../common/SafeImage";
import { Skeleton } from "../../ui";
import {
  extractFirstUrlFromContent,
  extractHostname,
} from "../../message/linkPreviewUtils";
import type { LinkPreviewMeta } from "../../message/linkPreviewUtils";

interface ComposerLinkPreviewProps {
  draftValue: string;
  onMetaChange?: (meta: LinkPreviewMeta | null) => void;
}

export const ComposerLinkPreview: React.FC<ComposerLinkPreviewProps> = ({
  draftValue,
  onMetaChange,
}) => {
  const { t } = useTranslation();

  const debouncedDraft = useDebounce(draftValue, 500);
  const url = React.useMemo(
    () => extractFirstUrlFromContent(debouncedDraft, false),
    [debouncedDraft],
  );

  const [dismissedUrl, setDismissedUrl] = React.useState<string | null>(null);
  const isDismissed = url !== null && url === dismissedUrl;

  const { data, isLoading } = useGetLinkPreviewQuery(url ?? "", {
    skip: !url || isDismissed,
  });

  // Notify parent of current preview metadata
  const meta = data as LinkPreviewMeta | undefined;
  React.useEffect(() => {
    if (!onMetaChange) return;
    if (!url || isDismissed) {
      onMetaChange(null);
    } else if (!isLoading && meta) {
      onMetaChange(meta);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isDismissed, isLoading, meta, onMetaChange]);

  if (!url || isDismissed) return null;
  const hostname = meta?.hostname || extractHostname(url);
  const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
  const hasOgImage = Boolean(meta?.imageUrl);
  const hasTitle = Boolean(meta?.title) && meta?.title !== hostname;
  const hasDescription = Boolean(meta?.description);

  return (
    <div className="mb-1.5 w-full max-w-[360px] animate-slide-up-fade">
      <div
        className={clsx(
          "relative overflow-hidden rounded-xl border border-border",
          "bg-surface-overlay/60",
        )}
      >
        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => setDismissedUrl(url)}
          className={clsx(
            "absolute top-2 right-2 z-10 rounded-full p-1 transition-colors",
            "bg-black/30 text-white hover:bg-black/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          )}
          aria-label={t("chat:composer.dismissLinkPreview", {
            defaultValue: "Bỏ xem trước liên kết",
          })}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>

        {/* Loading state */}
        {isLoading && !meta ? (
          <>
            <Skeleton className="w-full" height={160} rounded="none" />
            <div className="p-3">
              <Skeleton width={100} height={12} className="mb-2" />
              <Skeleton width="80%" height={16} className="mb-1" />
              <Skeleton width="100%" height={12} className="mb-0.5" />
              <Skeleton width="90%" height={12} />
            </div>
          </>
        ) : (
          <>
            {/* OG Image */}
            {hasOgImage && (
              <div className="relative w-full overflow-hidden" style={{ maxHeight: 200 }}>
                <SafeImage
                  src={meta!.imageUrl}
                  alt=""
                  className="w-full object-cover"
                  style={{ maxHeight: 200 }}
                  fallback={null}
                />
              </div>
            )}

            {/* Content */}
            <div className="p-3">
              {/* Domain + favicon */}
              <div className="mb-1 flex items-center gap-1.5">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface/30">
                  <SafeImage src={faviconUrl} alt="" className="h-3 w-3" fallback={null} />
                </div>
                <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {meta?.siteName || hostname}
                </span>
              </div>

              {/* Title */}
              {hasTitle && (
                <p className="mb-1 text-sm font-semibold leading-tight line-clamp-2 text-text-primary">
                  {meta!.title}
                </p>
              )}

              {/* Description */}
              {hasDescription && (
                <p className="text-[13px] leading-relaxed line-clamp-3 text-text-muted">
                  {meta!.description}
                </p>
              )}

              {/* Fallback URL */}
              {!hasTitle && !hasDescription && (
                <p className="truncate text-xs text-text-muted">{url}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ComposerLinkPreview;
