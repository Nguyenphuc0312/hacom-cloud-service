import type { AiSource } from "../types";
import { AI_CHAT_BASE_URL } from "../../../services/ai-chat/constants";

const AI_BASE_URL = AI_CHAT_BASE_URL;

// BE có thể trả link nguồn ở nhiều alias — ưu tiên theo hướng dẫn BE.
const SOURCE_URL_FIELDS = [
  "reader_url",
  "url",
  "source_url",
  "open_url",
  "download_url",
] as const;

// Path cho phép mở: reader (/api/sources/) hoặc file gốc (/api/source-files/).
const ALLOWED_SOURCE_PATHS = ["/api/sources/", "/api/source-files/"];

// AI base có thể là tuyệt đối (prod: https://ai.hacomholdings.com.vn) HOẶC là
// prefix proxy tương đối (dev: /ai-api). Tách origin để so sánh khi tuyệt đối.
const AI_ABSOLUTE_ORIGIN = (() => {
  try {
    return new URL(AI_BASE_URL).origin;
  } catch {
    return null; // base tương đối (proxy) — không có origin để so sánh
  }
})();
const AI_PATH_PREFIX = AI_ABSOLUTE_ORIGIN ? "" : AI_BASE_URL.replace(/\/$/, "");

/** Path nguồn hợp lệ (đã bỏ prefix proxy nếu có). */
function sourcePathIsAllowed(pathname: string): boolean {
  const stripped =
    AI_PATH_PREFIX && pathname.startsWith(AI_PATH_PREFIX)
      ? pathname.slice(AI_PATH_PREFIX.length)
      : pathname;
  return ALLOWED_SOURCE_PATHS.some((p) => stripped.startsWith(p));
}

/**
 * Chuẩn hoá link nguồn (có thể tương đối) thành URL mở được trên host AI.
 * - Base tuyệt đối (prod): trả URL tuyệt đối, kiểm origin khớp host AI.
 * - Base tương đối (dev proxy /ai-api): trả path đã gắn prefix để proxy nhận.
 * Trả undefined nếu không thuộc path nguồn cho phép — chặn mở URL nội bộ khác.
 */
export function resolveSourceUrl(url?: string): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;

  // Link đã tuyệt đối: chỉ chấp nhận khi cùng origin AI + đúng path. Ở chế độ
  // proxy tương đối (không biết origin AI) thì mọi URL tuyệt đối đều bị từ chối.
  if (/^https?:\/\//i.test(raw)) {
    if (!AI_ABSOLUTE_ORIGIN) return undefined;
    try {
      const parsed = new URL(raw);
      if (parsed.origin !== AI_ABSOLUTE_ORIGIN) return undefined;
      return sourcePathIsAllowed(parsed.pathname) ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  }

  // Link tương đối "/api/sources/…": kiểm path rồi gắn base AI (prefix proxy
  // hoặc origin tuyệt đối). Dùng URL với origin giả để tách pathname an toàn.
  try {
    const probe = new URL(raw, "http://x");
    if (!sourcePathIsAllowed(probe.pathname)) return undefined;
    const pathWithQuery = `${probe.pathname}${probe.search}${probe.hash}`;
    if (AI_ABSOLUTE_ORIGIN) {
      return `${AI_ABSOLUTE_ORIGIN}${pathWithQuery}`;
    }
    // Base tương đối: gắn prefix proxy nếu source path chưa có sẵn.
    return pathWithQuery.startsWith(AI_PATH_PREFIX)
      ? pathWithQuery
      : `${AI_PATH_PREFIX}${pathWithQuery}`;
  } catch {
    return undefined;
  }
}

/** Link ưu tiên đầu tiên hợp lệ trong các alias BE trả về (đã chuẩn hoá tuyệt đối). */
export function getSourceHref(source: AiSource): string | undefined {
  for (const field of SOURCE_URL_FIELDS) {
    const resolved = resolveSourceUrl(source[field]);
    if (resolved) return resolved;
  }
  return undefined;
}

/**
 * True nếu source có ít nhất một link mở được (bất kỳ alias nào), đã qua kiểm
 * tra origin + path an toàn.
 */
export function isSafeSourceUrl(url?: string): boolean {
  return resolveSourceUrl(url) !== undefined;
}

/** Tạo label hiển thị ưu tiên display_label → document_name/source_name + trang → fallback */
export function getSourceLabel(source: AiSource): string {
  if (source.display_label) return source.display_label;
  const name = source.document_name || source.source_name || source.source_file;
  if (name && source.page_number != null) {
    return `${name} – Trang ${source.page_number}`;
  }
  if (name) return name;
  return `Tài liệu tham khảo ${source.citation_index}`;
}

/** Tạo chuỗi metadata phụ (chapter · article · heading_path) */
export function getSourceMeta(source: AiSource): string | null {
  const parts: string[] = [];
  if (source.chapter) parts.push(source.chapter);
  if (source.section) parts.push(source.section);
  if (source.article) parts.push(source.article);
  if (source.heading_path) parts.push(source.heading_path);
  // Hiển thị page range nếu display_label không có sẵn
  if (
    !source.display_label &&
    source.page_start != null &&
    source.page_end != null &&
    source.page_start !== source.page_end
  ) {
    parts.push(`Trang ${source.page_start}–${source.page_end}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Chuyển citation inline [N] thành markdown link [N](url "title") nếu có open_url hợp lệ.
 * Các citation không có open_url an toàn được giữ nguyên dạng text.
 */
export function preprocessCitations(content: string, sources: AiSource[]): string {
  if (!sources || sources.length === 0) return content;
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10);
    const source = sources.find((s) => s.citation_index === idx);
    const href = source && getSourceHref(source);
    if (source && href) {
      const label = getSourceLabel(source).replace(/"/g, "'");
      return `[${num}](${href} "${label}")`;
    }
    return match;
  });
}
