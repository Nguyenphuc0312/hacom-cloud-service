// removed dompurify dependency

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeMessageHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.includes(tagName)) {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
      // Restart walker because DOM changed
      return sanitizeMessageHtml(doc.body.innerHTML);
    }

    // Filter attributes
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (!ALLOWED_ATTR.includes(attr.name) && attr.name !== "target") {
        el.removeAttribute(attr.name);
      }
    }

    if (tagName === "a") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }

    node = walker.nextNode();
  }

  return doc.body.innerHTML;
}

export function stripHtmlToText(html: string): string {
  if (typeof window === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = sanitizeMessageHtml(html);
  return (div.textContent ?? div.innerText ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasRichFormatting(html: string): boolean {
  // `a` is included so any message containing a hyperlink is sent as
  // rich_text — this preserves the `href` even when the link's display text
  // differs from the URL (e.g. inserted via the toolbar as
  // `<a href="https://real.url">click here</a>`). Without it, the send path
  // falls back to `getText()` and drops the href entirely. The backend
  // (message-content-format.util) keeps `<a href>` when sanitizing rich_text.
  return /<(strong|b|em|i|u|s|del|ul|ol|li|code|pre|a)\b/i.test(html);
}

const LEGACY_HTML_RE =
  /^<(p|div|ul|ol|li|strong|em|b|i|u|s|del|blockquote|h[1-6]|code|pre)\b/i;

export function isAllowedRichHtmlContent(content?: string): boolean {
  return typeof content === "string" && LEGACY_HTML_RE.test(content.trim());
}

export function shouldTreatMessageContentAsRichText(message: {
  contentFormat?: string;
  content?: string;
}): boolean {
  return (
    message.contentFormat === "rich_text" ||
    isAllowedRichHtmlContent(message.content)
  );
}

export function getPreviewFromMessage(message: {
  contentFormat?: string;
  plainText?: string;
  content?: string;
}): string {
  if (message.plainText) return message.plainText;
  const isHtml = shouldTreatMessageContentAsRichText(message);
  if (isHtml && message.content) {
    try {
      return stripHtmlToText(message.content);
    } catch {
      return message.content;
    }
  }
  return message.content ?? "";
}
