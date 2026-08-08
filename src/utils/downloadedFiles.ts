/**
 * @fileoverview Ghi nhớ file nào ĐÃ TẢI trên máy này, để card file hiện trạng thái
 * kiểu Zalo ("Tải về để xem lâu dài" ↔ "Đã tải xuống").
 *
 * Giới hạn có thật, phải nói rõ: trình duyệt KHÔNG cho đọc thư mục Downloads, nên
 * đây chỉ là "mình đã bấm tải ở trình duyệt này", không phải "file còn trên đĩa".
 * User xoá file thủ công / đổi máy / xoá site data → mất dấu. Muốn chính xác tuyệt
 * đối (và có nút mở thư mục chứa) thì phải làm ở bản Electron `chat-window-desktop`.
 *
 * Lưu theo attachmentId để không phụ thuộc URL ký (URL đổi mỗi lần resolve).
 */

import { logger } from "./logger";

const STORAGE_KEY = "chat.downloadedFiles";
/** Trần số bản ghi — cắt cũ nhất khi vượt, tránh phình localStorage vô hạn. */
const MAX_ENTRIES = 500;

/** attachmentId → epoch ms lúc tải. */
type DownloadedMap = Record<string, number>;

const listeners = new Set<() => void>();
/** Cache trong RAM để useSyncExternalStore có snapshot ổn định (tránh loop vô hạn). */
let cache: DownloadedMap | null = null;

function read(): DownloadedMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    // Dữ liệu localStorage có thể bị sửa tay/hỏng → chỉ nhận đúng shape mong đợi.
    cache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as DownloadedMap)
        : {};
  } catch (error) {
    logger.warn("downloaded-files", "read-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    cache = {};
  }
  return cache;
}

function write(next: DownloadedMap): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Quota đầy / chế độ riêng tư: vẫn giữ cache RAM để phiên hiện tại đúng.
    logger.warn("downloaded-files", "write-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  listeners.forEach((listener) => listener());
}

/** Bỏ bản ghi cũ nhất khi vượt trần. */
function prune(map: DownloadedMap): DownloadedMap {
  const entries = Object.entries(map);
  if (entries.length <= MAX_ENTRIES) return map;
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

/** Đánh dấu attachment vừa được tải về máy này. */
export function markFileDownloaded(attachmentId: string | undefined): void {
  if (!attachmentId) return;
  write(prune({ ...read(), [attachmentId]: Date.now() }));
}

/** Đã từng tải attachment này trên trình duyệt hiện tại chưa. */
export function isFileDownloaded(attachmentId: string | undefined): boolean {
  if (!attachmentId) return false;
  return attachmentId in read();
}

/** Xoá toàn bộ dấu vết (dùng khi logout/xoá dữ liệu cục bộ). */
export function clearDownloadedFiles(): void {
  write({});
}

/** Đăng ký lắng nghe thay đổi; trả hàm huỷ đăng ký. */
export function subscribeDownloadedFiles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
