/**
 * @fileoverview ComposerLinkPreview — compact horizontal link-preview card shown
 * inside the message composer (above the input) when the draft contains a URL.
 *
 * Layout (matches richer chat clients): square thumbnail on the left, then
 * title (bold, 1 line) + description (1 line) + domain, with a dismiss "X" in
 * the top-right. Dismissing hides the preview until the URL changes; sending is
 * unaffected (this is composer chrome, not the message body).
 */

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
  /** Current draft plain text — scanned for the first URL. */
  draftValue: string;
}

export const ComposerLinkPreview: React.FC<ComposerLinkPreviewProps> = ({
  draftValue,
}) => {
  const { t } = useTranslation();

  // Debounce so we don't fire an OG fetch on every keystroke while typing a URL.
  const debouncedDraft = useDebounce(draftValue, 500);
  const url = React.useMemo(
    () => extractFirstUrlFromContent(debouncedDraft, false),
    [debouncedDraft],
  );

  // Allow the user to dismiss the card; re-show when the detected URL changes.
  const [dismissedUrl, setDismissedUrl] = React.useState<string | null>(null);
  const isDismissed = url !== null && url === dismissedUrl;

  const { data, isLoading } = useGetLinkPreviewQuery(url ?? "", {
    skip: !url || isDismissed,
  });

  if (!url || isDismissed) {
    return null;
  }

  const meta = data as LinkPreviewMeta | undefined;
  const hostname = meta?.hostname || extractHostname(url);
  const hasImage = Boolean(meta?.imageUrl);
  const title = meta?.title && meta.title !== hostname ? meta.title : undefined;
  const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;

  return (
    <div className="mb-1.5 flex w-full max-w-[440px] items-stretch overflow-hidden rounded-xl border border-[#1976D2]/20 bg-[#1976D2]/8 animate-slide-up-fade">
      {/* Thumbnail / favicon */}
      <div className="flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center overflow-hidden bg-surface-active">
        {isLoading && !meta ? (
          <Skeleton className="h-full w-full" rounded="none" />
        ) : hasImage ? (
          <SafeImage
            src={meta!.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            fallback={
              <SafeImage src={faviconUrl} alt="" className="h-6 w-6" fallback={null} />
            }
          />
        ) : (
          <SafeImage src={faviconUrl} alt="" className="h-6 w-6" fallback={null} />
        )}
      </div>

      {/* Text content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-1.5">
        {isLoading && !meta ? (
          <>
            <Skeleton width="70%" height={12} />
            <Skeleton width="90%" height={11} />
            <Skeleton width="40%" height={10} />
          </>
        ) : (
          <>
            {title && (
              <p className="truncate text-[13px] font-semibold leading-tight text-text-primary">
                {title}
              </p>
            )}
            {meta?.description && (
              <p className="truncate text-[12px] leading-tight text-text-muted">
                {meta.description}
              </p>
            )}
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[#1565C0]">
              {meta?.siteName || hostname}
            </p>
          </>
        )}
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => setDismissedUrl(url)}
        className={clsx(
          "mr-2 ml-1 flex-shrink-0 self-center rounded-full p-1 transition-colors",
          "text-text-muted hover:bg-surface-active hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={t("chat:composer.dismissLinkPreview", {
          defaultValue: "Bỏ xem trước liên kết",
        })}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ComposerLinkPreview;
