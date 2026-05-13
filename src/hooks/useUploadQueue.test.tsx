import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";

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
      "uploadDraft:conv-a",
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
      "uploadDraft:conv-b",
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
      ({ conversationId }) => useUploadQueue({ conversationId }),
      {
        initialProps: { conversationId: "conv-a" as string | undefined },
      },
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
      expect(result.current.drafts[0]?.filename).toBe("a.png");
    });

    rerender({ conversationId: "conv-b" });

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
      .mockRejectedValueOnce({ status: 403, statusCode: 403, message: "expired" })
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
      useUploadQueue({ conversationId: "conv-a" }),
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
});
