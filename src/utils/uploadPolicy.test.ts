import { describe, expect, it } from "vitest";
import { resolveUploadMimeTypeForFile, validateUploadFileType } from "./uploadPolicy";

describe("uploadPolicy", () => {
  it("normalizes unregistered files to a safe generic MIME type", () => {
    const mimeType = resolveUploadMimeTypeForFile({
      name: "drawing.cad",
      type: "application/x-cad",
    });

    expect(mimeType).toBe("application/octet-stream");
    expect(
      validateUploadFileType({ fileName: "drawing.cad", mimeType }),
    ).toEqual({
      ok: true,
      mimeType: "application/octet-stream",
      extension: ".cad",
      category: "generic",
    });
  });
});
