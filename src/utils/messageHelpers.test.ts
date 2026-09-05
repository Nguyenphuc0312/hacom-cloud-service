import { describe, expect, it, vi } from "vitest";
import {
  FileType,
  MessageType,
  type MessageSummary,
} from "../types";
import { getMessagePreview } from "./messageHelpers";

vi.mock("../i18n", () => ({
  default: {
    t: (key: string) => {
      if (key === "chat:preview.file") return "Tệp";
      return key;
    },
  },
}));

vi.mock("./mentionAliasText", () => ({
  aliasByUserId: () => ({}),
  applyMentionAliases: (text: string) => text,
}));

const fileSummary = (
  content: string,
  attachments?: MessageSummary["attachments"],
): MessageSummary => ({
  id: "message-1",
  senderId: "user-1",
  senderName: "Minh",
  content,
  type: MessageType.FILE,
  isDeleted: false,
  createdAt: new Date("2026-09-05T08:00:00.000Z"),
  attachments,
});

describe("getMessagePreview file summaries", () => {
  it("marks a projected filename as a file instead of plain text", () => {
    expect(
      getMessagePreview(fileSummary("PC (1).rar"), "viewer-1"),
    ).toBe("Tệp · PC (1).rar");
  });

  it("keeps a real caption when full attachment data is available", () => {
    expect(
      getMessagePreview(
        fileSummary("projection fallback", [
          {
            id: "archive-1",
            type: FileType.ARCHIVE,
            fileName: "PC (1).rar",
          },
        ]),
        "viewer-1",
      ),
    ).toBe("projection fallback");
  });

  it("uses the attachment filename when content repeats that raw filename", () => {
    expect(
      getMessagePreview(
        fileSummary("PC (1).rar", [
          {
            id: "archive-1",
            type: FileType.ARCHIVE,
            fileName: "PC (1).rar",
          },
        ]),
        "viewer-1",
      ),
    ).toBe("Tệp · PC (1).rar");
  });

  it("does not duplicate the backend summary for multiple attachments", () => {
    expect(
      getMessagePreview(
        fileSummary("Đã gửi 2 tệp đính kèm"),
        "viewer-1",
      ),
    ).toBe("Đã gửi 2 tệp đính kèm");
  });
});
