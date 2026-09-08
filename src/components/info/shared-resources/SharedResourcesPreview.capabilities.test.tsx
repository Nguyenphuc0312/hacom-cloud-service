import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  summary: null as unknown,
  gallery: [] as Array<{ canPreview?: boolean; canDownload?: boolean }>,
  fetchThumbnailUrlsShared: vi.fn(),
  getDownloadUrl: vi.fn(),
  downloadResourceWithName: vi.fn(),
  markFileDownloaded: vi.fn(),
}));

vi.mock("../../../features/api/chatApi", () => ({
  useGetConversationSidebarSummaryQuery: () => ({
    data: testState.summary,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../../stores", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "viewer-1" } }),
  useChatStore: (
    selector: (state: { conversationById: Record<string, { type: string }> }) => unknown,
  ) => selector({ conversationById: { "conversation-1": { type: "DIRECT" } } }),
}));

vi.mock("../../../stores/enrichedProfileStore", () => ({
  useResolvedName: (_userId: string, fallback: string) => fallback,
}));

vi.mock("../../../services/api", () => ({
  fileApi: { getDownloadUrl: testState.getDownloadUrl },
  messageApi: { deleteMessage: vi.fn() },
}));

vi.mock("../../../hooks/useBatchThumbnailUrl", () => ({
  fetchThumbnailUrlsShared: testState.fetchThumbnailUrlsShared,
}));

vi.mock("../../../utils/downloadFile", () => ({
  downloadResourceWithName: testState.downloadResourceWithName,
}));

vi.mock("../../../config", () => ({
  resolvePublicResourceUrl: (value: string) => value,
}));

vi.mock("../../../utils/downloadedFiles", () => ({
  isFileDownloaded: () => false,
  markFileDownloaded: testState.markFileDownloaded,
  subscribeDownloadedFiles: () => () => undefined,
}));

vi.mock("../../ui", () => ({
  Skeleton: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../common/MediaThumbnail", () => ({
  MediaThumbnail: ({ src }: { src?: string | null }) => (
    <div data-testid="media-thumbnail" data-src={src ?? ""} />
  ),
}));

vi.mock("../../modals/ImagePreviewModal", () => ({
  ImagePreviewModal: ({
    isOpen,
    images,
  }: {
    isOpen: boolean;
    images?: Array<{ canPreview?: boolean; canDownload?: boolean }>;
  }) => {
    if (isOpen) testState.gallery = images ?? [];
    return isOpen ? <div data-testid="image-preview" /> : null;
  },
}));

vi.mock("../../chat/ForwardModal", () => ({ ForwardModal: () => null }));
vi.mock("./VideoPlayerModal", () => ({ VideoPlayerModal: () => null }));
vi.mock("./SharedContentModal", () => ({ SharedContentModal: () => null }));
vi.mock("./resourceCloudActions", () => ({
  saveResourceMessageToCloud: vi.fn(),
}));

import { SharedResourcesPreview } from "./SharedResourcesPreview";

const mediaItem = (
  overrides: Record<string, unknown> = {},
) => ({
  messageId: "message-media-1",
  fileId: "file-media-1",
  messageType: "image",
  fileName: "ảnh bảo mật.png",
  mimeType: "image/png",
  sizeBytes: 128,
  width: 100,
  height: 100,
  durationMs: null,
  thumbnailUrl: null,
  senderId: "sender-1",
  senderName: "Người gửi",
  senderAvatarUrl: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

const summaryWith = (media: Record<string, unknown>[]) => ({
  conversationId: "conversation-1",
  members: { total: 0, preview: [] },
  media: { total: media.length, preview: media },
  files: { total: 0, preview: [] },
  links: { total: 0, preview: [] },
});

const summaryWithFiles = (files: Record<string, unknown>[]) => ({
  conversationId: "conversation-1",
  members: { total: 0, preview: [] },
  media: { total: 0, preview: [] },
  files: { total: files.length, preview: files },
  links: { total: 0, preview: [] },
});

const fileItem = (overrides: Record<string, unknown> = {}) => ({
  messageId: "message-file-1",
  fileId: "file-document-1",
  messageType: "file",
  fileName: "tai-lieu.pdf",
  mimeType: "application/pdf",
  sizeBytes: 128,
  senderId: "sender-1",
  senderName: "Người gửi",
  senderAvatarUrl: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

describe("SharedResourcesPreview capability gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.gallery = [];
    testState.fetchThumbnailUrlsShared.mockResolvedValue({});
    testState.getDownloadUrl.mockResolvedValue({ success: true, data: { url: "https://storage.example/file" } });
    testState.downloadResourceWithName.mockResolvedValue(undefined);
  });

  it("does not fetch a thumbnail or activate a media tile when preview is explicitly blocked", async () => {
    testState.summary = summaryWith([
      mediaItem({
        canPreview: false,
        canDownload: false,
        thumbnailUrl: "https://storage.example/blocked-preview.png",
      }),
    ]);

    render(<SharedResourcesPreview conversationId="conversation-1" />);

    expect(
      screen.getByRole("button", { name: "ảnh bảo mật.png" }),
    ).toBeDisabled();
    expect(screen.getByTestId("media-thumbnail")).toHaveAttribute("data-src", "");
    await waitFor(() => {
      expect(testState.fetchThumbnailUrlsShared).not.toHaveBeenCalled();
    });
  });

  it("keeps an explicit download block in the gallery and does not request a download URL", async () => {
    testState.summary = summaryWith([
      mediaItem({
        canPreview: true,
        canDownload: false,
        thumbnailUrl: "https://storage.example/preview.png",
      }),
    ]);

    render(<SharedResourcesPreview conversationId="conversation-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "ảnh bảo mật.png" }),
    );
    await waitFor(() => {
      expect(testState.gallery).toEqual([
        expect.objectContaining({ canPreview: true, canDownload: false }),
      ]);
    });

    fireEvent.click(screen.getByLabelText("Thêm"));
    const download = screen.getByRole("button", { name: "Lưu về máy" });
    expect(download).toBeDisabled();
    fireEvent.click(download);

    expect(testState.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not mark a browser handoff as a locally saved file", async () => {
    testState.summary = summaryWithFiles([fileItem()]);

    render(<SharedResourcesPreview conversationId="conversation-1" />);

    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    fireEvent.click((await screen.findAllByTitle("tai-lieu.pdf"))[0]);

    await waitFor(() => {
      expect(testState.downloadResourceWithName).toHaveBeenCalledWith(
        "https://storage.example/file",
        "tai-lieu.pdf",
      );
    });
    expect(testState.markFileDownloaded).not.toHaveBeenCalled();
  });
});
