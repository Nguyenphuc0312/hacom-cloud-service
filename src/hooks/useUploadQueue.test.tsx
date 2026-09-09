import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";
import {
  clearPersistedUploadDrafts,
  getUploadDraftStorageKey,
} from "../services/uploadDraftStorage";

const { uploadClientMock } = vi.hoisted(() => ({
  uploadClientMock: {
    validateUpload: vi.fn(),
    reserveUpload: vi.fn(),
    uploadToSignedUrl: vi.fn(),
    completeUpload: vi.fn(),
    attachToMessageDraft: vi.fn(),
    attachToUserAvatar: vi.fn(),
    attachToGroupAvatar: vi.fn(),
    listRecoverableMessageDrafts: vi.fn(),
    abandonUpload: vi.fn(),
  },
}));
const { translateMock } = vi.hoisted(() => ({
  translateMock: (key: string, options?: Record<string, unknown>) =>
    (typeof options?.defaultValue === "string" && options.defaultValue) || key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translateMock,
  }),
}));

vi.mock("../services/uploadClient", () => ({
  __esModule: true,
  default: uploadClientMock,
}));

const storageKey = (accountId: string, conversationId: string): string =>
  getUploadDraftStorageKey(accountId, conversationId)!;

describe("useUploadQueue", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    uploadClientMock.validateUpload.mockReturnValue({
      mimeType: "image/png",
      maxBytes: 39_321_600,
      category: "image",
    });
    uploadClientMock.listRecoverableMessageDrafts.mockResolvedValue([]);
    uploadClientMock.attachToMessageDraft.mockImplementation((input) => ({
      fileId: input.fileId,
      uploadId: input.uploadId,
      mimeType: input.mimeType,
      size: input.sizeBytes,
      name: input.filename,
      purpose: input.purpose,
    }));
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("recovers finalized drafts from sessionStorage per conversation", async () => {
    window.sessionStorage.setItem(
      storageKey("account-a", "conv-a"),
      JSON.stringify([
        {
          localId: "draft-a",
          uploadId: "upload-a",
          fileId: "file-a",
          purpose: "message_attachment",
          conversationId: "conv-a",
          filename: "a.png",
          mimeType: "image/png",
          sizeBytes: 12,
          kind: "image",
          progress: 100,
          status: "finalized",
          createdAt: "2026-05-13T00:00:00.000Z",
          retryCount: 0,
          uploaded: {
            fileId: "file-a",
            uploadId: "upload-a",
            mimeType: "image/png",
            size: 12,
            name: "a.png",
            purpose: "message_attachment",
          },
        },
      ]),
    );
    window.sessionStorage.setItem(
      storageKey("account-a", "conv-b"),
      JSON.stringify([
        {
          localId: "draft-b",
          uploadId: "upload-b",
          fileId: "file-b",
          purpose: "message_attachment",
          conversationId: "conv-b",
          filename: "b.png",
          mimeType: "image/png",
          sizeBytes: 16,
          kind: "image",
          progress: 100,
          status: "finalized",
          createdAt: "2026-05-13T00:00:00.000Z",
          retryCount: 0,
          uploaded: {
            fileId: "file-b",
            uploadId: "upload-b",
            mimeType: "image/png",
            size: 16,
            name: "b.png",
            purpose: "message_attachment",
          },
        },
      ]),
    );

    const { result, rerender } = renderHook(
      ({ conversationId, accountId }) =>
        useUploadQueue({ conversationId, accountId }),
      {
        initialProps: {
          conversationId: "conv-a" as string | undefined,
          accountId: "account-a" as string | undefined,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
      expect(result.current.drafts[0]?.filename).toBe("a.png");
    });

    rerender({ conversationId: "conv-b", accountId: "account-a" });

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
      expect(result.current.drafts[0]?.filename).toBe("b.png");
    });
  });

  it("reuses uploadId when signed URL expires during retry", async () => {
    uploadClientMock.reserveUpload
      .mockResolvedValueOnce({
        uploadId: "upload-1",
        uploadUrl: "https://upload.example/1",
        signedPutUrl: "https://upload.example/1",
        uploadMethod: "PUT",
        uploadHeaders: {},
        expiresAt: "2026-05-13T01:00:00.000Z",
      })
      .mockResolvedValueOnce({
        uploadId: "upload-1",
        uploadUrl: "https://upload.example/2",
        signedPutUrl: "https://upload.example/2",
        uploadMethod: "PUT",
        uploadHeaders: {},
        expiresAt: "2026-05-13T01:05:00.000Z",
      });
    uploadClientMock.uploadToSignedUrl
      .mockRejectedValueOnce({
        status: 403,
        statusCode: 403,
        message: "expired",
      })
      .mockResolvedValueOnce(undefined);
    uploadClientMock.completeUpload.mockResolvedValue({
      uploadId: "upload-1",
      fileId: "file-1",
      attachment: {
        id: "file-1",
        width: 100,
        height: 100,
      },
    });

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await act(async () => {
      result.current.addFiles([
        new File(["hello"], "photo.png", { type: "image/png" }),
      ]);
    });

    await waitFor(() => {
      expect(uploadClientMock.reserveUpload).toHaveBeenCalledTimes(2);
    });

    expect(uploadClientMock.reserveUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        uploadId: "upload-1",
        conversationId: "conv-a",
      }),
    );

    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("finalized");
      expect(result.current.drafts[0]?.fileId).toBe("file-1");
    });
  });

  it("reserves a fresh upload session after a failed draft", async () => {
    uploadClientMock.reserveUpload
      .mockResolvedValueOnce({
        uploadId: "upload-1",
        uploadUrl: "https://upload.example/1",
        uploadMethod: "PUT",
        uploadHeaders: {},
        expiresAt: "2026-05-13T01:00:00.000Z",
      })
      .mockResolvedValueOnce({
        uploadId: "upload-2",
        uploadUrl: "https://upload.example/2",
        uploadMethod: "PUT",
        uploadHeaders: {},
        expiresAt: "2026-05-13T01:05:00.000Z",
      });
    uploadClientMock.uploadToSignedUrl
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    uploadClientMock.completeUpload.mockResolvedValue({
      uploadId: "upload-2",
      fileId: "file-2",
      attachment: { id: "file-2" },
    });
    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await act(async () => {
      result.current.addFiles([
        new File(["hello"], "drawing.cad", {
          type: "application/octet-stream",
        }),
      ]);
    });
    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("failed");
    });

    await act(async () => {
      result.current.retryUpload(result.current.drafts[0]!.localId);
    });
    await waitFor(() => {
      expect(uploadClientMock.reserveUpload).toHaveBeenCalledTimes(2);
    });
    expect(uploadClientMock.reserveUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ uploadId: undefined }),
    );
  });

  it("keeps the draft in security_pending when the backend has not released the attachment", async () => {
    uploadClientMock.reserveUpload.mockResolvedValue({
      uploadId: "upload-1",
      uploadUrl: "https://upload.example/1",
      signedPutUrl: "https://upload.example/1",
      uploadMethod: "PUT",
      uploadHeaders: {},
      expiresAt: "2026-05-13T01:00:00.000Z",
    });
    uploadClientMock.uploadToSignedUrl.mockResolvedValue(undefined);
    uploadClientMock.completeUpload.mockResolvedValue({
      uploadId: "upload-1",
      fileId: "file-1",
      releaseReason: "FILE_SCAN_PENDING",
      attachment: {
        id: "file-1",
        canAttach: false,
        canDownload: false,
        canPreview: false,
        releaseStatus: "blocked",
        releaseReason: "FILE_SCAN_PENDING",
      },
    });

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await act(async () => {
      result.current.addFiles([
        new File(["hello"], "photo.png", { type: "image/png" }),
      ]);
    });

    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("security_pending");
      expect(result.current.drafts[0]?.errorCode).toBe("FILE_SCAN_PENDING");
    });
  });

  it("keeps a canceled reservation from starting a late PUT", async () => {
    let resolveReserve!: (value: {
      uploadId: string;
      uploadUrl: string;
      uploadMethod: string;
      uploadHeaders: Record<string, string>;
      expiresAt: string;
    }) => void;
    uploadClientMock.reserveUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveReserve = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await act(async () => {
      result.current.addFiles([
        new File(["hello"], "photo.png", { type: "image/png" }),
      ]);
    });
    await waitFor(() => {
      expect(uploadClientMock.reserveUpload).toHaveBeenCalledTimes(1);
    });

    const localId = result.current.drafts[0]!.localId;
    await act(async () => {
      result.current.cancelUpload(localId);
    });
    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("cancelled");
    });

    await act(async () => {
      resolveReserve({
        uploadId: "upload-late",
        uploadUrl: "https://upload.example/late",
        uploadMethod: "PUT",
        uploadHeaders: {},
        expiresAt: "2026-05-13T01:00:00.000Z",
      });
    });

    await waitFor(() => {
      expect(uploadClientMock.abandonUpload).toHaveBeenCalledWith({
        uploadId: "upload-late",
        reason: "cancelled",
      });
    });
    expect(uploadClientMock.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(result.current.drafts[0]?.status).toBe("cancelled");
  });

  it("keeps a late complete response from finalizing a canceled draft", async () => {
    uploadClientMock.reserveUpload.mockResolvedValue({
      uploadId: "upload-1",
      uploadUrl: "https://upload.example/1",
      uploadMethod: "PUT",
      uploadHeaders: {},
      expiresAt: "2026-05-13T01:00:00.000Z",
    });
    uploadClientMock.uploadToSignedUrl.mockResolvedValue(undefined);

    let resolveComplete!: (value: {
      uploadId: string;
      fileId: string;
      attachment: { id: string };
    }) => void;
    uploadClientMock.completeUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveComplete = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await act(async () => {
      result.current.addFiles([
        new File(["hello"], "photo.png", { type: "image/png" }),
      ]);
    });
    await waitFor(() => {
      expect(uploadClientMock.completeUpload).toHaveBeenCalledWith({
        uploadId: "upload-1",
        conversationId: "conv-a",
        objectKey: undefined,
      });
    });

    const localId = result.current.drafts[0]!.localId;
    await act(async () => {
      result.current.cancelUpload(localId);
    });
    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("cancelled");
    });

    await act(async () => {
      resolveComplete({
        uploadId: "upload-1",
        fileId: "file-1",
        attachment: { id: "file-1" },
      });
    });

    await waitFor(() => {
      expect(uploadClientMock.abandonUpload).toHaveBeenCalledWith({
        uploadId: "upload-1",
        reason: "cancelled",
      });
    });
    expect(result.current.drafts[0]?.status).toBe("cancelled");
    expect(result.current.drafts[0]?.fileId).toBeUndefined();
    expect(uploadClientMock.attachToMessageDraft).not.toHaveBeenCalled();
  });

  it("keeps recovered drafts account-scoped and clears the prior account on an identity switch", async () => {
    window.sessionStorage.setItem(
      storageKey("account-a", "conv-a"),
      JSON.stringify([
        {
          localId: "draft-a",
          uploadId: "upload-a",
          fileId: "file-a",
          purpose: "message_attachment",
          conversationId: "conv-a",
          filename: "a.png",
          mimeType: "image/png",
          sizeBytes: 12,
          kind: "image",
          progress: 100,
          status: "finalized",
          createdAt: "2026-05-13T00:00:00.000Z",
          retryCount: 0,
        },
      ]),
    );

    const { result, rerender } = renderHook(
      ({ accountId }) =>
        useUploadQueue({ conversationId: "conv-a", accountId }),
      { initialProps: { accountId: "account-a" as string | undefined } },
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
    });

    rerender({ accountId: "account-b" });

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(0);
      expect(
        window.sessionStorage.getItem(storageKey("account-a", "conv-a")),
      ).toBeNull();
    });
  });

  it("never recovers unsafe legacy draft keys", async () => {
    window.sessionStorage.setItem(
      "uploadDraft:conv-a",
      JSON.stringify([{ localId: "legacy", status: "finalized" }]),
    );

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await waitFor(() => {
      expect(window.sessionStorage.getItem("uploadDraft:conv-a")).toBeNull();
      expect(result.current.drafts).toHaveLength(0);
    });
  });

  it("persists one logical batch id, blocks partial metadata, and clears only the acknowledged batch", async () => {
    const persistedDrafts = [
      {
        localId: "draft-a",
        uploadId: "upload-a",
        fileId: "file-a",
        purpose: "message_attachment",
        conversationId: "conv-a",
        filename: "a.png",
        mimeType: "image/png",
        sizeBytes: 12,
        kind: "image",
        progress: 100,
        status: "finalized",
        createdAt: "2026-05-13T00:00:00.000Z",
        retryCount: 0,
      },
      {
        localId: "draft-b",
        uploadId: "upload-b",
        fileId: "file-b",
        purpose: "message_attachment",
        conversationId: "conv-a",
        filename: "b.png",
        mimeType: "image/png",
        sizeBytes: 16,
        kind: "image",
        progress: 100,
        status: "finalized",
        createdAt: "2026-05-13T00:00:00.000Z",
        retryCount: 0,
      },
    ];
    window.sessionStorage.setItem(
      storageKey("account-a", "conv-a"),
      JSON.stringify(persistedDrafts),
    );

    const first = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    let batchId = "";
    await waitFor(() => {
      batchId = first.result.current.getReadyBatchClientMessageId() || "";
      expect(batchId).not.toBe("");
      expect(
        first.result.current.drafts.every(
          (draft) => draft.clientMessageId === batchId,
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      const stored = JSON.parse(
        window.sessionStorage.getItem(storageKey("account-a", "conv-a")) ||
          "[]",
      ) as Array<{ clientMessageId?: string }>;
      expect(stored).toHaveLength(2);
      expect(stored.every((draft) => draft.clientMessageId === batchId)).toBe(
        true,
      );
    });

    first.result.current.acknowledgeSent("other-batch");
    expect(first.result.current.drafts).toHaveLength(2);
    first.unmount();

    const second = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );
    await waitFor(() => {
      expect(second.result.current.getReadyBatchClientMessageId()).toBe(
        batchId,
      );
    });

    second.result.current.acknowledgeSent(batchId);
    await waitFor(() => {
      expect(second.result.current.drafts).toHaveLength(0);
      expect(
        window.sessionStorage.getItem(storageKey("account-a", "conv-a")),
      ).toBeNull();
    });
  });

  it("does not expose a finalized subset as a ready batch", async () => {
    window.sessionStorage.setItem(
      storageKey("account-a", "conv-a"),
      JSON.stringify([
        {
          localId: "draft-ready",
          uploadId: "upload-ready",
          fileId: "file-ready",
          purpose: "message_attachment",
          conversationId: "conv-a",
          filename: "ready.png",
          mimeType: "image/png",
          sizeBytes: 12,
          kind: "image",
          progress: 100,
          status: "finalized",
          createdAt: "2026-05-13T00:00:00.000Z",
          retryCount: 0,
        },
        {
          localId: "draft-failed",
          purpose: "message_attachment",
          conversationId: "conv-a",
          filename: "failed.png",
          mimeType: "image/png",
          sizeBytes: 16,
          kind: "image",
          progress: 0,
          status: "failed",
          createdAt: "2026-05-13T00:00:00.000Z",
          retryCount: 1,
        },
      ]),
    );

    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conv-a", accountId: "account-a" }),
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(2);
      expect(result.current.getReadyBatchClientMessageId()).toBeUndefined();
      expect(result.current.getReadyMeta()).toEqual([]);
    });
  });

  it("clears every scoped draft during global logout cleanup", () => {
    window.sessionStorage.setItem(storageKey("account-a", "conv-a"), "[]");
    window.sessionStorage.setItem(storageKey("account-b", "conv-b"), "[]");
    window.sessionStorage.setItem("uploadDraft:legacy", "[]");

    clearPersistedUploadDrafts();

    expect(
      window.sessionStorage.getItem(storageKey("account-a", "conv-a")),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(storageKey("account-b", "conv-b")),
    ).toBeNull();
    expect(window.sessionStorage.getItem("uploadDraft:legacy")).toBeNull();
  });
});
