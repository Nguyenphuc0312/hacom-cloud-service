/**
 * @fileoverview useUploadQueue — concurrent upload pipeline with progress,
 * abort, and retry support.
 *
 * Flow per file:
 *   1) POST /files/upload-url → presigned URL
 *   2) PUT file to presigned URL (XHR for progress)
 *   3) POST /files/complete → returns fileId + metadata
 *   4) Mark draft status = 'ready'
 *
 * Features:
 * - Concurrency limit (default 3)
 * - Per-file AbortController for cancel
 * - Auto retry on 403 (expired URL) — re-requests upload URL once
 * - Validates file size, count, total size, duplicates
 * - Revokes ObjectURLs on removal / clear / unmount
 * - Conversation-scoped: clears drafts on conversation change
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { chatApi } from "../features/chat/api";
import { unwrapApiSuccess } from "../lib/apiContract";
import { UPLOAD_CONFIG } from "../config";
import type {
  AttachmentDraft,
  AttachmentDraftStatus,
  UploadedFileMeta,
} from "../types/attachmentDraft";
import {
  ATTACHMENT_CONSTRAINTS,
  createAttachmentDraft,
  isDuplicateFile,
} from "../types/attachmentDraft";

// ── Types ───────────────────────────────────────────────────────────

export interface UseUploadQueueOptions {
  conversationId: string | undefined;
  /** Max concurrent uploads (default 3) */
  concurrency?: number;
}

export interface UseUploadQueueReturn {
  /** Current list of attachment drafts */
  drafts: AttachmentDraft[];
  /** Add files to the queue (from drop or file picker) */
  addFiles: (files: File[]) => UploadQueueAddFilesResult;
  /** Remove a draft by localId */
  removeDraft: (localId: string) => void;
  /** Cancel an in-progress upload */
  cancelUpload: (localId: string) => void;
  /** Retry a failed upload */
  retryUpload: (localId: string) => void;
  /** Clear all drafts (revoking ObjectURLs) */
  clearAll: () => void;
  /** Whether there are drafts in a sendable state */
  hasReadyDrafts: boolean;
  /** Whether any draft is still uploading */
  hasUploadingDrafts: boolean;
  /** Whether any draft failed */
  hasFailedDrafts: boolean;
  /** Get all ready drafts' uploaded metadata */
  getReadyMeta: () => UploadedFileMeta[];
  /** Total count of non-removed drafts */
  activeCount: number;
}

export interface UploadQueueAddFilesResult {
  acceptedCount: number;
  rejectedCount: number;
  errors: string[];
}

// ── Constants ───────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 3;

// ── XHR upload with progress ────────────────────────────────────────

function xhrUpload(
  url: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  signal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      xhr.abort();
    };
    signal.addEventListener("abort", onAbort, { once: true });

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    });

    xhr.addEventListener("load", () => {
      signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          Object.assign(new Error(`Upload failed: ${xhr.status}`), {
            status: xhr.status,
          }),
        );
      }
    });

    xhr.addEventListener("error", () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      signal.removeEventListener("abort", onAbort);
      reject(
        Object.assign(new Error("Upload cancelled"), { name: "AbortError" }),
      );
    });

    xhr.open(method, url);
    for (const [headerName, headerValue] of Object.entries(headers)) {
      xhr.setRequestHeader(headerName, headerValue);
    }
    xhr.send(file);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ERR_CANCELED";
}

/** Revoke ObjectURL if present */
// ── Hook ────────────────────────────────────────────────────────────

export function useUploadQueue({
  conversationId,
  concurrency = DEFAULT_CONCURRENCY,
}: UseUploadQueueOptions): UseUploadQueueReturn {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const abortControllers = useRef(new Map<string, AbortController>());
  const activePreviewUrls = useRef(new Set<string>());
  const revokedPreviewUrls = useRef(new Set<string>());
  const isProcessing = useRef(false);

  // Stable ref to current conversationId for async callbacks
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const registerPreviewUrl = useCallback((previewUrl: string | undefined) => {
    if (previewUrl) {
      activePreviewUrls.current.add(previewUrl);
    }
  }, []);

  const revokePreviewUrl = useCallback((previewUrl: string | undefined) => {
    if (!previewUrl || revokedPreviewUrls.current.has(previewUrl)) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    revokedPreviewUrls.current.add(previewUrl);
    activePreviewUrls.current.delete(previewUrl);
  }, []);

  const revokeAllActivePreviewUrls = useCallback(() => {
    for (const previewUrl of Array.from(activePreviewUrls.current)) {
      revokePreviewUrl(previewUrl);
    }
  }, [revokePreviewUrl]);

  // ─ Update a single draft by localId ─

  const updateDraft = useCallback(
    (localId: string, patch: Partial<AttachmentDraft>) => {
      setDrafts((prev) =>
        prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)),
      );
    },
    [],
  );

  // ─ Upload a single file ─

  const uploadOne = useCallback(
    async (draft: AttachmentDraft) => {
      const cid = conversationIdRef.current;
      if (!cid) {
        updateDraft(draft.localId, {
          status: "failed",
          error: t("error:upload.noConversation", {
            defaultValue: "No conversation selected",
          }),
        });
        return;
      }

      const abortController = new AbortController();
      abortControllers.current.set(draft.localId, abortController);

      updateDraft(draft.localId, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });

      try {
        // Step 1: Request presigned upload URL
        const signedResponse = await chatApi.file.requestUploadUrl({
          conversationId: cid,
          fileName: draft.file.name,
          mimeType: draft.file.type || "application/octet-stream",
          fileSize: draft.file.size,
        });
        const signed = unwrapApiSuccess(signedResponse);

        // Step 2: Upload file via XHR
        const mimeType = draft.file.type || "application/octet-stream";
        const uploadMethod = signed.uploadMethod || "PUT";
        const uploadHeaders = {
          "Content-Type": mimeType,
          ...(signed.uploadHeaders || {}),
        };
        try {
          await xhrUpload(
            signed.uploadUrl,
            uploadMethod,
            uploadHeaders,
            draft.file,
            abortController.signal,
            (pct) => updateDraft(draft.localId, { progress: pct }),
          );
        } catch (uploadErr: unknown) {
          // Auto retry on 403 (expired presigned URL)
          const status = (uploadErr as { status?: number }).status;
          if (status === 403) {
            const retryResponse = await chatApi.file.requestUploadUrl({
              conversationId: cid,
              fileName: draft.file.name,
              mimeType,
              fileSize: draft.file.size,
            });
            const retrySigned = unwrapApiSuccess(retryResponse);
            const retryUploadMethod = retrySigned.uploadMethod || "PUT";
            const retryUploadHeaders = {
              "Content-Type": mimeType,
              ...(retrySigned.uploadHeaders || {}),
            };
            await xhrUpload(
              retrySigned.uploadUrl,
              retryUploadMethod,
              retryUploadHeaders,
              draft.file,
              abortController.signal,
              (pct) => updateDraft(draft.localId, { progress: pct }),
            );
            // Use retry's objectKey / uploadId for complete step
            Object.assign(signed, {
              uploadId: retrySigned.uploadId,
              objectKey: retrySigned.objectKey,
              uploadUrl: retrySigned.uploadUrl,
              uploadMethod: retrySigned.uploadMethod,
              uploadHeaders: retrySigned.uploadHeaders,
            });
          } else {
            throw uploadErr;
          }
        }

        // Step 3: Complete upload
        const completeResponse = await chatApi.file.completeUpload({
          uploadId: signed.uploadId,
          conversationId: cid,
          objectKey: signed.objectKey,
        });
        const completed = unwrapApiSuccess(completeResponse);
        const attachment = chatApi.file.toAttachment(completed);

        const meta: UploadedFileMeta = {
          fileId: attachment.id,
          mimeType: attachment.mimeType || mimeType,
          size: attachment.fileSize || draft.file.size,
          name: attachment.fileName || draft.file.name,
          objectKey: attachment.objectKey,
          thumbnailUrl: attachment.thumbnailUrl,
          width: attachment.width,
          height: attachment.height,
          duration: attachment.duration,
        };

        updateDraft(draft.localId, {
          status: "ready",
          progress: 100,
          uploaded: meta,
        });
      } catch (err) {
        if (isAbortError(err)) {
          updateDraft(draft.localId, {
            status: "removed",
            error: t("error:upload.cancelled", {
              defaultValue: "Upload cancelled",
            }),
          });
          return;
        }

        const status = (err as { status?: number }).status;
        if (status === 413) {
          updateDraft(draft.localId, {
            status: "failed",
            error: t("error:upload.tooLarge", {
              defaultValue: "File too large",
            }),
          });
        } else {
          updateDraft(draft.localId, {
            status: "failed",
            error: t("error:upload.uploadFailed", {
              defaultValue: "Upload failed",
            }),
          });
        }
      } finally {
        abortControllers.current.delete(draft.localId);
      }
    },
    [t, updateDraft],
  );

  // ─ Process queue with concurrency limit ─

  const processQueue = useCallback(() => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    setDrafts((current) => {
      const uploading = current.filter((d) => d.status === "uploading");
      const queued = current.filter((d) => d.status === "queued");
      const slots = concurrency - uploading.length;

      if (slots > 0 && queued.length > 0) {
        const toStart = queued.slice(0, slots);
        // Fire uploads (async — don't await here)
        for (const draft of toStart) {
          void uploadOne(draft).then(() => {
            isProcessing.current = false;
            processQueue();
          });
        }
      }

      isProcessing.current = false;
      return current; // no state change needed here
    });
  }, [concurrency, uploadOne]);

  // ─ Trigger queue processing whenever drafts change ─

  useEffect(() => {
    const hasQueued = drafts.some((d) => d.status === "queued");
    const uploadingCount = drafts.filter(
      (d) => d.status === "uploading",
    ).length;
    if (hasQueued && uploadingCount < concurrency) {
      processQueue();
    }
  }, [drafts, concurrency, processQueue]);

  // Revoke ObjectURLs only after their draft is no longer rendered.
  useEffect(() => {
    const nextPreviewUrls = new Set(
      drafts
        .filter((draft) => draft.status !== "removed")
        .map((draft) => draft.previewUrl)
        .filter((previewUrl): previewUrl is string => Boolean(previewUrl)),
    );

    for (const previewUrl of activePreviewUrls.current) {
      if (!nextPreviewUrls.has(previewUrl)) {
        revokePreviewUrl(previewUrl);
      }
    }

    for (const previewUrl of nextPreviewUrls) {
      if (!revokedPreviewUrls.current.has(previewUrl)) {
        activePreviewUrls.current.add(previewUrl);
      }
    }
  }, [drafts, revokePreviewUrl]);

  // ─ Clear drafts on conversation change ─

  useEffect(() => {
    setDrafts(() => {
      // Abort all in-progress uploads
      for (const [, controller] of abortControllers.current) {
        controller.abort();
      }
      abortControllers.current.clear();
      return [];
    });
  }, [conversationId]);

  // ─ Cleanup on unmount ─

  useEffect(() => {
    const controllers = abortControllers.current;
    return () => {
      for (const [, controller] of controllers) {
        controller.abort();
      }
      controllers.clear();
      revokeAllActivePreviewUrls();
    };
  }, [revokeAllActivePreviewUrls]);

  // ─ Public API ─

  const addFiles = useCallback(
    (files: File[]): UploadQueueAddFilesResult => {
      const allowedTypes = new Set<string>([
        ...UPLOAD_CONFIG.ALLOWED_FILE_TYPES,
        "video/mp4",
      ]);
      const result: UploadQueueAddFilesResult = {
        acceptedCount: 0,
        rejectedCount: 0,
        errors: [],
      };

      setDrafts((prev) => {
        const active = prev.filter((d) => d.status !== "removed");

        let next = [...prev];

        for (const file of files) {
          // Check count limit
          const currentActive = next.filter((d) => d.status !== "removed");
          if (
            currentActive.length >= ATTACHMENT_CONSTRAINTS.maxFilesPerMessage
          ) {
            result.errors.push(
              t("error:upload.tooManyFiles", {
                max: ATTACHMENT_CONSTRAINTS.maxFilesPerMessage,
                defaultValue: `Maximum ${ATTACHMENT_CONSTRAINTS.maxFilesPerMessage} files allowed`,
              }),
            );
            result.rejectedCount += 1;
            break;
          }

          // Check single file size
          if (file.size > ATTACHMENT_CONSTRAINTS.maxSingleFileSize) {
            result.errors.push(
              t("error:upload.fileTooLargeNamed", {
                name: file.name,
                defaultValue: `${file.name} is too large`,
              }),
            );
            result.rejectedCount += 1;
            continue;
          }

          // Check file type
          if (!allowedTypes.has(file.type)) {
            result.errors.push(
              t("error:upload.unsupportedTypeNamed", {
                name: file.name,
                defaultValue: `${file.name} has an unsupported file type`,
              }),
            );
            result.rejectedCount += 1;
            continue;
          }

          // Check total size
          const totalSize =
            currentActive.reduce((sum, d) => sum + d.file.size, 0) + file.size;
          if (totalSize > ATTACHMENT_CONSTRAINTS.maxTotalSize) {
            result.errors.push(
              t("error:upload.totalSizeTooLarge", {
                defaultValue: "Total file size limit exceeded",
              }),
            );
            result.rejectedCount += 1;
            break;
          }

          // Check duplicates
          const isDuplicate = active.some((d) => isDuplicateFile(d.file, file));
          if (isDuplicate) {
            result.rejectedCount += 1;
            continue;
          }

          const draft = createAttachmentDraft(file);
          registerPreviewUrl(draft.previewUrl);
          next = [...next, draft];
          result.acceptedCount += 1;
        }

        return next;
      });

      return result;
    },
    [registerPreviewUrl, t],
  );

  const removeDraft = useCallback((localId: string) => {
    // Cancel if uploading
    const controller = abortControllers.current.get(localId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(localId);
    }

    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }, []);

  const cancelUpload = useCallback(
    (localId: string) => {
      const controller = abortControllers.current.get(localId);
      if (controller) {
        controller.abort();
      }
      removeDraft(localId);
    },
    [removeDraft],
  );

  const retryUpload = useCallback(
    (localId: string) => {
      updateDraft(localId, { status: "queued", progress: 0, error: undefined });
    },
    [updateDraft],
  );

  const clearAll = useCallback(() => {
    // Abort all
    for (const [, controller] of abortControllers.current) {
      controller.abort();
    }
    abortControllers.current.clear();

    setDrafts([]);
  }, []);

  // ─ Derived state ─

  const activeDrafts = drafts.filter(
    (
      d,
    ): d is AttachmentDraft & {
      status: Exclude<AttachmentDraftStatus, "removed">;
    } => d.status !== "removed",
  );

  const hasReadyDrafts = activeDrafts.some((d) => d.status === "ready");
  const hasUploadingDrafts = activeDrafts.some(
    (d) => d.status === "uploading" || d.status === "queued",
  );
  const hasFailedDrafts = activeDrafts.some((d) => d.status === "failed");

  const getReadyMeta = useCallback((): UploadedFileMeta[] => {
    return drafts
      .filter((d) => d.status === "ready" && d.uploaded)
      .map((d) => d.uploaded!);
  }, [drafts]);

  return {
    drafts: activeDrafts,
    addFiles,
    removeDraft,
    cancelUpload,
    retryUpload,
    clearAll,
    hasReadyDrafts,
    hasUploadingDrafts,
    hasFailedDrafts,
    getReadyMeta,
    activeCount: activeDrafts.length,
  };
}

export default useUploadQueue;
