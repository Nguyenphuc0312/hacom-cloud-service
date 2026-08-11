import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType, RoomType, type Message } from "../../../types";
import { MessageCluster } from "./MessageCluster";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (_key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === "string"
        ? fallback
        : fallback?.defaultValue ?? _key,
  }),
}));

vi.mock("../../ui", () => ({
  toast: {
    success: toastMocks.success,
    error: toastMocks.error,
  },
}));

vi.mock("../../../stores", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "viewer-1" } }),
}));

vi.mock("../../../stores/enrichedProfileStore", () => ({
  useEnrichedProfileStore: (
    selector: (state: { nameByUserId: Record<string, string> }) => unknown,
  ) => selector({ nameByUserId: {} }),
  useResolvedName: (_userId: string, fallback: string) => fallback,
}));

vi.mock("../../../features/chat/hooks/useSendMessage", () => ({
  useRetrySendMessage: () => vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../services/enrichUserProfile", () => ({
  enrichUserProfile: vi.fn(),
}));

vi.mock("../../../features/chat/events/chatUiEvents", () => ({
  dispatchStartDirectMessage: vi.fn(),
  dispatchMentionProfileView: vi.fn(),
}));

const baseMessage = (overrides: Partial<Message>): Message =>
  ({
    id: "m-1",
    conversationId: "c-1",
    senderId: "u-1",
    senderName: "Người gửi",
    content: "Xin chào",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    isDeleted: false,
    isSystem: false,
    isEdited: false,
    isPinned: false,
    createdAt: new Date().toISOString() as unknown as Date,
    ...overrides,
  }) as Message;

const renderCluster = (message: Message, onParentClick = vi.fn()) =>
  render(
    <div onClick={onParentClick}>
      <MessageCluster
        message={message}
        isOwn={false}
        showAvatar={false}
        conversationType={RoomType.DIRECT}
        onReply={vi.fn()}
        onReact={vi.fn()}
        onForward={vi.fn()}
      />
    </div>,
  );

const renderClusterWithPin = (message: Message) =>
  render(
    <MessageCluster
      message={message}
      isOwn={false}
      showAvatar={false}
      conversationType={RoomType.DIRECT}
      onReply={vi.fn()}
      onReact={vi.fn()}
      onForward={vi.fn()}
      onPin={vi.fn()}
      viewerCanPin={true}
    />,
  );

const showRail = (container: HTMLElement) => {
  const root = container.firstElementChild?.firstElementChild as HTMLElement;
  fireEvent.mouseEnter(root);
};

/** Copy now lives behind the Zalo-style "…" dropdown. */
const openMoreMenu = (container: HTMLElement) => {
  showRail(container);
  fireEvent.click(screen.getByTestId("message-action-more"));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toastMocks.success.mockClear();
  toastMocks.error.mockClear();
});

describe("MessageCluster copy action", () => {
  it("shows Copy for text messages and copies the visible message text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const parentClick = vi.fn();
    const { container } = renderCluster(
      baseMessage({ content: "Xin chào bạn\nEmoji 😊" }),
      parentClick,
    );

    openMoreMenu(container);
    fireEvent.click(screen.getByTestId("message-action-copy"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "Xin chào bạn\nEmoji 😊",
      );
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Đã sao chép tin nhắn");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("does not show Copy for attachment-only image messages", () => {
    const { container } = renderCluster(
      baseMessage({ type: MessageType.IMAGE, content: "" }),
    );

    showRail(container);

    expect(screen.queryByTestId("message-action-copy")).not.toBeInTheDocument();
  });

  it("moves Copy and Pin behind the More dropdown", () => {
    const { container } = renderClusterWithPin(
      baseMessage({ content: "Can copy this message" }),
    );

    showRail(container);

    expect(screen.getByRole("button", { name: "Chuyển tiếp" })).toBeInTheDocument();
    expect(screen.queryByTestId("message-action-copy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("message-action-more"));

    expect(screen.getByTestId("message-action-copy")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Ghim tin nhắn" }),
    ).toBeInTheDocument();
  });

  it("shows Save to device for file attachment messages", () => {
    const { container } = renderCluster(
      baseMessage({
        type: MessageType.FILE,
        content: "",
        attachments: [
          {
            id: "file-1",
            fileName: "Bao-cao-tien-do.docx",
            fileSize: 1024,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        ],
        forwardInfo: {
          sourceConversationId: "source-conv",
          sourceMessageId: "source-msg",
          originalSenderId: "sender-1",
          originalSenderName: "Nguoi gui",
        },
      }),
    );

    openMoreMenu(container);

    expect(screen.getByRole("menuitem", { name: "Lưu về máy" })).toBeInTheDocument();
  });

  it("shows an error toast when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    const { container } = renderCluster(baseMessage({ content: "Không copy được" }));

    openMoreMenu(container);
    fireEvent.click(screen.getByTestId("message-action-copy"));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Không thể sao chép tin nhắn");
    });
  });
});
