import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileType,
  MessageStatus,
  MessageType,
  type Attachment,
  type Message,
} from "../../../types";

const testState = vi.hoisted(() => {
  const openPreview = vi.fn();
  const refetchMessages = vi.fn().mockResolvedValue(undefined);
  return {
    messages: [] as Message[],
    openPreview,
    refetchMessages,
    joinConversation: vi.fn(),
    leaveConversation: vi.fn(),
    filePreview: {
      isOpen: false,
      current: null,
      currentIndex: 0,
      totalItems: 0,
      secureUrl: null,
      isLoadingUrl: false,
      urlError: null,
      hasPrev: false,
      hasNext: false,
      open: openPreview,
      close: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
      refreshUrl: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("../../../components/layout/ConversationLane", () => ({
  ConversationLane: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("../../../components/chat/ChatHeader", () => ({
  ChatHeader: () => <header>Cloud của tôi</header>,
}));

vi.mock("../../../components/input/MessageInput", () => ({
  MessageInput: () => <div data-testid="cloud-input" />,
}));

vi.mock("../../../components/chat/ForwardModal", () => ({
  ForwardModal: () => null,
}));

vi.mock("../../../components/chat/PinnedMessageBar", () => ({
  PinnedMessageBar: () => null,
}));

vi.mock("../../../hooks", () => ({
  usePinnedMessages: () => ({
    pinnedMessages: [],
    isLoading: false,
    error: null,
    togglePin: vi.fn(),
  }),
  useMobileViewportMetrics: () => ({ width: 1280, height: 800 }),
}));

vi.mock("../../chat/simple-virtual-timeline", () => ({
  SimpleVirtualizedChatTimeline: ({
    messages,
    onFilePreview,
  }: {
    messages: readonly Message[];
    onFilePreview?: (attachment: Attachment) => void;
  }) => (
    <div>
      {messages.flatMap((message) =>
        (message.attachments ?? []).map((attachment) => (
          <button
            key={attachment.id}
            type="button"
            onClick={() => onFilePreview?.(attachment)}
          >
            open {attachment.fileName}
          </button>
        )),
      )}
    </div>
  ),
}));

vi.mock("../../api/chatApi", () => ({
  useGetMessagesQuery: () => ({
    data: { messages: testState.messages },
    isLoading: false,
    refetch: testState.refetchMessages,
  }),
}));

vi.mock("../../../stores", () => ({
  useAuthStore: (
    selector: (state: { user: { id: string; displayName: string } }) => unknown,
  ) => selector({ user: { id: "user-1", displayName: "Minh Nhật" } }),
  useChatStore: (
    selector: (state: { conversationById: Record<string, object> }) => unknown,
  ) => selector({
    conversationById: {
      "cloud-conversation": {
        id: "cloud-conversation",
        type: "personal_cloud",
        name: "Cloud của tôi",
      },
    },
  }),
}));

vi.mock("../../../stores/uiStore", () => ({
  useUIStore: (
    selector: (state: { chatDensity: "comfortable" }) => unknown,
  ) => selector({ chatDensity: "comfortable" }),
}));

vi.mock("../../realtime/GlobalWebSocketProvider", () => ({
  useGlobalWebSocket: () => ({
    joinConversation: testState.joinConversation,
    leaveConversation: testState.leaveConversation,
  }),
}));

vi.mock("../api/cloudApi", () => ({
  cloudApi: {
    ensure: vi.fn().mockResolvedValue({
      conversationId: "cloud-conversation",
      quota: null,
      maxUploadBytes: 1024,
    }),
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    note: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  },
  deleteCloudAssetForMessage: vi.fn(),
}));

vi.mock("../../../services/api", () => ({
  messageApi: { deleteMessage: vi.fn() },
}));

vi.mock("../../../lib/socket", () => ({
  default: { on: vi.fn(), off: vi.fn() },
}));

vi.mock("../hooks/useCloudUploadQueue", () => ({
  useCloudUploadQueue: () => ({
    drafts: [],
    hasUploadingDrafts: false,
    hasFailedDrafts: false,
    addFiles: vi.fn(),
    removeDraft: vi.fn(),
    cancelUpload: vi.fn(),
    retryUpload: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

vi.mock("./PersonalCloudAvatar", () => ({
  PersonalCloudAvatar: () => <span>cloud</span>,
}));

vi.mock("./HacomCloudInfoSidebar", () => ({
  HacomCloudInfoSidebar: () => null,
}));

vi.mock("../../../components/modals/FilePreviewModal", () => ({
  FilePreviewModal: () => null,
}));

vi.mock("../../../hooks/useFilePreview", () => ({
  useFilePreview: () => testState.filePreview,
}));

vi.mock("../../../components/ui", () => ({
  toast: {
    action: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import {
  PersonalCloudConversationSurface,
  buildCloudPreviewTargets,
} from "./CloudChatWorkspace";

const attachment = (
  id: string,
  fileName: string,
  mimeType: string,
  type = FileType.DOCUMENT,
): Attachment => ({
  id,
  fileName,
  mimeType,
  type,
  fileSize: 128,
});

const message = (attachments: Attachment[]): Message => ({
  id: "message-1",
  conversationId: "cloud-conversation",
  senderId: "user-1",
  senderName: "Minh Nhật",
  senderAvatar: "https://example.test/avatar.png",
  type: MessageType.FILE,
  status: MessageStatus.SENT,
  content: "",
  createdAt: "2026-08-28T07:00:00.000Z",
  attachments,
} as Message);

describe("Cloud file preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.messages = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("classifies every supported preview family and excludes opaque files", () => {
    const cases: Array<[Attachment, string]> = [
      [attachment("image", "photo.png", "image/png", FileType.IMAGE), "image"],
      [attachment("video", "clip.mp4", "video/mp4", FileType.VIDEO), "video"],
      [attachment("audio", "voice.mp3", "audio/mpeg", FileType.AUDIO), "audio"],
      [attachment("pdf", "report.pdf", "application/pdf"), "pdf"],
      [attachment("text", "notes.txt", "text/plain"), "text"],
      [attachment("csv", "rows.csv", "text/csv"), "csv"],
      [
        attachment(
          "word",
          "plan.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        "document",
      ],
      [
        attachment("excel", "sheet.xlsx", "application/octet-stream"),
        "spreadsheet",
      ],
      [
        attachment(
          "powerpoint",
          "slides.pptx",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
        "presentation",
      ],
      [attachment("archive", "bundle.zip", "application/zip", FileType.ARCHIVE), "archive"],
      [attachment("opaque", "payload.bin", "application/octet-stream"), "unknown"],
    ];

    const targets = buildCloudPreviewTargets(
      [message(cases.map(([item]) => item))],
      "cloud-conversation",
    );

    expect(targets.map((target) => [target.attachment.id, target.previewType]))
      .toEqual(cases
        .filter(([, previewType]) => previewType !== "unknown")
        .map(([item, previewType]) => [item.id, previewType]));
    expect(targets.every((target) =>
      target.conversationId === "cloud-conversation" &&
      target.messageId === "message-1" &&
      target.uploaderName === "Minh Nhật" &&
      target.uploaderAvatarUrl === "https://example.test/avatar.png"
    )).toBe(true);
  });

  it("wires an Excel card click to the real preview hook with the Cloud gallery", async () => {
    const spreadsheet = attachment(
      "excel",
      "BAO-CAO-CONG-VIEC.xlsx",
      "application/octet-stream",
    );
    const pdf = attachment("pdf", "policy.pdf", "application/pdf");
    testState.messages = [message([spreadsheet, pdf])];

    render(
      <PersonalCloudConversationSurface
        conversationId="cloud-conversation"
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "open BAO-CAO-CONG-VIEC.xlsx",
    }));

    await waitFor(() => expect(testState.openPreview).toHaveBeenCalledTimes(1));
    const [target, gallery] = testState.openPreview.mock.calls[0] as [
      { attachment: Attachment; previewType: string; conversationId: string },
      Array<{ attachment: Attachment; previewType: string }>,
    ];

    expect(target).toMatchObject({
      attachment: spreadsheet,
      previewType: "spreadsheet",
      conversationId: "cloud-conversation",
    });
    expect(gallery.map((item) => item.previewType)).toEqual([
      "spreadsheet",
      "pdf",
    ]);
  });
});
