// Module-level cache: fileId → blob ObjectURL tạo riêng khi gửi ảnh.
// Mục đích: giữ ảnh hiện trong message bubble trong khi real server message
// (không có attachment.url) thay thế optimistic message, cho đến khi
// thumbnail pipeline hoàn thành và trả về server URL.
//
// Vòng đời:
//   set()    — trong getReadyMeta() khi chuẩn bị gửi
//   get()    — trong ImageMessage khi activeSource=null
//   delete() — trong markPreviewReady() khi thumbnail đã sẵn sàng
const cache = new Map<string, string>();

export const blobPreviewCache = {
  set(fileId: string, objectUrl: string): void {
    cache.set(fileId, objectUrl);
  },
  get(fileId: string): string | undefined {
    return cache.get(fileId);
  },
  delete(fileId: string): void {
    const url = cache.get(fileId);
    if (url) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      cache.delete(fileId);
    }
  },
};
