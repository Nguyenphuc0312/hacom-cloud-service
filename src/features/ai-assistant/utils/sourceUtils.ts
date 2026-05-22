import type { AiSource } from "../types";

const AI_BASE_URL = "https://ai-chat.fitora.id.vn";

/**
 * Chỉ cho phép mở URL thuộc domain AI và path /api/sources/.
 * Ngăn mở URL nội bộ hoặc không rõ nguồn gốc.
 */
export function isSafeSourceUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const allowed = new URL(AI_BASE_URL);
    return (
      parsed.origin === allowed.origin &&
      parsed.pathname.startsWith("/api/sources/")
    );
  } catch {
    return false;
  }
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
    if (source && isSafeSourceUrl(source.open_url)) {
      const label = getSourceLabel(source).replace(/"/g, "'");
      return `[${num}](${source.open_url} "${label}")`;
    }
    return match;
  });
}
