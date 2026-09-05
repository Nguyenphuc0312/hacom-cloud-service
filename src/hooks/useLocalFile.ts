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
import type { DesktopFileResult } from "../utils/desktopBridge";
import { logger } from "../utils/logger";

/** Trạng thái hiển thị trên card file. */
export type LocalFileStatus = "unknown" | "not-downloaded" | "downloaded";

export interface UseLocalFileResult {
  status: LocalFileStatus;
  /** Desktop mới mở được file bằng app hệ thống / mở thư mục chứa. */
  canOpenLocally: boolean;
  /** Mở file đã tải bằng app mặc định của OS. Giữ reason để caller phục hồi. */
  openLocal: () => Promise<DesktopFileResult>;
  /** Mở File Explorer và bôi đen file. Giữ reason để caller phục hồi. */
  reveal: () => Promise<DesktopFileResult>;
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
  const expectedSize = attachment?.fileSize;
  const desktop = getDesktopFiles();
  const canOpenLocally = desktop !== null;

  const localName = React.useMemo(
    () => (key ? buildLocalFileName(key, fileName) : ""),
    [key, fileName],
  );

  const webStatus = React.useSyncExternalStore<LocalFileStatus>(
    subscribeDownloadedFiles,
    () => (isFileDownloaded(key) ? "downloaded" : "not-downloaded"),
    () => "not-downloaded",
  );
  const [desktopState, setDesktopState] = React.useState<{
    localName: string;
    status: LocalFileStatus;
  }>({ localName, status: "unknown" });
  const activeLocalNameRef = React.useRef(localName);
  const mutationVersionRef = React.useRef(0);
  const setDesktopStatus = React.useCallback(
    (targetLocalName: string, nextStatus: LocalFileStatus) => {
      if (activeLocalNameRef.current !== targetLocalName) return;
      setDesktopState({ localName: targetLocalName, status: nextStatus });
    },
    [],
  );
  React.useEffect(() => {
    activeLocalNameRef.current = localName;
    return () => {
      if (activeLocalNameRef.current === localName) {
        activeLocalNameRef.current = "";
      }
    };
  }, [localName]);
  const status = canOpenLocally
    ? desktopState.localName === localName
      ? desktopState.status
      : "unknown"
    : webStatus;

  // Desktop: hỏi đĩa. Đây là điểm khác biệt thật so với web — file user xoá tay
  // ngoài app sẽ quay lại trạng thái "chưa tải", không nói dối.
  React.useEffect(() => {
    if (!desktop || !localName) return;
    let cancelled = false;
    const checkVersion = mutationVersionRef.current + 1;
    mutationVersionRef.current = checkVersion;

    void desktop
      .exists(localName)
      .then((result) => {
        if (cancelled || mutationVersionRef.current !== checkVersion) return;
        const hasExpectedSize =
          typeof expectedSize !== "number" ||
          expectedSize <= 0 ||
          typeof result.size !== "number" ||
          result.size === expectedSize;
        setDesktopStatus(
          localName,
          result.exists && hasExpectedSize ? "downloaded" : "not-downloaded",
        );
      })
      .catch(() => {
        if (!cancelled && mutationVersionRef.current === checkVersion) {
          setDesktopStatus(localName, "not-downloaded");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, expectedSize, localName, setDesktopStatus]);

  const markDownloaded = React.useCallback(() => {
    if (!key) return;
    markFileDownloaded(key);
    if (!desktop || !localName || activeLocalNameRef.current !== localName) {
      return;
    }
    mutationVersionRef.current += 1;
    setDesktopStatus(localName, "downloaded");
  }, [desktop, key, localName, setDesktopStatus]);

  const saveLocal = React.useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (!desktop || !localName) {
        markDownloaded();
        return false;
      }
      try {
        const buffer = await blob.arrayBuffer();
        const result = await desktop.save(localName, buffer);
        if (result.ok && activeLocalNameRef.current === localName) {
          mutationVersionRef.current += 1;
          setDesktopStatus(localName, "downloaded");
        }
        if (result.ok) return true;
        logger.warn("desktop-file", "save-failed", { reason: result.reason });
        return false;
      } catch (error) {
        logger.warn("desktop-file", "save-threw", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [desktop, localName, markDownloaded, setDesktopStatus],
  );

  const openLocal = React.useCallback(async (): Promise<DesktopFileResult> => {
    if (!desktop || !localName) return { ok: false, reason: "unsupported" };
    try {
      const result = await desktop.open(localName);
      // File bị xoá ngoài app → đồng bộ lại trạng thái thay vì báo mở được.
      if (
        !result.ok &&
        result.reason === "missing" &&
        activeLocalNameRef.current === localName
      ) {
        mutationVersionRef.current += 1;
        setDesktopStatus(localName, "not-downloaded");
      }
      return result;
    } catch {
      return { ok: false, reason: "open-failed" };
    }
  }, [desktop, localName, setDesktopStatus]);

  const reveal = React.useCallback(async (): Promise<DesktopFileResult> => {
    if (!desktop || !localName) {
      return { ok: false, reason: "unsupported" };
    }
    try {
      const result = await desktop.reveal(localName);
      if (
        !result.ok &&
        result.reason === "missing" &&
        activeLocalNameRef.current === localName
      ) {
        mutationVersionRef.current += 1;
        setDesktopStatus(localName, "not-downloaded");
      }
      return result;
    } catch {
      return { ok: false, reason: "reveal-failed" };
    }
  }, [desktop, localName, setDesktopStatus]);

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
