import { describe, expect, it } from "vitest";

import { splitCalendarAttachments } from "./uploadCalendarAttachment";
import type { CalendarLocalAttachment } from "../../../components/ui/CalendarAttachmentZone";

const remote = (fileId: string): CalendarLocalAttachment => ({
  id: fileId,
  previewUrl: null,
  name: `${fileId}.pdf`,
  sizeBytes: 10,
  mimeType: "application/pdf",
  remoteFileId: fileId,
  downloadUrl: `https://x/${fileId}`,
});

const local = (name: string): CalendarLocalAttachment => ({
  id: `local-${name}`,
  file: new File(["x"], name, { type: "text/plain" }),
  previewUrl: null,
  name,
  sizeBytes: 1,
  mimeType: "text/plain",
});

describe("splitCalendarAttachments", () => {
  it("keeps existing remote fileIds and queues only new local files", () => {
    const { filesToUpload, existingFileIds } = splitCalendarAttachments([
      remote("f1"),
      local("new.txt"),
      remote("f2"),
    ]);
    // Không mất file cũ khi sửa: cả 2 remote fileId được giữ lại.
    expect(existingFileIds).toEqual(["f1", "f2"]);
    // Chỉ file local mới được upload.
    expect(filesToUpload.map((f) => f.name)).toEqual(["new.txt"]);
  });

  it("returns empty for no attachments", () => {
    expect(splitCalendarAttachments([])).toEqual({
      filesToUpload: [],
      existingFileIds: [],
    });
  });
});
