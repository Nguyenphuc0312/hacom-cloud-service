/**
 * @fileoverview Cầu nối tới vỏ Electron (`chat-window-desktop`).
 *
 * App desktop là Electron **bọc chính web client này**, nên cùng một code React
 * chạy ở cả trình duyệt lẫn desktop. File này dò khả năng lúc chạy: có
 * `window.chatDesktop.files` thì dùng đường native (mở bằng Word thật, mở thư
 * mục chứa — giống Zalo PC), không có thì caller tự fallback sang cách của web.
 *
 * Bridge do `chat-window-desktop/src/preload.js` bơm vào. Renderer chỉ gửi TÊN
 * file; main process tự quyết thư mục lưu và chặn path traversal.
 */

/** Kết quả chung của các thao tác file phía desktop. */
export interface DesktopFileResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

export interface DesktopFileExists {
  exists: boolean;
  path?: string;
  size?: number;
}

interface DesktopFilesApi {
  save: (fileName: string, data: ArrayBuffer | Uint8Array) => Promise<DesktopFileResult>;
  open: (fileName: string) => Promise<DesktopFileResult>;
  reveal: (fileName: string) => Promise<DesktopFileResult>;
  exists: (fileName: string) => Promise<DesktopFileExists>;
}

/**
 * Toàn bộ bridge preload bơm vào. Đây là khai báo DUY NHẤT của
 * `window.chatDesktop` trong app — khai thêm ở file khác sẽ xung đột kiểu
 * (TS2717), nên chỗ nào cần thêm khả năng mới thì bổ sung vào đây.
 */
export interface ChatDesktopBridge {
  platform?: string;
  setUnreadBadge?: (count: number) => void;
  files?: DesktopFilesApi;
}

declare global {
  interface Window {
    chatDesktop?: ChatDesktopBridge;
  }
}

/**
 * API file của desktop, hoặc `null` khi đang chạy trong trình duyệt thường.
 *
 * Kiểm tra cả `files` chứ không chỉ `chatDesktop`: bản desktop cũ đã cài trên máy
 * user có bridge nhưng CHƯA có nhóm `files`, gọi thẳng sẽ ném lỗi.
 */
export function getDesktopFiles(): DesktopFilesApi | null {
  if (typeof window === "undefined") return null;
  const files = window.chatDesktop?.files;
  return typeof files?.open === "function" ? files : null;
}

/** Đang chạy trong vỏ desktop có hỗ trợ thao tác file hay không. */
export function isDesktopApp(): boolean {
  return getDesktopFiles() !== null;
}

/**
 * Tên file lưu xuống đĩa: gắn attachmentId vào trước phần mở rộng để hai file
 * trùng tên ("Báo cáo.docx") từ hai tin nhắn khác nhau không đè lên nhau.
 *
 * Giữ nguyên tên gốc ở phần đầu để user còn nhận ra file trong Explorer.
 */
export function buildLocalFileName(
  attachmentId: string,
  fileName: string | undefined,
): string {
  const safeBase = (fileName ?? "").trim() || "file";
  const shortId = attachmentId.slice(-8);
  const dot = safeBase.lastIndexOf(".");
  // Không có phần mở rộng, hoặc dấu chấm ở đầu (".gitignore") → nối thẳng vào cuối.
  if (dot <= 0) return `${safeBase}_${shortId}`;
  return `${safeBase.slice(0, dot)}_${shortId}${safeBase.slice(dot)}`;
}
