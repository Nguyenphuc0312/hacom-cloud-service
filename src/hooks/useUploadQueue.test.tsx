import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadQueue } from "./useUploadQueue";
import { resolveUploadMimeTypeForFile } from "../utils/uploadPolicy";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string) || key,
  }),
}));

vi.mock("../features/chat/api", () => ({
  chatApi: {
    file: {
      requestUploadUrl: vi.fn(() => new Promise(() => undefined)),
      completeUpload: vi.fn(),
      toAttachment: vi.fn(),
    },
  },
}));

const makeFile = (name = "photo.png", type = "image/png") =>
  new File(["content"], name, { type });

describe("useUploadQueue ObjectURL lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    let nextId = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:upload-preview-${++nextId}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("revokes a preview ObjectURL when a draft is removed", async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conversation-1", concurrency: 0 }),
    );

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    const draft = result.current.drafts[0];
    expect(draft.previewUrl).toBe("blob:upload-preview-1");

    act(() => {
      result.current.removeDraft(draft.localId);
    });

    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:upload-preview-1",
      );
    });
  });

  it("revokes preview ObjectURLs when conversation changes", async () => {
    const { result, rerender } = renderHook(
      ({ conversationId }) =>
        useUploadQueue({ conversationId, concurrency: 0 }),
      { initialProps: { conversationId: "conversation-1" } },
    );

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    expect(result.current.drafts).toHaveLength(1);

    rerender({ conversationId: "conversation-2" });

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:upload-preview-1",
      );
    });
  });

  it("aborts an in-flight upload when cancelled", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conversation-1", concurrency: 1 }),
    );

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    await waitFor(() => {
      expect(result.current.drafts[0]?.status).toBe("uploading");
    });

    const draft = result.current.drafts[0];
    act(() => {
      result.current.cancelUpload(draft.localId);
    });

    expect(abortSpy).toHaveBeenCalled();
  });

  it("accepts supported common file types including webp and office docs", () => {
    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conversation-1", concurrency: 0 }),
    );

    act(() => {
      result.current.addFiles([
        makeFile("image.webp", "image/webp"),
        makeFile("report.pdf", "application/pdf"),
        makeFile(
          "doc.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        makeFile(
          "sheet.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        makeFile(
          "slides.pptx",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
        makeFile("archive.zip", "application/zip"),
      ]);
    });

    expect(result.current.drafts).toHaveLength(6);
  });

  it("rejects blocked executable and script-like files", () => {
    const { result } = renderHook(() =>
      useUploadQueue({ conversationId: "conversation-1", concurrency: 0 }),
    );

    let response: ReturnType<typeof result.current.addFiles> | undefined;
    act(() => {
      response = result.current.addFiles([
        makeFile("danger.exe", "application/x-msdownload"),
        makeFile("script.js", "application/javascript"),
        makeFile("index.html", "text/html"),
      ]);
    });

    expect(response?.acceptedCount).toBe(0);
    expect(response?.rejectedCount).toBe(3);
    expect(result.current.drafts).toHaveLength(0);
  });

  it("infers mime type from extension when browser file.type is empty", () => {
    const file = makeFile("image.webp", "");
    expect(resolveUploadMimeTypeForFile(file)).toBe("image/webp");
  });
});
