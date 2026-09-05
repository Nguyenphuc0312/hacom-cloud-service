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
const MAX_IN_MEMORY_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export interface ResourceDownloadProgress {
  loadedBytes: number;
  totalBytes?: number;
}

export interface ResourceDownloadOptions {
  signal?: AbortSignal;
  /** Fallback when storage does not expose Content-Length. */
  totalBytesHint?: number;
  /** Exact attachment size when the backend supplies one. */
  expectedBytes?: number;
  /** Cap buffered downloads so a malformed response cannot exhaust the renderer. */
  maxBytes?: number;
  onProgress?: (progress: ResourceDownloadProgress) => void;
}

// Renderer-level UX guard: only auto-open known passive formats. Unknown and
// executable/script formats are downloaded but never dispatched to the OS.
// The desktop main process must independently enforce the same policy.
const AUTO_OPEN_EXTENSIONS = new Set(
  "pdf txt csv rtf md log doc docx dot dotx xls xlsx xlt xltx ppt pptx pps ppsx pot potx odt ods odp jpg jpeg png gif webp bmp heic heif mp3 wav m4a ogg mp4 mov webm avi mkv zip rar 7z tar gz gzip".split(
    " ",
  ),
);

export const canAutoOpenDownloadedFile = (
  fileName?: string | null,
): boolean => {
  // Windows ignores trailing spaces and dots when dispatching a file. Normalize
  // them before checking the final extension to avoid names such as report.exe.
  const normalized = (fileName ?? "").trim().replace(/[.\s]+$/g, "");
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0 || dot === normalized.length - 1) return false;
  return AUTO_OPEN_EXTENSIONS.has(
    normalized.slice(dot + 1).toLowerCase(),
  );
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
  try {
    a.click();
  } finally {
    a.remove();
  }
};

const resolveTotalBytes = (
  response: Response,
  totalBytesHint?: number,
): number | undefined => {
  const headerValue = Number(response.headers.get("content-length"));
  if (Number.isFinite(headerValue) && headerValue > 0) return headerValue;
  return totalBytesHint && totalBytesHint > 0 ? totalBytesHint : undefined;
};

const assertExpectedBytes = (
  loadedBytes: number,
  expectedBytes?: number,
): void => {
  if (
    typeof expectedBytes === "number" &&
    expectedBytes > 0 &&
    loadedBytes !== expectedBytes
  ) {
    throw new Error("Downloaded file size does not match attachment");
  }
};

/** Fetch a resource once while reporting the real transferred byte count. */
export const fetchResourceBlob = async (
  url: string,
  options: ResourceDownloadOptions = {},
): Promise<Blob> => {
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) {
    throw new Error("Download failed: HTTP " + response.status);
  }

  const maxBytes = options.maxBytes ?? MAX_IN_MEMORY_DOWNLOAD_BYTES;
  const totalBytes = resolveTotalBytes(response, options.totalBytesHint);
  if (totalBytes !== undefined && totalBytes > maxBytes) {
    throw new Error("Download exceeds the in-memory size limit");
  }
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maxBytes) {
      throw new Error("Download exceeds the in-memory size limit");
    }
    assertExpectedBytes(blob.size, options.expectedBytes);
    options.onProgress?.({ loadedBytes: blob.size, totalBytes });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loadedBytes = 0;
  let lastReportedBytes = 0;
  let lastReportedAt = 0;
  const reportProgress = (force = false) => {
    if (!options.onProgress) return;
    const now = Date.now();
    if (!force && now - lastReportedAt < 100) return;
    if (loadedBytes === lastReportedBytes) return;
    lastReportedAt = now;
    lastReportedBytes = loadedBytes;
    options.onProgress?.({ loadedBytes, totalBytes });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    loadedBytes += chunk.byteLength;
    if (loadedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Download exceeds the in-memory size limit");
    }
    reportProgress();
  }
  reportProgress(true);
  assertExpectedBytes(loadedBytes, options.expectedBytes);

  return new Blob(chunks, {
    type: response.headers.get("content-type") || undefined,
  });
};

/** Start a browser download from a blob that has already been fetched. */
export const downloadBlobWithName = (
  blob: Blob,
  fileName?: string | null,
): void => {
  const safeName = (fileName ?? "").trim() || DEFAULT_NAME;
  const blobUrl = URL.createObjectURL(blob);
  try {
    triggerAnchorDownload(blobUrl, safeName);
  } finally {
    window.setTimeout(
      () => URL.revokeObjectURL(blobUrl),
      OBJECT_URL_REVOKE_DELAY_MS,
    );
  }
};

/**
 * Tải resource về máy với tên file chỉ định (giữ nguyên dấu tiếng Việt).
 * Ưu tiên tải blob để `download` được tôn trọng; nếu fetch lỗi (CORS/expired)
 * thì fallback sang download trực tiếp (tên có thể bị trình duyệt thay theo URL).
 */
export const downloadResourceWithName = async (
  url: string,
  fileName?: string | null,
  options: ResourceDownloadOptions = {},
): Promise<void> => {
  const safeName = (fileName ?? "").trim() || DEFAULT_NAME;
  if (!url) return;

  try {
    const blob = await fetchResourceBlob(url, options);
    downloadBlobWithName(blob, safeName);
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    // Managed downloads report progress and already have a recoverable error
    // state. A blind anchor fallback would start the same transfer again and
    // cannot tell the caller whether that second attempt actually succeeded.
    if (options.onProgress) {
      throw error;
    }
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
