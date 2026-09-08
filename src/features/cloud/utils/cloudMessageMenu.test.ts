import { describe, expect, it } from "vitest";
import { MessageStatus, MessageType, type Message } from "../../../types";
import { resolveCloudMessageMenuActions } from "./cloudMessageMenu";

const message = (overrides: Partial<Message> = {}): Message =>
  ({
    id: "cloud-1",
    conversationId: "personal-cloud",
    senderId: "user-1",
    content: "Nội dung cần sao chép",
    type: MessageType.TEXT,
    status: MessageStatus.SENT,
    isDeleted: false,
    createdAt: new Date(),
    ...overrides,
  }) as Message;

describe("resolveCloudMessageMenuActions", () => {
  it("uses copy as the primary action for text and exposes one delete action", () => {
    expect(
      resolveCloudMessageMenuActions({
        message: message(),
        baseActions: ["copy", "pin", "select", "deleteForMe"],
        canForward: true,
        canDelete: true,
        isTrash: false,
      }),
    ).toEqual(["copy", "forward", "pin", "select", "deleteForMe"]);
  });

  it("replaces copy with download for an attachment message", () => {
    expect(
      resolveCloudMessageMenuActions({
        message: message({
          type: MessageType.VIDEO,
          attachments: [
            {
              id: "attachment-1",
              fileName: "video.mp4",
              mimeType: "video/mp4",
              url: "/cloud/video.mp4",
            },
          ],
        }),
        baseActions: [
          "copy",
          "downloadAttachment",
          "pin",
          "select",
          "deleteForMe",
        ],
        canForward: true,
        canDelete: true,
        isTrash: false,
      }),
    ).toEqual([
      "downloadAttachment",
      "forward",
      "pin",
      "select",
      "deleteForMe",
    ]);
  });

  it("keeps Trash concise", () => {
    expect(
      resolveCloudMessageMenuActions({
        message: message(),
        baseActions: ["copy", "pin", "select", "deleteForMe"],
        canForward: true,
        canDelete: true,
        isTrash: true,
      }),
    ).toEqual(["select", "deleteForMe"]);
  });
});
