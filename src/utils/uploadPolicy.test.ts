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

  it.each(["setup.exe", "invoice.pdf.EXE", "run.ps1. ", "shortcut.lnk"])(
    "rejects an unsafe generic extension: %s",
    (fileName) => {
      expect(
        validateUploadFileType({
          fileName,
          mimeType: "application/octet-stream",
        }),
      ).toMatchObject({
        ok: false,
        code: "UNSUPPORTED_MIME_TYPE",
      });
    },
  );

  it("still permits an unknown business extension as generic", () => {
    expect(
      validateUploadFileType({
        fileName: "site-plan.dwg",
        mimeType: "application/octet-stream",
      }),
    ).toMatchObject({
      ok: true,
      category: "generic",
      extension: ".dwg",
    });
  });

});
