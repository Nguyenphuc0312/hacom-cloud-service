// Sanitizer tự viết (DOMPurify đã gỡ khỏi dependency).
// Đổi logic ở đây PHẢI chạy kèm messageContent.utils.test.ts.

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
  "span",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

const ALLOWED_TEXT_COLORS = new Map([
  ["rgb(229,57,53)", "#E53935"],
  ["rgb(244,81,30)", "#F4511E"],
  ["rgb(249,168,37)", "#F9A825"],
  ["rgb(67,160,71)", "#43A047"],
  ["rgb(21,101,192)", "#1565C0"],
  ["rgb(94,53,177)", "#5E35B1"],
  ["rgb(109,76,65)", "#6D4C41"],
  ["rgb(117,117,117)", "#757575"],
]);

/** Chỉ 4 scheme này được phép trong href. Mọi thứ khác → gỡ link, giữ text. */
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Kiểm tra scheme của href bằng URL parser của trình duyệt.
 *
 * Dùng URL thay vì regex tự viết vì parser đã tự chuẩn hoá whitespace và ký tự
 * điều khiển mà regex tự viết hay bỏ sót — ví dụ `java\tscript:` (chèn tab),
 * `JaVaScRiPt:` (lẫn hoa thường), hay chèn ký tự NUL vào giữa scheme.
 */
function isSafeHref(value: string): boolean {
  try {
    const base =
      typeof window !== "undefined" ? window.location.href : "http://localhost";
    return SAFE_HREF_PROTOCOLS.has(new URL(value, base).protocol);
  } catch {
    return false; // Không parse được → không tin.
  }
}

export function sanitizeMessageHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // querySelectorAll trả về NodeList tĩnh → duyệt một lượt an toàn dù DOM đổi
  // trong vòng lặp. Bản cũ dùng TreeWalker + return đệ quy mỗi khi gặp thẻ cấm:
  // vừa O(n²) (mỗi thẻ cấm = 1 lần parse lại toàn chuỗi → DoS bằng tin nhắn
  // nhiều thẻ), vừa nuốt luôn nội dung hợp lệ đứng trước thẻ cấm.
  //
  // reverse() = duyệt từ trong ra ngoài (document order đảo ngược → con trước
  // cha). Quan trọng cho hiệu năng: unwrap từ ngoài vào trong khiến cây con bên
  // trong bị chuyển cha lặp đi lặp lại — <div> lồng 500 tầng mất ~3.2s, đủ để
  // treo tab. Từ trong ra ngoài mỗi node chỉ chuyển đúng 1 lần: ~25ms.
  for (const el of Array.from(doc.body.querySelectorAll("*")).reverse()) {
    const tagName = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.includes(tagName)) {
      // Unwrap: giữ text bên trong, bỏ thẻ. parentNode null nghĩa là el nằm
      // trong cây con của một thẻ đã bị gỡ ở vòng trước → bỏ qua.
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      if (tagName === "span" && attr.name === "style") {
        const color = (el as HTMLElement).style.color
          .replace(/\s+/g, "")
          .toLowerCase();
        const safeColor = ALLOWED_TEXT_COLORS.get(color);
        if (safeColor) {
          // Chỉ giữ đúng color thuộc palette; loại mọi CSS khác đi kèm.
          el.setAttribute("style", `color: ${safeColor};`);
        } else {
          el.removeAttribute("style");
        }
        continue;
      }

      if (!ALLOWED_ATTR.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }

    if (tagName === "a") {
      const href = el.getAttribute("href");
      if (href && isSafeHref(href)) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        // javascript:/data:/vbscript:… → gỡ href, giữ lại chữ hiển thị.
        el.removeAttribute("href");
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    }
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
  return /<(strong|b|em|i|u|s|del|ul|ol|li|code|pre|a|span)\b/i.test(html);
}

const LEGACY_HTML_RE =
  /^<(p|div|ul|ol|li|strong|em|b|i|u|s|del|blockquote|h[1-6]|code|pre|span)\b/i;

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
