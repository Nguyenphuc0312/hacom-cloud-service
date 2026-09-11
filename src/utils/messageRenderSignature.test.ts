import { describe, expect, it } from "vitest";
import { FileType, type Attachment } from "../types";
import { getAttachmentRenderSignature } from "./messageRenderSignature";

const attachment: Attachment = {
  id: "file-1",
  type: FileType.DOCUMENT,
  fileName: "Bao cao.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  fileSize: 42,
  objectKey: "attachments/file-1.xlsx",
};

describe("getAttachmentRenderSignature", () => {
  it("changes when only the server security capability changes", () => {
    const allowed = getAttachmentRenderSignature({
      ...attachment,
      scanStatus: "clean",
      releaseStatus: "released",
      canAttach: true,
      canDownload: true,
      canPreview: true,
    });
    const blocked = getAttachmentRenderSignature({
      ...attachment,
      scanStatus: "pending",
      releaseStatus: "blocked",
      releaseReason: "FILE_SCAN_PENDING",
      canAttach: false,
      canDownload: false,
      canPreview: false,
    });

    expect(blocked).not.toBe(allowed);
  });
});
