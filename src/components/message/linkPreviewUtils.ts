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
