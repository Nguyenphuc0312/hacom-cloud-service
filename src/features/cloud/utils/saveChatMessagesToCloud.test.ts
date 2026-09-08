import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType, type Message } from "../../../types";
import { cloudApi } from "../api/cloudApi";
import { CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import {
  saveChatMessagesToCloud,
  selectChatMessagesForCloudForward,
} from "./saveChatMessagesToCloud";

const mocks = vi.hoisted(() => ({
  getDownloadUrl: vi.fn(),
  fetchResourceBlob: vi.fn(),
}));

vi.mock("../../../services/api", () => ({
  fileApi: { getDownloadUrl: mocks.getDownloadUrl },
}));

vi.mock("../../../utils/downloadFile", () => ({
  fetchResourceBlob: mocks.fetchResourceBlob,
}));

vi.mock("../../../config", () => ({
  resolvePublicResourceUrl: (url?: string) => url,
}));

vi.mock("../api/cloudApi", () => ({
  cloudApi: {
    createText: vi.fn(),
    createLink: vi.fn(),
    initiateUpload: vi.fn(),
    uploadObject: vi.fn(),
    completeUpload: vi.fn(),
  },
}));

const message = (overrides: Partial<Message> = {}): Message =>
  ({
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "sender-1",
    content: "Nội dung cần lưu",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    isDeleted: false,
    createdAt: new Date(),
    ...overrides,
  }) as Message;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveChatMessagesToCloud", () => {
  it("stores a text message as Cloud text", async () => {
    await saveChatMessagesToCloud([message()], "user-1");

    expect(cloudApi.createText).toHaveBeenCalledWith(
      "user-1",
      "Nội dung cần lưu",
    );
    expect(cloudApi.createLink).not.toHaveBeenCalled();
  });

  it("preserves a standalone URL as a Cloud link", async () => {
    await saveChatMessagesToCloud(
      [
        message({
          content: "https://hacom.vn/tai-lieu",
          metadata: {
            linkPreview: {
              url: "https://hacom.vn/tai-lieu",
              title: "Tài liệu Hacom",
            },
          },
        }),
      ],
      "user-1",
    );

    expect(cloudApi.createLink).toHaveBeenCalledWith(
      "user-1",
      "https://hacom.vn/tai-lieu",
      "Tài liệu Hacom",
    );
  });

  it("downloads and uploads an attachment through the Cloud lifecycle", async () => {
    mocks.getDownloadUrl.mockResolvedValue({
      success: true,
      data: { url: "https://files.test/photo.png" },
    });
    mocks.fetchResourceBlob.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    vi.mocked(cloudApi.initiateUpload).mockResolvedValue({
      uploadSessionId: "upload-1",
      itemId: "item-1",
      status: "initiated",
      uploadUrl: "https://cloud.test/upload",
      method: "PUT",
      requiredHeaders: {},
      sizeBytes: 5,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await saveChatMessagesToCloud(
      [
        message({
          content: "",
          type: MessageType.IMAGE,
          attachments: [
            {
              id: "attachment-1",
              fileName: "photo.png",
              fileSize: 5,
              mimeType: "image/png",
            },
          ],
        }),
      ],
      "user-1",
    );

    expect(mocks.getDownloadUrl).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      objectKey: undefined,
      attachmentId: "attachment-1",
    });
    expect(cloudApi.uploadObject).toHaveBeenCalledOnce();
    expect(cloudApi.completeUpload).toHaveBeenCalledWith("user-1", "upload-1");
  });

  it("rejects attachments over 100 MB before downloading", async () => {
    await expect(
      saveChatMessagesToCloud(
        [
          message({
            content: "",
            type: MessageType.FILE,
            attachments: [
              {
                id: "attachment-large",
                fileName: "large.zip",
                fileSize: CLOUD_MAX_UPLOAD_BYTES + 1,
                mimeType: "application/zip",
              },
            ],
          }),
        ],
        "user-1",
      ),
    ).rejects.toThrow("vượt quá giới hạn 100 MB");

    expect(mocks.getDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("selectChatMessagesForCloudForward", () => {
  it("matches every supported message identity and preserves requested order", () => {
    const first = message({ id: "server-1", localId: "local-1" });
    const second = message({ id: "server-2", stableId: "stable-2" });

    const result = selectChatMessagesForCloudForward(
      [first, second],
      ["stable-2", "local-1"],
    );

    expect(result.messages).toEqual([second, first]);
    expect(result.missingIds).toEqual([]);
  });

  it("reports missing ids instead of silently returning a partial selection", () => {
    const existing = message({ id: "server-1" });

    const result = selectChatMessagesForCloudForward(
      [existing],
      ["server-1", "missing-2"],
    );

    expect(result.messages).toEqual([existing]);
    expect(result.missingIds).toEqual(["missing-2"]);
  });
});
