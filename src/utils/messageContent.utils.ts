import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del",
  "ul", "ol", "li", "a", "code", "pre",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "form"],
    FORBID_ATTR: ["style", "class", "onerror", "onload", "onclick"],
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: false,
  });
}

export function stripHtmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = sanitizeMessageHtml(html);
  return (div.textContent ?? div.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasRichFormatting(html: string): boolean {
  return /<(strong|b|em|i|u|s|del|ul|ol|li|code|pre)\b/i.test(html);
}

const LEGACY_HTML_RE = /^<(p|div|ul|ol|li|strong|em|b|i|u|s|del|blockquote|h[1-6]|code|pre)\b/i;

export function getPreviewFromMessage(message: {
  contentFormat?: string;
  plainText?: string;
  content?: string;
}): string {
  if (message.plainText) return message.plainText;
  const isHtml =
    message.contentFormat === "rich_text" ||
    (!message.contentFormat && !!message.content && LEGACY_HTML_RE.test(message.content.trim()));
  if (isHtml && message.content) {
    try {
      return stripHtmlToText(message.content);
    } catch {
      return message.content;
    }
  }
  return message.content ?? "";
}
