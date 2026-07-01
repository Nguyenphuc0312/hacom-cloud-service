/**
 * calendarAttachmentMockStore — LỚP MOCK cho đính kèm lịch khi BE CHƯA sẵn sàng.
 *
 * Mục tiêu: FE hoạt động THẬT end-to-end (chọn → lưu → mở lại còn file → sửa
 * không mất → xem/tải) mà không cần BE. Lưu blob file vào IndexedDB (sống qua
 * F5), map eventId → danh sách attachment metadata.
 *
 * Khi BE xong: xóa file này + `uploadCalendarAttachment.ts` gọi thẳng chat-api,
 * `CalendarPage` đọc `event.attachments` từ hr-api thay vì merge từ store này.
 * Điểm nối đã cô lập — xem CALENDAR_ATTACHMENTS_USE_MOCK trong config.
 *
 * ponytail: IndexedDB thuần, không thêm dep. Không index/migration — 2 object
 * store phẳng là đủ cho mock. Nâng cấp = thay bằng API thật, không phải mở rộng mock.
 */

import type { CalendarAttachmentDto } from "../../../features/api/hrCalendarApi";

const DB_NAME = "calendar-attachments-mock";
const DB_VERSION = 1;
const BLOB_STORE = "blobs"; // key = fileId, value = { blob, filename, mimeType, sizeBytes }
const EVENT_STORE = "events"; // key = eventId, value = fileId[]

interface StoredBlob {
  fileId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "fileId" });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        db.createObjectStore(EVENT_STORE); // key = eventId (out-of-line)
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Object URL đã tạo — giữ để revoke khi cần (dọn theo phiên là đủ cho mock). */
const urlCache = new Map<string, string>();

function urlForBlob(fileId: string, blob: Blob): string {
  const existing = urlCache.get(fileId);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(fileId, url);
  return url;
}

/**
 * "Upload" 1 file → sinh fileId giả, lưu blob vào IndexedDB. Trả metadata.
 */
export async function mockUploadCalendarFile(file: File): Promise<{
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const fileId = `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record: StoredBlob = {
    fileId,
    blob: file,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
  await tx(BLOB_STORE, "readwrite", (s) => s.put(record));
  return { fileId, filename: file.name, mimeType: file.type, sizeBytes: file.size };
}

/** Gắn full desired set fileId cho 1 event (reconcile: ghi đè toàn bộ). */
export async function mockSetEventAttachments(
  eventId: string,
  fileIds: string[],
): Promise<void> {
  await tx(EVENT_STORE, "readwrite", (s) => s.put(fileIds, eventId));
}

/** Đọc danh sách attachment (kèm object URL) của 1 event. */
export async function mockGetEventAttachments(
  eventId: string,
): Promise<CalendarAttachmentDto[]> {
  const fileIds = await tx<string[] | undefined>(EVENT_STORE, "readonly", (s) =>
    s.get(eventId),
  );
  if (!fileIds || fileIds.length === 0) return [];
  const out: CalendarAttachmentDto[] = [];
  for (const fileId of fileIds) {
    const rec = await tx<StoredBlob | undefined>(BLOB_STORE, "readonly", (s) =>
      s.get(fileId),
    );
    if (!rec) continue;
    const url = urlForBlob(fileId, rec.blob);
    out.push({
      fileId: rec.fileId,
      filename: rec.filename,
      mimeType: rec.mimeType,
      sizeBytes: rec.sizeBytes,
      url,
      thumbnailUrl: rec.mimeType.startsWith("image/") ? url : null,
    });
  }
  return out;
}

/** Nạp attachments cho NHIỀU event 1 lượt (dùng khi map list events). */
export async function mockGetAttachmentsForEvents(
  eventIds: string[],
): Promise<Record<string, CalendarAttachmentDto[]>> {
  const result: Record<string, CalendarAttachmentDto[]> = {};
  await Promise.all(
    eventIds.map(async (id) => {
      const list = await mockGetEventAttachments(id);
      if (list.length > 0) result[id] = list;
    }),
  );
  return result;
}
