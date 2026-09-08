import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  media: [] as Array<Record<string, unknown>>,
  files: [] as Array<Record<string, unknown>>,
  gallery: [] as Array<{ canPreview?: boolean; canDownload?: boolean }>,
  fetchThumbnailUrlsShared: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

vi.mock("../../../features/api/chatApi", () => ({
  useGetConversationMediaQuery: () => ({
    data: {
      data: testState.media,
      pagination: { page: 1, limit: 18, total: testState.media.length, hasNext: false },
    },
    isLoading: false,
    isFetching: false,
  }),
  useGetConversationFilesQuery: () => ({
    data: {
      data: testState.files,
      pagination: { page: 1, limit: 15, total: testState.files.length, hasNext: false },
    },
    isLoading: false,
    isFetching: false,
  }),
  useGetConversationLinksQuery: () => ({
    data: { data: [], pagination: { page: 1, limit: 15, total: 0, hasNext: false } },
    isLoading: false,
    isFetching: false,
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
  downloadResourceWithName: vi.fn(),
}));

vi.mock("../../../config", () => ({
  resolvePublicResourceUrl: (value: string) => value,
}));

vi.mock("../../../hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock("../../common/resource-filter/ResourceFilterBar", () => ({
  ResourceFilterBar: () => null,
}));

vi.mock("../../common/resource-filter/resourceFilter", () => ({
  EMPTY_RESOURCE_FILTERS: {},
  collectSenders: () => [],
  formatDayHeading: () => "Hôm nay",
  groupByDay: (items: Array<Record<string, unknown>>) =>
    items.length > 0 ? [{ iso: "2026-09-08", items }] : [],
  matchesFilters: () => true,
}));

vi.mock("../../ui", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <>{children}</> : null,
  Skeleton: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../message/FileTypeIcon", () => ({ FileTypeIcon: () => null }));
vi.mock("../../common/FileName", () => ({
  FileName: ({ name }: { name: string }) => <span>{name}</span>,
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
vi.mock("./resourceCloudActions", () => ({
  saveResourceMessageToCloud: vi.fn(),
}));

import { SharedContentModal } from "./SharedContentModal";

const mediaItem = (overrides: Record<string, unknown> = {}) => ({
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

const fileItem = (overrides: Record<string, unknown> = {}) => ({
  messageId: "message-file-1",
  fileId: "file-1",
  fileName: "tệp bị chặn.pdf",
  mimeType: "application/pdf",
  sizeBytes: 128,
  senderId: "sender-1",
  senderName: "Người gửi",
  senderAvatarUrl: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

const renderModal = () =>
  render(
    <SharedContentModal
      isOpen
      onClose={vi.fn()}
      conversationId="conversation-1"
    />,
  );

describe("SharedContentModal capability gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.media = [];
    testState.files = [];
    testState.gallery = [];
    testState.fetchThumbnailUrlsShared.mockResolvedValue({});
    testState.getDownloadUrl.mockResolvedValue({ data: { url: "https://storage.example/file" } });
  });

  it("does not fetch or activate media when preview is explicitly blocked", async () => {
    testState.media = [
      mediaItem({
        canPreview: false,
        canDownload: false,
        thumbnailUrl: "https://storage.example/blocked-preview.png",
      }),
    ];

    renderModal();

    expect(screen.getByRole("button", { name: "ảnh bảo mật.png" })).toBeDisabled();
    expect(screen.getByTestId("media-thumbnail")).toHaveAttribute("data-src", "");
    await waitFor(() => {
      expect(testState.fetchThumbnailUrlsShared).not.toHaveBeenCalled();
    });
  });

  it("keeps an explicit download block in the gallery and never requests its URL", async () => {
    testState.media = [
      mediaItem({
        canPreview: true,
        canDownload: false,
        thumbnailUrl: "https://storage.example/preview.png",
      }),
    ];

    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "ảnh bảo mật.png" }));
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

  it("disables every file download entry point when downloads are blocked", () => {
    testState.files = [fileItem({ canDownload: false })];

    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    expect(screen.getByRole("button", { name: /tệp bị chặn\.pdf/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tải xuống" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Thêm"));
    const download = screen.getByRole("button", { name: "Lưu về máy" });
    expect(download).toBeDisabled();
    fireEvent.click(download);

    expect(testState.getDownloadUrl).not.toHaveBeenCalled();
  });
});
