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
 * HTML-decode a URL extracted from rich-text `href`. `sanitize-html` on the
 * backend re-serializes attributes, so `?x=1&y=2` is stored/echoed as
 * `?x=1&amp;y=2`. The DOM decodes this automatically on render, but the
 * string/regex extraction path here does not — so we decode before handing the
 * URL to the link-preview fetch (otherwise the literal `&amp;` corrupts the URL).
 */
function decodeHtmlEntities(value: string): string {
  if (typeof document === "undefined") {
    // SSR fallback: handle the only entity sanitize-html injects into hrefs.
    return value.replace(/&amp;/gi, "&");
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

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
    if (hrefMatch) return decodeHtmlEntities(hrefMatch[1]);
    // Strip tags then scan the remaining text for a bare URL.
    const text = content.replace(/<[^>]+>/g, " ");
    const urlMatch = text.match(URL_RE);
    return urlMatch ? decodeHtmlEntities(urlMatch[0]) : null;
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
