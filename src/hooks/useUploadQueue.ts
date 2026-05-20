import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { extractApiError } from "../lib/apiContract";
import uploadClient, {
  type RecoverableUploadRecord,
} from "../services/uploadClient";
import type {
  AttachmentDraft,
  PersistedAttachmentDraft,
  UploadedFileMeta,
} from "../types/attachmentDraft";
import {
  ATTACHMENT_CONSTRAINTS,
  createAttachmentDraft,
  createRecoveredAttachmentDraft,
  isBlockingAttachmentDraft,
  isDuplicateFile,
  isFinalizedAttachmentDraft,
  resolveFileKind,
  toPersistedAttachmentDraft,
} from "../types/attachmentDraft";
import {
  DEFAULT_ALLOWED_UPLOAD_MIME_TYPES,
  resolveUploadCategoryForMimeType,
  resolveUploadMaxBytesForFile,
  resolveUploadMimeTypeForFile,
  validateUploadFileType,
} from "../utils/uploadPolicy";

export interface UseUploadQueueOptions {
  conversationId: string | undefined;
  concurrency?: number;
}

export interface UseUploadQueueReturn {
  drafts: AttachmentDraft[];
  addFiles: (files: File[]) => UploadQueueAddFilesResult;
  removeDraft: (localId: string) => void;
  cancelUpload: (localId: string) => void;
  retryUpload: (localId: string) => void;
  clearAll: () => void;
  acknowledgeSent: () => void;
  hasReadyDrafts: boolean;
  hasUploadingDrafts: boolean;
  hasFailedDrafts: boolean;
  getReadyMeta: () => UploadedFileMeta[];
  activeCount: number;
}

export interface UploadQueueAddFilesResult {
  acceptedCount: number;
  rejectedCount: number;
  errors: string[];
}

const DEFAULT_CONCURRENCY = 3;
const STORAGE_PREFIX = "uploadDraft:";

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};

const storageKeyForConversation = (conversationId: string) =>
  `${STORAGE_PREFIX}${conversationId}`;

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; code?: string };
  return (
    value.name === "AbortError" ||
    value.name === "CanceledError" ||
    value.code === "ERR_CANCELED"
  );
};

const isSignedUrlExpiredError = (error: unknown): boolean => {
  const apiError = extractApiError(error);
  return apiError.statusCode === 403;
};

const readPersistedDrafts = (
  conversationId: string,
): PersistedAttachmentDraft[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(
      storageKeyForConversation(conversationId),
    );
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PersistedAttachmentDraft =>
            Boolean(item) && typeof item === "object",
        )
      : [];
  } catch {
    return [];
  }
};

const persistDrafts = (conversationId: string, drafts: AttachmentDraft[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const persisted = drafts
      .filter((draft) => draft.status !== "removed")
      .map(toPersistedAttachmentDraft);

    if (persisted.length === 0) {
      window.sessionStorage.removeItem(storageKeyForConversation(conversationId));
      return;
    }

    window.sessionStorage.setItem(
      storageKeyForConversation(conversationId),
      JSON.stringify(persisted),
    );
  } catch {
    // Ignore sessionStorage failures to avoid breaking uploads.
  }
};

const removePersistedDrafts = (conversationId?: string) => {
  if (!conversationId || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKeyForConversation(conversationId));
  } catch {
    // Ignore storage errors.
  }
};

const normalizeRecoveredDraftStatus = (
  draft: AttachmentDraft,
  interruptedUploadMessage: string,
): AttachmentDraft => {
  if (draft.status === "finalized" || draft.status === "attached") {
    return draft;
  }

  if (draft.status === "expired" || draft.status === "removed") {
    return draft;
  }

  return {
    ...draft,
    status: "failed",
    progress: 0,
    errorCode: "UPLOAD_REQUIRES_READD",
    errorMessage: interruptedUploadMessage,
  };
};

const buildRecoveredDraft = (
  record: RecoverableUploadRecord,
  conversationId: string,
): AttachmentDraft => ({
  localId: `recovered-${record.uploadId}`,
  file: null,
  uploadId: record.uploadId,
  fileId: record.fileId,
  purpose: record.purpose,
  conversationId,
  filename: record.filename,
  mimeType: record.mimeType,
  sizeBytes: record.sizeBytes,
  kind: resolveFileKind({
    name: record.filename,
    type: record.mimeType,
  }),
  progress: 100,
  status: "finalized",
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  retryCount: 0,
  uploaded: uploadClient.attachToMessageDraft({
    uploadId: record.uploadId,
    fileId: record.fileId,
    purpose: record.purpose,
    filename: record.filename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    duration: record.duration,
    thumbnailUrl: record.thumbnailUrl,
  }),
});

const mergeRecoveredDrafts = (
  currentDrafts: AttachmentDraft[],
  recoveredDrafts: RecoverableUploadRecord[],
  conversationId: string,
): AttachmentDraft[] => {
  const nextDrafts = [...currentDrafts];

  for (const recovered of recoveredDrafts) {
    const existingIndex = nextDrafts.findIndex(
      (draft) =>
        draft.uploadId === recovered.uploadId || draft.fileId === recovered.fileId,
    );

    const recoveredDraft = buildRecoveredDraft(recovered, conversationId);

    if (existingIndex >= 0) {
      nextDrafts[existingIndex] = {
        ...nextDrafts[existingIndex],
        ...recoveredDraft,
      };
      continue;
    }

    nextDrafts.push(recoveredDraft);
  }

  return nextDrafts;
};

const resolveUploadError = (
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): { code: string; message: string; statusCode: number } => {
  const apiError = extractApiError(error);
  const code = String(apiError.code || "UPLOAD_FAILED");

  if (code === "UNSUPPORTED_MIME_TYPE") {
    return {
      code,
      statusCode: apiError.statusCode,
      message: t("error:upload.unsupportedType", {
        defaultValue: "Unsupported file type",
      }),
    };
  }

  if (code === "MIME_EXTENSION_MISMATCH") {
    return {
      code,
      statusCode: apiError.statusCode,
      message: t("error:upload.mimeExtensionMismatch", {
        defaultValue: "File extension does not match file type",
      }),
    };
  }

  if (
    apiError.statusCode === 413 ||
    apiError.code === ErrorCode.PAYLOAD_TOO_LARGE ||
    apiError.code === ErrorCode.FILE_TOO_LARGE
  ) {
    return {
      code: "FILE_TOO_LARGE",
      statusCode: apiError.statusCode,
      message: t("error:upload.tooLarge", {
        defaultValue: "File too large",
      }),
    };
  }

  if (apiError.statusCode === 404) {
    return {
      code: "UPLOAD_CLEANED_UP",
      statusCode: apiError.statusCode,
      message: t("error:upload.cleanedUp", {
        defaultValue: "Upload expired or was cleaned up. Please upload again.",
      }),
    };
  }

  if (apiError.statusCode === 403) {
    return {
      code: "UPLOAD_FORBIDDEN",
      statusCode: apiError.statusCode,
      message: t("error:upload.forbidden", {
        defaultValue: "You no longer have permission for this conversation.",
      }),
    };
  }

  return {
    code,
    statusCode: apiError.statusCode,
    message:
      apiError.message ||
      t("error:upload.uploadFailed", {
        defaultValue: "Upload failed",
      }),
  };
};

export function useUploadQueue({
  conversationId,
  concurrency = DEFAULT_CONCURRENCY,
}: UseUploadQueueOptions): UseUploadQueueReturn {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const abortControllers = useRef(new Map<string, AbortController>());
  const activePreviewUrls = useRef(new Set<string>());
  const draftsRef = useRef<AttachmentDraft[]>([]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const registerPreviewUrl = useCallback((previewUrl?: string) => {
    if (previewUrl) {
      activePreviewUrls.current.add(previewUrl);
    }
  }, []);

  const revokePreviewUrl = useCallback((previewUrl?: string) => {
    if (!previewUrl) {
      return;
    }

    URL.revokeObjectURL(previewUrl);
    activePreviewUrls.current.delete(previewUrl);
  }, []);

  const updateDraft = useCallback(
    (
      localId: string,
      updater: Partial<AttachmentDraft> | ((draft: AttachmentDraft) => AttachmentDraft),
    ) => {
      setDrafts((current) =>
        current.map((draft) => {
          if (draft.localId !== localId) {
            return draft;
          }

          return typeof updater === "function"
            ? updater(draft)
            : { ...draft, ...updater };
        }),
      );
    },
    [],
  );

  const abandonDraft = useCallback(async (draft: AttachmentDraft, reason: string) => {
    if (!draft.uploadId) {
      return;
    }

    try {
      await uploadClient.abandonUpload({
        uploadId: draft.uploadId,
        reason,
      });
    } catch {
      // Best effort only.
    }
  }, []);

  const uploadOne = useCallback(
    async (localId: string) => {
      const draft = draftsRef.current.find((item) => item.localId === localId);
      if (!draft || !conversationId) {
        return;
      }

      if (!draft.file) {
        updateDraft(localId, {
          status: "failed",
          errorCode: "UPLOAD_REQUIRES_READD",
          errorMessage: t("error:upload.interruptedNeedsReupload", {
            defaultValue:
              "This upload was interrupted by a refresh. Please choose the file again.",
          }),
        });
        return;
      }

      try {
        const validated = uploadClient.validateUpload(draft.file, draft.purpose);
        updateDraft(localId, {
          status: "validating",
          errorCode: undefined,
          errorMessage: undefined,
          mimeType: validated.mimeType,
        });

        const reserve = async (uploadId?: string) => {
          updateDraft(localId, {
            status: "reserving",
            progress: 0,
          });

          const signed = await uploadClient.reserveUpload({
            uploadId,
            purpose: draft.purpose,
            conversationId,
            groupId: draft.groupId,
            filename: draft.filename,
            mimeType: validated.mimeType,
            sizeBytes: draft.sizeBytes,
          });

          updateDraft(localId, {
            uploadId: signed.uploadId,
            expiresAt: signed.expiresAt,
            status: "reserving",
          });

          return signed;
        };

        const uploadWithSignedUrl = async (
          signed: Awaited<ReturnType<typeof uploadClient.reserveUpload>>,
        ) => {
          const abortController = new AbortController();
          abortControllers.current.set(localId, abortController);

          updateDraft(localId, {
            status: "uploading",
            progress: 0,
          });

          try {
            await uploadClient.uploadToSignedUrl({
              signedUrl: signed.uploadUrl,
              method: signed.uploadMethod || "PUT",
              headers: {
                ...(signed.uploadHeaders || {}),
                "Content-Type": validated.mimeType,
              },
              file: draft.file!,
              abortSignal: abortController.signal,
              onProgress: (progress) => {
                updateDraft(localId, {
                  progress,
                  status: "uploading",
                });
              },
            });
          } finally {
            abortControllers.current.delete(localId);
          }
        };

        let signed = await reserve(draft.uploadId);

        try {
          await uploadWithSignedUrl(signed);
        } catch (error) {
          if (isAbortError(error)) {
            updateDraft(localId, {
              status: "cancelled",
              errorCode: "UPLOAD_CANCELLED",
              errorMessage: t("error:upload.cancelled", {
                defaultValue: "Upload cancelled",
              }),
            });
            await abandonDraft(
              {
                ...draft,
                uploadId: signed.uploadId,
              },
              "cancelled",
            );
            return;
          }

          if (isSignedUrlExpiredError(error)) {
            signed = await reserve(signed.uploadId);
            await uploadWithSignedUrl(signed);
          } else {
            throw error;
          }
        }

        updateDraft(localId, {
          status: "completing",
          progress: 100,
        });

        const completed = await uploadClient.completeUpload({
          uploadId: signed.uploadId,
          conversationId: conversationId,
          objectKey: signed.objectKey,
        });
        const attachment = completed.attachment;
        const fileId = attachment.id;
        if (!fileId) {
          throw new Error("UPLOAD_COMPLETE_MISSING_FILE_ID");
        }

        updateDraft(localId, {
          status: "finalized",
          progress: 100,
          uploadId: signed.uploadId,
          fileId,
          expiresAt: signed.expiresAt,
          errorCode: undefined,
          errorMessage: undefined,
          uploaded: uploadClient.attachToMessageDraft({
            uploadId: signed.uploadId,
            fileId,
            purpose: draft.purpose,
            filename: draft.filename,
            mimeType: draft.mimeType,
            sizeBytes: draft.sizeBytes,
            objectKey: attachment.objectKey,
            width: attachment.width,
            height: attachment.height,
            duration: attachment.duration,
            thumbnailUrl: attachment.thumbnailUrl,
          }),
        });
      } catch (error) {
        const resolved = resolveUploadError(error, t);
        updateDraft(localId, (currentDraft) => ({
          ...currentDraft,
          status:
            resolved.code === "UPLOAD_CLEANED_UP" ? "expired" : "failed",
          progress: 0,
          errorCode: resolved.code,
          errorMessage: resolved.message,
          retryCount: currentDraft.retryCount + 1,
        }));
      }
    },
    [abandonDraft, conversationId, t, updateDraft],
  );

  useEffect(() => {
    if (!conversationId) {
      setDrafts([]);
      return;
    }

    for (const controller of abortControllers.current.values()) {
      controller.abort();
    }
    abortControllers.current.clear();

    const interruptedUploadMessage = t("error:upload.interruptedNeedsReupload", {
      defaultValue:
        "This upload was interrupted by a refresh. Please choose the file again.",
    });

    const hydrated = readPersistedDrafts(conversationId)
      .map(createRecoveredAttachmentDraft)
      .map((draft) =>
        normalizeRecoveredDraftStatus(draft, interruptedUploadMessage),
      );

    setDrafts(hydrated);

    let cancelled = false;
    void uploadClient
      .listRecoverableMessageDrafts({ conversationId, limit: 25 })
      .then((items) => {
        if (cancelled) {
          return;
        }
        setDrafts((current) =>
          mergeRecoveredDrafts(current, items, conversationId),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [conversationId, t]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    persistDrafts(conversationId, drafts);
  }, [conversationId, drafts]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const blockingCount = drafts.filter(isBlockingAttachmentDraft).length;
    if (blockingCount >= concurrency) {
      return;
    }

    const queuedDrafts = drafts
      .filter((draft) => draft.status === "idle")
      .slice(0, Math.max(0, concurrency - blockingCount));

    for (const draft of queuedDrafts) {
      void uploadOne(draft.localId);
    }
  }, [concurrency, conversationId, drafts, uploadOne]);

  useEffect(() => {
    const nextPreviewUrls = new Set(
      drafts
        .map((draft) => draft.previewUrl)
        .filter((previewUrl): previewUrl is string => Boolean(previewUrl)),
    );

    for (const previewUrl of Array.from(activePreviewUrls.current)) {
      if (!nextPreviewUrls.has(previewUrl)) {
        revokePreviewUrl(previewUrl);
      }
    }

    for (const previewUrl of nextPreviewUrls) {
      activePreviewUrls.current.add(previewUrl);
    }
  }, [drafts, revokePreviewUrl]);

  useEffect(
    () => () => {
      for (const controller of abortControllers.current.values()) {
        controller.abort();
      }
      abortControllers.current.clear();
      for (const previewUrl of Array.from(activePreviewUrls.current)) {
        revokePreviewUrl(previewUrl);
      }
    },
    [revokePreviewUrl],
  );

  const addFiles = useCallback(
    (files: File[]): UploadQueueAddFilesResult => {
      const allowedTypes = new Set<string>(DEFAULT_ALLOWED_UPLOAD_MIME_TYPES);
      const result: UploadQueueAddFilesResult = {
        acceptedCount: 0,
        rejectedCount: 0,
        errors: [],
      };

      setDrafts((currentDrafts) => {
        const nextDrafts = [...currentDrafts];

        for (const file of files) {
          const activeDrafts = nextDrafts.filter(
            (draft) => draft.status !== "removed",
          );

          if (
            activeDrafts.length >= ATTACHMENT_CONSTRAINTS.maxFilesPerMessage
          ) {
            result.errors.push(
              t("error:upload.tooManyFiles", {
                max: ATTACHMENT_CONSTRAINTS.maxFilesPerMessage,
                defaultValue: `You can only send up to ${ATTACHMENT_CONSTRAINTS.maxFilesPerMessage} files in one message.`,
              }),
            );
            result.rejectedCount += 1;
            break;
          }

          const maxBytesForFile = resolveUploadMaxBytesForFile(file);
          if (file.size > maxBytesForFile) {
            result.errors.push(
              t("error:upload.fileTooLargeByType", {
                name: file.name,
                limit: formatFileSize(maxBytesForFile),
                type: resolveUploadCategoryForMimeType(
                  resolveUploadMimeTypeForFile(file) ?? "",
                ),
                defaultValue: `${file.name} exceeds ${formatFileSize(maxBytesForFile)}`,
              }),
            );
            result.rejectedCount += 1;
            continue;
          }

          const resolvedMimeType = resolveUploadMimeTypeForFile(file);
          if (!resolvedMimeType || !allowedTypes.has(resolvedMimeType)) {
            result.errors.push(
              t("error:upload.unsupportedTypeNamed", {
                name: file.name,
                defaultValue: `${file.name} has an unsupported file type`,
              }),
            );
            result.rejectedCount += 1;
            continue;
          }

          const validatedType = validateUploadFileType({
            fileName: file.name,
            mimeType: resolvedMimeType,
          });
          if (!validatedType.ok) {
            result.errors.push(
              t(
                validatedType.code === "MIME_EXTENSION_MISMATCH"
                  ? "error:upload.mimeExtensionMismatch"
                  : "error:upload.unsupportedType",
                validatedType.code === "MIME_EXTENSION_MISMATCH"
                  ? {
                      defaultValue: "File extension does not match file type",
                    }
                  : { defaultValue: "Unsupported file type" },
              ),
            );
            result.rejectedCount += 1;
            continue;
          }

          const totalSize =
            activeDrafts.reduce((sum, draft) => sum + draft.sizeBytes, 0) +
            file.size;
          if (totalSize > ATTACHMENT_CONSTRAINTS.maxTotalSize) {
            result.errors.push(
              t("error:upload.totalSizeTooLarge", {
                defaultValue:
                  "Total attachment size must stay under 450 MB per message.",
              }),
            );
            result.rejectedCount += 1;
            break;
          }

          const duplicate = activeDrafts.some((draft) =>
            isDuplicateFile(draft, file),
          );
          if (duplicate) {
            result.rejectedCount += 1;
            continue;
          }

          const draft = createAttachmentDraft(file, {
            purpose: "message_attachment",
            conversationId,
          });
          registerPreviewUrl(draft.previewUrl);
          nextDrafts.push(draft);
          result.acceptedCount += 1;
        }

        return nextDrafts;
      });

      return result;
    },
    [conversationId, registerPreviewUrl, t],
  );

  const removeDraft = useCallback(
    (localId: string) => {
      const draft = draftsRef.current.find((item) => item.localId === localId);
      if (!draft) {
        return;
      }

      const controller = abortControllers.current.get(localId);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(localId);
      }

      revokePreviewUrl(draft.previewUrl);
      setDrafts((current) => current.filter((item) => item.localId !== localId));
      void abandonDraft(draft, "removed");
    },
    [abandonDraft, revokePreviewUrl],
  );

  const cancelUpload = useCallback((localId: string) => {
    const controller = abortControllers.current.get(localId);
    if (controller) {
      controller.abort();
    }
  }, []);

  const retryUpload = useCallback(
    (localId: string) => {
      updateDraft(localId, (draft) => {
        if (!draft.file && !isFinalizedAttachmentDraft(draft)) {
          return {
            ...draft,
            status: "failed",
            errorCode: "UPLOAD_REQUIRES_READD",
            errorMessage: t("error:upload.interruptedNeedsReupload", {
              defaultValue:
                "This upload was interrupted by a refresh. Please choose the file again.",
            }),
          };
        }

        return {
          ...draft,
          status: "idle",
          progress: 0,
          errorCode: undefined,
          errorMessage: undefined,
        };
      });
    },
    [t, updateDraft],
  );

  const clearAll = useCallback(() => {
    const currentDrafts = draftsRef.current;
    for (const controller of abortControllers.current.values()) {
      controller.abort();
    }
    abortControllers.current.clear();
    for (const draft of currentDrafts) {
      revokePreviewUrl(draft.previewUrl);
      void abandonDraft(draft, "removed");
    }
    setDrafts([]);
    removePersistedDrafts(conversationId);
  }, [abandonDraft, conversationId, revokePreviewUrl]);

  const acknowledgeSent = useCallback(() => {
    for (const draft of draftsRef.current) {
      revokePreviewUrl(draft.previewUrl);
    }
    setDrafts([]);
    removePersistedDrafts(conversationId);
  }, [conversationId, revokePreviewUrl]);

  const activeDrafts = useMemo(
    () => drafts.filter((draft) => draft.status !== "removed"),
    [drafts],
  );

  const hasReadyDrafts = activeDrafts.some(isFinalizedAttachmentDraft);
  const hasUploadingDrafts = activeDrafts.some(isBlockingAttachmentDraft);
  const hasFailedDrafts = activeDrafts.some((draft) =>
    ["failed", "expired", "cancelled"].includes(draft.status),
  );

  const getReadyMeta = useCallback((): UploadedFileMeta[] => {
    return drafts
      .filter(isFinalizedAttachmentDraft)
      .map((draft) => {
        if (draft.uploaded) {
          return draft.uploaded;
        }

        return uploadClient.attachToMessageDraft({
          uploadId: draft.uploadId!,
          fileId: draft.fileId!,
          purpose: draft.purpose,
          filename: draft.filename,
          mimeType: draft.mimeType,
          sizeBytes: draft.sizeBytes,
        });
      });
  }, [drafts]);

  return {
    drafts: activeDrafts,
    addFiles,
    removeDraft,
    cancelUpload,
    retryUpload,
    clearAll,
    acknowledgeSent,
    hasReadyDrafts,
    hasUploadingDrafts,
    hasFailedDrafts,
    getReadyMeta,
    activeCount: activeDrafts.length,
  };
}

export default useUploadQueue;
