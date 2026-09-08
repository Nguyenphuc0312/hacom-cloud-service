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
  save: (
    fileName: string,
    data: ArrayBuffer | Uint8Array,
  ) => Promise<DesktopFileResult>;
  /**
   * Native Save As. With no data, copies the already-managed local file;
   * otherwise writes the supplied bytes to the user-selected destination.
   */
  saveAs?: (
    sourceFileName: string,
    suggestedFileName: string,
    data?: ArrayBuffer | Uint8Array,
    expectedBytes?: number,
  ) => Promise<DesktopFileResult>;
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
 * Tên cache v2: hash toàn bộ account/conversation/attachment identity để hai
 * file cùng tên không dùng nhầm bytes giữa conversation hoặc account.
 *
 * Giữ nguyên tên gốc ở phần đầu để user còn nhận ra file trong Explorer.
 */
export function buildLocalFileName(
  identity: DesktopFileCacheIdentity,
  fileName: string | undefined,
): string {
  const serializedIdentity = JSON.stringify([
    "desktop-attachment-v2",
    identity.currentUserId.trim(),
    identity.conversationId.trim(),
    identity.attachmentKey.trim(),
  ]);
  const identityHash = [
    hash64(`a:${serializedIdentity}`),
    hash64(`b:${serializedIdentity}`),
  ].join("");
  const normalizedName =
    (fileName ?? "")
      .trim()
      .replace(WINDOWS_INVALID_FILE_NAME_CHARACTER, "_")
      .replace(/[.\s]+$/g, "") || "file";
  const dot = normalizedName.lastIndexOf(".");
  const extension =
    dot > 0
      ? truncateUtf8(normalizedName.slice(dot), MAX_LOCAL_FILE_EXTENSION_BYTES)
      : "";
  const stem =
    (dot > 0 ? normalizedName.slice(0, dot) : normalizedName) || "file";
  const suffix = `_v2_${identityHash}${extension}`;
  const stemBudget =
    MAX_LOCAL_FILE_NAME_BYTES - new TextEncoder().encode(suffix).byteLength;
  return `${truncateUtf8(stem, stemBudget) || "file"}${suffix}`;
}

export interface DesktopFileCacheIdentity {
  currentUserId: string;
  conversationId: string;
  attachmentKey: string;
}

const MAX_LOCAL_FILE_NAME_BYTES = 180;
const MAX_LOCAL_FILE_EXTENSION_BYTES = 24;
// eslint-disable-next-line no-control-regex -- Windows rejects ASCII control characters.
const WINDOWS_INVALID_FILE_NAME_CHARACTER = /[\u0000-\u001f<>:"/\\|?*]/g;
const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;

const hash64 = (value: string): string => {
  let hash = FNV_64_OFFSET;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
};

const truncateUtf8 = (value: string, maxBytes: number): string => {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
};
