/**
 * @fileoverview useLocalFile — trạng thái "file này đã có trên máy chưa" + các
 * thao tác kèm theo, hợp nhất hai nền tảng.
 *
 * Trên **desktop** (Electron): hỏi file đã lưu qua `chatDesktop.files.exists`, mở
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
  getManagedDesktopFiles,
} from "../utils/desktopBridge";
import type {
  DesktopFileExists,
  DesktopFileResult,
} from "../utils/desktopBridge";
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
  /** Ghi file xuống máy (desktop: thư mục tải mặc định; web: chỉ đánh dấu đã tải). */
  saveLocal: (blob: Blob) => Promise<boolean>;
  /** Đánh dấu đã tải mà không ghi đĩa (dùng cho luồng tải của trình duyệt). */
  markDownloaded: () => void;
}

export interface LocalFileScope {
  currentUserId: string;
  conversationId: string;
}

const attachmentKey = (attachment: Attachment | undefined): string =>
  attachment?.id || attachment?.objectKey || attachment?.url || "";

type DesktopStatusUpdate =
  | { status: "downloaded"; observedSize: number }
  | { status: "not-downloaded" };

type DesktopStatusListener = (update: DesktopStatusUpdate) => void;

const desktopStatusListeners = new Map<string, Set<DesktopStatusListener>>();

const subscribeDesktopStatus = (
  localName: string,
  listener: DesktopStatusListener,
): (() => void) => {
  const listeners =
    desktopStatusListeners.get(localName) ?? new Set<DesktopStatusListener>();
  listeners.add(listener);
  desktopStatusListeners.set(localName, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) desktopStatusListeners.delete(localName);
  };
};

const publishDesktopStatus = (
  localName: string,
  update: DesktopStatusUpdate,
): void => {
  for (const listener of desktopStatusListeners.get(localName) ?? []) {
    listener(update);
  }
};

const publishDesktopObservation = (
  localName: string,
  result: DesktopFileExists,
): void => {
  const observedSize = result.size;
  publishDesktopStatus(
    localName,
    result.exists &&
      typeof observedSize === "number" &&
      Number.isSafeInteger(observedSize) &&
      observedSize > 0
      ? { status: "downloaded", observedSize }
      : { status: "not-downloaded" },
  );
};

export const useLocalFile = (
  attachment: Attachment | undefined,
  scope: LocalFileScope,
): UseLocalFileResult => {
  const key = attachmentKey(attachment);
  const fileName = attachment?.fileName;
  const expectedSize =
    typeof attachment?.fileSize === "number" &&
    Number.isSafeInteger(attachment.fileSize) &&
    attachment.fileSize > 0
      ? attachment.fileSize
      : undefined;
  // Chỉ dùng native khi shell cũng quản lý được thư mục tải đã chọn. Shell cũ
  // sẽ fallback về download của trình duyệt thay vì lén tạo cache AppData.
  const desktop = getManagedDesktopFiles();
  const currentUserId = scope.currentUserId.trim();
  const conversationId = scope.conversationId.trim();

  const localName = React.useMemo(
    () =>
      key && currentUserId && conversationId
        ? buildLocalFileName(
            { currentUserId, conversationId, attachmentKey: key },
            fileName,
          )
        : "",
    [conversationId, currentUserId, fileName, key],
  );
  const canOpenLocally = desktop !== null && localName !== "";
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
  React.useEffect(() => {
    if (!desktop || !localName) return;
    return subscribeDesktopStatus(localName, (update) => {
      mutationVersionRef.current += 1;
      const nextStatus =
        update.status === "downloaded" &&
        typeof expectedSize === "number" &&
        update.observedSize !== expectedSize
          ? "not-downloaded"
          : update.status;
      setDesktopStatus(localName, nextStatus);
    });
  }, [desktop, expectedSize, localName, setDesktopStatus]);
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
        publishDesktopObservation(localName, result);
      })
      .catch(() => {
        if (!cancelled && mutationVersionRef.current === checkVersion) {
          publishDesktopStatus(localName, { status: "not-downloaded" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktop, expectedSize, localName]);

  const refreshDesktopStatus = React.useCallback(
    async (targetLocalName: string): Promise<void> => {
      if (!desktop) return;
      const checkVersion = mutationVersionRef.current;
      try {
        const result = await desktop.exists(targetLocalName);
        if (mutationVersionRef.current !== checkVersion) return;
        publishDesktopObservation(targetLocalName, result);
      } catch {
        // The successful open/reveal remains valid; keep the last known status.
      }
    },
    [desktop],
  );

  const markDownloaded = React.useCallback(() => {
    if (!key || desktop) return;
    markFileDownloaded(key);
  }, [desktop, key]);

  const saveLocal = React.useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (!desktop || !localName) {
        markDownloaded();
        return false;
      }
      try {
        const buffer = await blob.arrayBuffer();
        const result = await desktop.save(
          localName,
          buffer,
          (fileName ?? "").trim() || "download",
        );
        if (result.ok) {
          publishDesktopStatus(localName, {
            status: "downloaded",
            observedSize: blob.size,
          });
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
    [desktop, fileName, localName, markDownloaded],
  );

  const openLocal = React.useCallback(async (): Promise<DesktopFileResult> => {
    if (!desktop || !localName) return { ok: false, reason: "unsupported" };
    try {
      const result = await desktop.open(localName);
      // File bị xoá ngoài app → đồng bộ lại trạng thái thay vì báo mở được.
      if (result.ok) {
        void refreshDesktopStatus(localName);
      } else if (result.reason === "missing") {
        publishDesktopStatus(localName, { status: "not-downloaded" });
      }
      return result;
    } catch {
      return { ok: false, reason: "open-failed" };
    }
  }, [desktop, localName, refreshDesktopStatus]);

  const reveal = React.useCallback(async (): Promise<DesktopFileResult> => {
    if (!desktop || !localName) {
      return { ok: false, reason: "unsupported" };
    }
    try {
      const result = await desktop.reveal(localName);
      if (result.ok) {
        void refreshDesktopStatus(localName);
      } else if (result.reason === "missing") {
        publishDesktopStatus(localName, { status: "not-downloaded" });
      }
      return result;
    } catch {
      return { ok: false, reason: "reveal-failed" };
    }
  }, [desktop, localName, refreshDesktopStatus]);

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
