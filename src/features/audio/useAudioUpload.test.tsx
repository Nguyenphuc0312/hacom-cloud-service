import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { ApiContractError } from "../../lib/apiContract";
import { useAudioUpload, AudioUploadError } from "./useAudioUpload";

const uploadClientMock = vi.hoisted(() => ({
  reserveUpload: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  completeUpload: vi.fn(),
}));

vi.mock("../../services/uploadClient", () => ({
  default: uploadClientMock,
}));

const clip = {
  blob: new Blob(["audio"], { type: "audio/webm" }),
  mimeType: "audio/webm",
  sizeBytes: 5,
  durationMs: 1200,
  url: "blob:voice",
};

describe("useAudioUpload", () => {
  beforeEach(() => {
    uploadClientMock.reserveUpload.mockResolvedValue({
      uploadId: "upload-1",
      uploadUrl: "https://storage.example/upload-1",
      uploadMethod: "PUT",
      uploadHeaders: {},
      objectKey: "conv-1/user-1/upload-1-voice.webm",
    });
    uploadClientMock.uploadToSignedUrl.mockResolvedValue(undefined);
    uploadClientMock.completeUpload.mockResolvedValue({
      uploadId: "upload-1",
      fileId: "file-1",
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses the authenticated upload client for audio reserve, storage upload, and complete", async () => {
    const { result } = renderHook(() => useAudioUpload());

    await act(async () => {
      await expect(
        result.current.uploadAudio({
          clip,
          conversationId: "conv-1",
          clientMessageId: "client-1",
          durationMs: clip.durationMs,
        }),
      ).resolves.toEqual({ fileId: "file-1", uploadId: "upload-1" });
    });

    expect(uploadClientMock.reserveUpload).toHaveBeenCalledWith({
      filename: expect.stringMatching(/^voice-\d+\.webm$/),
      mimeType: "audio/webm",
      sizeBytes: 5,
      durationMs: 1200,
      purpose: "message_attachment",
      conversationId: "conv-1",
      clientMessageId: "client-1",
    });
    expect(uploadClientMock.uploadToSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        signedUrl: "https://storage.example/upload-1",
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "audio/webm" }),
      }),
    );
    expect(uploadClientMock.completeUpload).toHaveBeenCalledWith({
      uploadId: "upload-1",
      conversationId: "conv-1",
      objectKey: "conv-1/user-1/upload-1-voice.webm",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("maps upload-url 401 after refresh failure to authentication error instead of recording failure", async () => {
    uploadClientMock.reserveUpload.mockRejectedValueOnce(
      new ApiContractError("Session expired", {
        statusCode: 401,
        code: ErrorCode.UNAUTHORIZED,
      }),
    );

    const { result } = renderHook(() => useAudioUpload());

    await act(async () => {
      await expect(
        result.current.uploadAudio({
          clip,
          conversationId: "conv-1",
          clientMessageId: "client-1",
          durationMs: clip.durationMs,
        }),
      ).rejects.toMatchObject({
        name: "AudioUploadError",
        code: "AUTHENTICATION_REQUIRED",
        statusCode: 401,
      } satisfies Partial<AudioUploadError>);
    });

    await waitFor(() => {
      expect(result.current.uploadState).toMatchObject({
        phase: "failed",
        errorCode: "AUTHENTICATION_REQUIRED",
      });
    });
    expect(uploadClientMock.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
