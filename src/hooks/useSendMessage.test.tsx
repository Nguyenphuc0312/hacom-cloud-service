import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSendMessage } from "./useSendMessage";
import { chatApi } from "../features/api/chatApi";
import { store } from "../store";
import { useChatStore } from "../stores/chatStore";
import { useGroupStore } from "../stores/groupStore";
import { MessageStatus, MessageType, type Message } from "../types";

const {
  fileUploadMock,
  fileToAttachmentMock,
  sendMessageApiMock,
} = vi.hoisted(() => ({
  fileUploadMock: vi.fn(),
  fileToAttachmentMock: vi.fn(),
  sendMessageApiMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  authApi: {},
  contactApi: {},
  conversationApi: {
    getConversations: vi.fn(),
    getConversationById: vi.fn(),
    getUnreadSummary: vi.fn(),
    markAsRead: vi.fn(),
  },
  fileApi: {},
  friendshipApi: {},
  groupApi: {},
  userApi: {},
  messageApi: {
    addReaction: vi.fn(),
    deleteMessage: vi.fn(),
    editMessage: vi.fn(),
    getMessages: vi.fn(),
    removeReaction: vi.fn(),
    searchMessages: vi.fn(),
    sendMessage: sendMessageApiMock,
  },
}));

vi.mock("../features/chat/api/chatApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../features/chat/api/chatApi")>();
  return {
    ...actual,
    chatApi: {
      ...actual.chatApi,
      file: {
        ...actual.chatApi.file,
        uploadFile: fileUploadMock,
        toAttachment: fileToAttachmentMock,
      },
    },
  };
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const apiSuccess = <T,>(data: T) => ({
  success: true as const,
  data,
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
};

const createServerMessage = (overrides: Partial<Message>): Message => ({
  id: "server-msg",
  conversationId: "room-1",
  senderId: "user-1",
  senderName: "User 1",
  content: "hello",
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  isEdited: false,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date,
  ...overrides,
});

describe("useSendMessage", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useGroupStore.getState().reset();
    store.dispatch(chatApi.util.resetApiState());
    fileUploadMock.mockReset();
    fileToAttachmentMock.mockReset();
    sendMessageApiMock.mockReset();
  });

  it("returns optimistic for async text sends so the composer does not announce sent before ack", async () => {
    const onSend = vi.fn().mockResolvedValue({
      disposition: "sent",
      messageId: "msg-1",
    });

    const { result } = renderHook(
      () =>
        useSendMessage({
          onSend,
        }),
      { wrapper },
    );

    await expect(result.current.sendTextMessage("hello")).resolves.toBe(
      "optimistic",
    );
    expect(onSend).toHaveBeenCalledWith(
      "hello",
      undefined,
      MessageType.TEXT,
    );
  });

  it("returns queued when the send path synchronously reports queueing", async () => {
    const onSend = vi.fn().mockReturnValue({
      disposition: "queued",
      messageId: "msg-2",
    });

    const { result } = renderHook(
      () =>
        useSendMessage({
          onSend,
        }),
      { wrapper },
    );

    await expect(result.current.sendTextMessage("hello")).resolves.toBe(
      "queued",
    );
  });

  it("delegates direct sends through the RTKQ active timeline path", async () => {
    const ack = createDeferred<ReturnType<typeof apiSuccess<Message>>>();
    sendMessageApiMock.mockReturnValue(ack.promise);

    const { result } = renderHook(
      () =>
        useSendMessage({
          selectedConversationId: "room-1",
          isConversationReady: true,
        }),
      { wrapper },
    );

    const sendResult = result.current.sendMessage(
      "hello",
      undefined,
      undefined,
      MessageType.TEXT,
    ) as { disposition: string; messageId: string; ack: Promise<unknown> };

    expect(sendResult.disposition).toBe("optimistic");
    expect(sendResult.messageId).toBeTruthy();
    expect(sendMessageApiMock).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({
        clientMessageId: sendResult.messageId,
        content: "hello",
        type: MessageType.TEXT,
      }),
    );
    expect(sendMessageApiMock.mock.calls[0]?.[1]).not.toHaveProperty(
      "senderName",
    );
    expect(sendMessageApiMock.mock.calls[0]?.[1]).not.toHaveProperty(
      "senderAvatar",
    );

    await act(async () => {
      await Promise.resolve();
    });

    const optimisticMessages = chatApi.endpoints.getMessages.select({
      conversationId: "room-1",
    })(store.getState()).data?.messages;
    expect(optimisticMessages).toHaveLength(1);
    expect(optimisticMessages?.[0]).toMatchObject({
      clientMessageId: sendResult.messageId,
      sendState: "sending",
      transportStatus: "optimistic",
    });

    ack.resolve(
      apiSuccess(
        createServerMessage({
          id: "server-3",
          clientMessageId: sendResult.messageId,
          localId: `temp-${sendResult.messageId}`,
          stableId: sendResult.messageId,
        }),
      ),
    );
    await expect(sendResult.ack).resolves.toBeTruthy();
  });

  it("uploads attachments through chatApi.file before delegating to the send callback", async () => {
    const onSend = vi.fn().mockResolvedValue({
      disposition: "optimistic",
      messageId: "msg-4",
    });
    const attachment = {
      id: "att-1",
      objectKey: "conversation/att-1",
      type: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      fileSize: 1024,
    };
    fileUploadMock.mockResolvedValue({
      success: true,
      data: { attachment },
    });
    fileToAttachmentMock.mockReturnValue(attachment);

    const { result } = renderHook(
      () =>
        useSendMessage({
          conversationId: "room-1",
          onSend,
        }),
      { wrapper },
    );

    const file = new File(["image"], "photo.png", { type: "image/png" });
    await act(async () => {
      expect(result.current.selectFile(file)).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.selectedFile?.name).toBe("photo.png");
    });

    await expect(result.current.sendAttachmentMessage()).resolves.toBe(
      "optimistic",
    );
    expect(fileUploadMock).toHaveBeenCalledWith(
      "room-1",
      file,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(onSend).toHaveBeenCalledWith(
      "photo.png",
      attachment,
      MessageType.IMAGE,
    );
  });
});
