import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSendMessage } from "./useSendMessage";
import { useChatStore } from "../stores/chatStore";
import { useGroupStore } from "../stores/groupStore";
import { MessageType } from "../types";

const {
  fileUploadMock,
  fileToAttachmentMock,
} = vi.hoisted(() => ({
  fileUploadMock: vi.fn(),
  fileToAttachmentMock: vi.fn(),
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

describe("useSendMessage", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useGroupStore.getState().reset();
    fileUploadMock.mockReset();
    fileToAttachmentMock.mockReset();
  });

  it("returns optimistic for async text sends so the composer does not announce sent before ack", async () => {
    const onSend = vi.fn().mockResolvedValue({
      disposition: "sent",
      messageId: "msg-1",
    });

    const { result } = renderHook(() =>
      useSendMessage({
        onSend,
      }),
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

    const { result } = renderHook(() =>
      useSendMessage({
        onSend,
      }),
    );

    await expect(result.current.sendTextMessage("hello")).resolves.toBe(
      "queued",
    );
  });

  it("delegates direct sends through the selected conversation store path", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({
      disposition: "queued",
      messageId: "msg-3",
    });
    useChatStore.setState({
      sendMessage: sendMessageMock as never,
    });

    const { result } = renderHook(() =>
      useSendMessage({
        selectedConversationId: "room-1",
        isConversationReady: true,
      }),
    );

    await expect(
      result.current.sendMessage("hello", undefined, undefined, MessageType.TEXT),
    ).resolves.toEqual({
      disposition: "queued",
      messageId: "msg-3",
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      "room-1",
      "hello",
      MessageType.TEXT,
      undefined,
      undefined,
      undefined,
    );
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

    const { result } = renderHook(() =>
      useSendMessage({
        conversationId: "room-1",
        onSend,
      }),
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
