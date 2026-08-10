/**
 * @fileoverview useLocalFile — trạng thái "file này đã có trên máy chưa" + các
 * thao tác kèm theo, hợp nhất hai nền tảng.
 *
 * Trên **desktop** (Electron): hỏi thẳng đĩa qua `chatDesktop.files.exists`, mở
 * file bằng Word/Excel thật (`open`), mở thư mục chứa (`reveal`) — đúng như Zalo PC.
 *
 * Trên **web**: trình duyệt không cho đọc thư mục Downloads, nên chỉ ghi nhớ
 * "user đã bấm tải ở trình duyệt này" trong localStorage. Không có `reveal`.
 */

import React from "react";
import type { Attachment } from "../types";
import {
  isFileDownloaded,
  markFileDownloaded,
  subscribeDownloadedFiles,
} from "../utils/downloadedFiles";
import {
  buildLocalFileName,
  getDesktopFiles,
} from "../utils/desktopBridge";
import { logger } from "../utils/logger";

/** Trạng thái hiển thị trên card file. */
export type LocalFileStatus = "unknown" | "not-downloaded" | "downloaded";

export interface UseLocalFileResult {
  status: LocalFileStatus;
  /** Desktop mới mở được file bằng app hệ thống / mở thư mục chứa. */
  canOpenLocally: boolean;
  /** Mở file đã tải bằng app mặc định của OS. Trả false nếu không mở được. */
  openLocal: () => Promise<boolean>;
  /** Mở File Explorer và bôi đen file. Trả false nếu không làm được. */
  reveal: () => Promise<boolean>;
  /** Ghi file xuống máy (desktop: đĩa thật; web: chỉ đánh dấu đã tải). */
  saveLocal: (blob: Blob) => Promise<boolean>;
  /** Đánh dấu đã tải mà không ghi đĩa (dùng cho luồng tải của trình duyệt). */
  markDownloaded: () => void;
}

const attachmentKey = (attachment: Attachment | undefined): string =>
  attachment?.id || attachment?.objectKey || attachment?.url || "";

export const useLocalFile = (
  attachment: Attachment | undefined,
): UseLocalFileResult => {
  const key = attachmentKey(attachment);
  const fileName = attachment?.fileName;
  const desktop = getDesktopFiles();
  const canOpenLocally = desktop !== null;

  const localName = React.useMemo(
    () => (key ? buildLocalFileName(key, fileName) : ""),
    [key, fileName],
  );

  // Web: đọc từ localStorage ngay (đồng bộ). Desktop: chờ hỏi đĩa → "unknown".
  const [status, setStatus] = React.useState<LocalFileStatus>(() => {
    if (canOpenLocally) return "unknown";
    return isFileDownloaded(key) ? "downloaded" : "not-downloaded";
  });

  // Desktop: hỏi đĩa. Đây là điểm khác biệt thật so với web — file user xoá tay
  // ngoài app sẽ quay lại trạng thái "chưa tải", không nói dối.
  React.useEffect(() => {
    if (!desktop || !localName) return;
    let cancelled = false;

    void desktop
      .exists(localName)
      .then((result) => {
        if (cancelled) return;
        setStatus(result.exists ? "downloaded" : "not-downloaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("not-downloaded");
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, localName]);

  // Web: theo dõi localStorage để nhiều card cùng file cập nhật cùng lúc.
  React.useEffect(() => {
    if (canOpenLocally || !key) return;
    return subscribeDownloadedFiles(() => {
      setStatus(isFileDownloaded(key) ? "downloaded" : "not-downloaded");
    });
  }, [canOpenLocally, key]);

  const markDownloaded = React.useCallback(() => {
    if (!key) return;
    markFileDownloaded(key);
    setStatus("downloaded");
  }, [key]);

  const saveLocal = React.useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (!desktop || !localName) {
        markDownloaded();
        return false;
      }
      try {
        const buffer = await blob.arrayBuffer();
        const result = await desktop.save(localName, buffer);
        if (result.ok) {
          setStatus("downloaded");
          return true;
        }
        logger.warn("desktop-file", "save-failed", { reason: result.reason });
        return false;
      } catch (error) {
        logger.warn("desktop-file", "save-threw", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [desktop, localName, markDownloaded],
  );

  const openLocal = React.useCallback(async (): Promise<boolean> => {
    if (!desktop || !localName) return false;
    try {
      const result = await desktop.open(localName);
      // File bị xoá ngoài app → đồng bộ lại trạng thái thay vì báo mở được.
      if (!result.ok && result.reason === "missing") {
        setStatus("not-downloaded");
      }
      return result.ok;
    } catch {
      return false;
    }
  }, [desktop, localName]);

  const reveal = React.useCallback(async (): Promise<boolean> => {
    if (!desktop || !localName) return false;
    try {
      const result = await desktop.reveal(localName);
      if (!result.ok && result.reason === "missing") {
        setStatus("not-downloaded");
      }
      return result.ok;
    } catch {
      return false;
    }
  }, [desktop, localName]);

  return {
    status,
    canOpenLocally,
    openLocal,
    reveal,
    saveLocal,
    markDownloaded,
  };
};

export default useLocalFile;
