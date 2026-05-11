import React from "react";
import clsx from "clsx";
import { GlobeAltIcon } from "@heroicons/react/24/outline";

interface LinkMeta {
  url: string;
  hostname: string;
  /** Client-extracted title — set to hostname as fallback */
  title?: string;
}

interface LinkPreviewCardProps {
  url: string;
  isOwn: boolean;
  className?: string;
}

/** Extract a clean hostname from a URL */
const extractHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Build link metadata from a URL — client-side only, no fetching */
const buildLinkMeta = (url: string): LinkMeta => {
  const hostname = extractHostname(url);
  return { url, hostname, title: hostname };
};

/**
 * A minimal, clean link preview card shown beneath message text when URLs
 * are detected. Currently client-side only (hostname + favicon); can be
 * extended with server-side OG metadata fetching later.
 */
const LinkPreviewCardComponent: React.FC<LinkPreviewCardProps> = ({
  url,
  isOwn,
  className,
}) => {
  const meta = React.useMemo(() => buildLinkMeta(url), [url]);

  // Favicon via Google's public service
  const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${meta.hostname}`;

  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        "group/link mt-1.5 flex items-center gap-2.5 rounded-lg border px-3 py-2 no-underline transition-colors",
        isOwn
          ? "border-[hsl(var(--chat-bubble-sent-text))/0.15] bg-[hsl(var(--chat-bubble-sent-text))/0.08] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.14]"
          : "border-border bg-surface-overlay/60 hover:bg-surface-overlay",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface/30">
        <img
          src={faviconUrl}
          alt=""
          className="h-4 w-4"
          loading="lazy"
          onError={(e) => {
            // Hide broken favicon, show fallback icon
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "block";
          }}
        />
        <GlobeAltIcon
          className={clsx(
            "hidden h-4 w-4",
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.6]" : "text-text-muted",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-xs font-medium leading-tight",
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))]" : "text-text-primary",
          )}
        >
          {meta.title}
        </p>
        <p
          className={clsx(
            "truncate text-[11px] leading-tight",
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.6]" : "text-text-muted",
          )}
        >
          {meta.url}
        </p>
      </div>
      <svg
        className={clsx(
          "h-3.5 w-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5",
          isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.5]" : "text-text-muted",
        )}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
        />
      </svg>
    </a>
  );
};

export const LinkPreviewCard = React.memo(LinkPreviewCardComponent);

export default LinkPreviewCard;
