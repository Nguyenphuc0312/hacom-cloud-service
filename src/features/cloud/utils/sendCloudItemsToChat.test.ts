import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../../../types";
import type { CloudItem } from "../types";
import { sendCloudItemsToChat } from "./sendCloudItemsToChat";

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  getFileAccess: vi.fn(),
  fetchResourceBlob: vi.fn(),
  validateUpload: vi.fn(),
  reserveUpload: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  completeUpload: vi.fn(),
  abandonUpload: vi.fn(),
}));

vi.mock("../api/cloudApi", () => ({
  cloudApi: {
    getItem: mocks.getItem,
    getFileAccess: mocks.getFileAccess,
  },
}));

vi.mock("../../../utils/downloadFile", () => ({
  fetchResourceBlob: mocks.fetchResourceBlob,
}));

vi.mock("../../../services/uploadClient", () => ({
  default: {
    validateUpload: mocks.validateUpload,
    reserveUpload: mocks.reserveUpload,
    uploadToSignedUrl: mocks.uploadToSignedUrl,
    completeUpload: mocks.completeUpload,
    abandonUpload: mocks.abandonUpload,
  },
}));

const item = (updates: Partial<CloudItem> = {}): CloudItem => ({
  id: "cloud-1",
  type: "text",
  status: "ready",
  content: "Xin chào từ Cloud",
  sizeBytes: 18,
  createdAt: "2026-09-08T01:00:00.000Z",
  updatedAt: "2026-09-08T01:00:00.000Z",
  ...updates,
});

const sentMessage = (input: { conversationId: string; content: string; type?: MessageType }): Message =>
  ({
    id: `${input.conversationId}-${input.content || "file"}`,
    conversationId: input.conversationId,
    content: input.content,
    type: input.type ?? MessageType.TEXT,
  }) as Message;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateUpload.mockReturnValue({
    mimeType: "image/png",
    maxBytes: 39_321_600,
    category: "image",
  });
  mocks.reserveUpload.mockResolvedValue({
    uploadId: "upload-1",
    uploadUrl: "https://chat.test/upload",
    uploadMethod: "PUT",
    uploadHeaders: {},
    objectKey: "messages/photo.png",
    expiresAt: "2026-09-08T02:00:00.000Z",
  });
  mocks.uploadToSignedUrl.mockResolvedValue(undefined);
  mocks.completeUpload.mockResolvedValue({
    uploadId: "upload-1",
    fileId: "chat-file-1",
    attachment: {
      id: "chat-file-1",
      objectKey: "messages/photo.png",
      url: "https://chat.test/photo.png",
      canAttach: true,
    },
  });
});

describe("sendCloudItemsToChat", () => {
  it("sends text and links as separate Chat messages in source order", async () => {
    const sendMessage = vi.fn(async (input) => sentMessage(input));
    const result = await sendCloudItemsToChat({
      userId: "user-1",
      itemIds: ["cloud-1", "cloud-2"],
      items: [
        item(),
        item({
          id: "cloud-2",
          type: "link",
          content: undefined,
          title: "Hacom",
          url: "https://hacom.vn",
        }),
      ],
      targetConversationIds: ["room-1"],
      sendMessage,
    });

    expect(result.failures).toEqual([]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map(([input]) => input.content)).toEqual([
      "Xin chào từ Cloud",
      "https://hacom.vn",
    ]);
    expect(sendMessage.mock.calls[1]?.[0].linkPreview).toMatchObject({
      url: "https://hacom.vn",
      title: "Hacom",
    });
  });

  it("copies a Cloud attachment through the Chat upload lifecycle", async () => {
    mocks.getFileAccess.mockResolvedValue({
      url: "https://cloud.test/photo.png",
      sizeBytes: 5,
      fileName: "photo.png",
      contentType: "image/png",
    });
    mocks.fetchResourceBlob.mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const sendMessage = vi.fn(async (input) => sentMessage(input));

    const result = await sendCloudItemsToChat({
      userId: "user-1",
      itemIds: ["cloud-image"],
      items: [item({ id: "cloud-image", type: "image", title: "photo.png", sizeBytes: 5, contentType: "image/png" })],
      targetConversationIds: ["room-1"],
      sendMessage,
    });

    expect(result.failures).toEqual([]);
    expect(mocks.getFileAccess).toHaveBeenCalledWith("user-1", "cloud-image");
    expect(mocks.reserveUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "message_attachment",
        conversationId: "room-1",
        filename: "photo.png",
        sizeBytes: 5,
      }),
    );
    expect(sendMessage.mock.calls[0]?.[0]).toMatchObject({
      conversationId: "room-1",
      type: MessageType.IMAGE,
      content: "",
      attachments: [expect.objectContaining({ id: "chat-file-1", type: "image" })],
    });
  });

  it("reports a non-ready item without sending it", async () => {
    const sendMessage = vi.fn(async (input) => sentMessage(input));
    const result = await sendCloudItemsToChat({
      userId: "user-1",
      itemIds: ["pending-1"],
      items: [item({ id: "pending-1", status: "processing" })],
      targetConversationIds: ["room-1"],
      sendMessage,
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.failures).toMatchObject([
      { itemId: "pending-1", targetConversationId: "room-1" },
    ]);
  });
});
