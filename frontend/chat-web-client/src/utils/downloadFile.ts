/**
 * @fileoverview Tải / mở file đính kèm giữ ĐÚNG tên gốc (kể cả tiếng Việt có dấu).
 *
 * Vì sao cần file này:
 * Thuộc tính `<a download="tên">` chỉ có hiệu lực khi URL **cùng origin**. Với URL
 * đã ký từ storage (khác origin), trình duyệt **bỏ qua** `download` và tự đặt tên
 * file theo path cuối của URL — chính là object-key đã bị sanitize (UUID + tên bỏ
 * dấu, ví dụ "Chiều buông" → "Chi_u_bu_ng"). Để giữ tên gốc, ta tải nội dung về
 * dưới dạng blob (blob: URL là cùng origin) rồi mới download — khi đó `download`
 * mới được tôn trọng.
 */

const DEFAULT_NAME = "download";

/** Optional Electron/Tauri/native host bridge for revealing a downloaded file. */
export type HacomDesktopBridge = {
  openResourceInFolder?: (payload: {
    id?: string;
    url: string;
    fileName: string;
  }) => Promise<void> | void;
};

/**
 * Browsers cannot launch Explorer/Finder or inspect Downloads. A desktop
 * wrapper may expose this bridge; localhost falls back to a named download.
 */
export const getHacomDesktopBridge = (): HacomDesktopBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { hacomDesktop?: HacomDesktopBridge }).hacomDesktop;
};

const triggerAnchorDownload = (
  href: string,
  fileName: string,
  { newTab = false }: { newTab?: boolean } = {},
): void => {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  if (newTab) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * Tải resource về máy với tên file chỉ định (giữ nguyên dấu tiếng Việt).
 * Ưu tiên tải blob để `download` được tôn trọng; nếu fetch lỗi (CORS/expired)
 * thì fallback sang download trực tiếp (tên có thể bị trình duyệt thay theo URL).
 */
export const downloadResourceWithName = async (
  url: string,
  fileName?: string | null,
): Promise<void> => {
  const safeName = (fileName ?? "").trim() || DEFAULT_NAME;
  if (!url) return;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(blobUrl, safeName);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    // Fallback tốt-nhất-có-thể: tên có thể bị thay theo URL nếu khác origin.
    triggerAnchorDownload(url, safeName, { newTab: true });
  }
};

/**
 * Mở resource trong tab mới.
 * - Với loại xem được trực tiếp (ảnh/pdf/video/audio/text): mở thẳng URL để xem.
 * - Với loại KHÔNG xem được (docx/xlsx/pptx/zip…): mở tab mới chỉ khiến trình
 *   duyệt tải về với tên sai, nên thay bằng tải về giữ đúng tên gốc.
 */
export const openResourceInNewTab = (
  url: string,
  fileName: string | null | undefined,
  inlineViewable: boolean,
): void => {
  if (!url) return;
  if (inlineViewable) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void downloadResourceWithName(url, fileName);
};
