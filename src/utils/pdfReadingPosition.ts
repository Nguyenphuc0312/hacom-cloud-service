/**
 * @fileoverview Nhớ trang PDF đang đọc dở, để mở lại file cũ không phải cuộn lại
 * từ đầu — tài liệu nội bộ hay dài vài chục trang.
 *
 * Khoá theo `tên file + dung lượng` chứ không theo URL: URL đính kèm là URL ký,
 * đổi mỗi lần resolve nên không dùng làm khoá được. Cặp tên+cỡ đủ phân biệt trong
 * thực tế; trùng khoá (hai file khác nhau cùng tên, cùng byte) chỉ dẫn tới mở sai
 * trang — sai sót vô hại, không đáng đánh đổi thêm phức tạp.
 */

import { logger } from "./logger";

const STORAGE_KEY = "chat.pdfReadingPosition";
/** Trần số file được nhớ; vượt thì bỏ bản ghi cũ nhất. */
const MAX_ENTRIES = 100;
/** Dưới ngưỡng này thì không đáng nhớ (mở lại từ đầu cũng chẳng mất gì). */
const MIN_PAGES_TO_REMEMBER = 3;

interface PositionEntry {
  page: number;
  at: number;
}

type PositionMap = Record<string, PositionEntry>;

function read(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PositionMap)
      : {};
  } catch (error) {
    logger.warn("pdf-position", "read-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/** Khoá ổn định cho một file PDF. */
export function buildPdfKey(
  fileName: string | undefined,
  fileSize: number | undefined,
): string {
  const name = (fileName ?? "").trim();
  if (!name) return "";
  return `${name}:${fileSize ?? 0}`;
}

/**
 * Lưu trang đang đọc. Bỏ qua file quá ngắn và trang 1 (mặc định đã là trang 1,
 * lưu chỉ tổ phình storage).
 */
export function savePdfPage(
  key: string,
  page: number,
  totalPages: number,
): void {
  if (!key || totalPages < MIN_PAGES_TO_REMEMBER || page <= 1) return;

  const map = read();
  map[key] = { page, at: Date.now() };

  const entries = Object.entries(map);
  const pruned =
    entries.length > MAX_ENTRIES
      ? Object.fromEntries(
          entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES),
        )
      : map;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (error) {
    logger.warn("pdf-position", "write-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Trang đã lưu, hoặc `null` nếu chưa có / không hợp lệ với file hiện tại. */
export function loadPdfPage(key: string, totalPages: number): number | null {
  if (!key) return null;
  const entry = read()[key];
  if (!entry) return null;
  // File có thể đã bị thay bằng bản khác ngắn hơn → trang cũ vượt quá số trang.
  if (entry.page < 1 || entry.page > totalPages) return null;
  return entry.page;
}
