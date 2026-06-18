/**
 * @fileoverview Link preview utilities.
 */

export interface LinkPreviewMeta {
  url: string;
  hostname: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  mediaType?: string;
}

/**
 * Match first http(s) URL inside plain text.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/i;

/**
 * Extract the first URL from message content, supporting both plain text and
 * rich-text HTML (prefers the first <a href>, falls back to a text scan).
 */
export function extractFirstUrlFromContent(
  content: string | undefined,
  isRichText: boolean,
): string | null {
  if (!content) return null;
  if (isRichText) {
    const hrefMatch = content.match(/href=["'](https?:\/\/[^"']+)["']/i);
    if (hrefMatch) return hrefMatch[1];
    // Strip tags then scan the remaining text for a bare URL.
    const text = content.replace(/<[^>]+>/g, " ");
    const urlMatch = text.match(URL_RE);
    return urlMatch ? urlMatch[0] : null;
  }
  const match = content.match(URL_RE);
  return match ? match[0] : null;
}

/**
 * Extract hostname from URL
 */
export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Build link preview metadata from URL
 * Note: OG data should be fetched by backend and passed via props
 */
export function buildLinkMeta(url: string): LinkPreviewMeta {
  const hostname = extractHostname(url);
  return {
    url,
    hostname,
    title: hostname, // Fallback title
  };
}
