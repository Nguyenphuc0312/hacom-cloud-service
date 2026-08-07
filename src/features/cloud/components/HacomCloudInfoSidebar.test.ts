import { describe, expect, it } from "vitest";
import { truncateFileNamePreservingExtension } from "./HacomCloudInfoSidebar";

describe("truncateFileNamePreservingExtension", () => {
  it("leaves a short filename unchanged", () => {
    expect(truncateFileNamePreservingExtension("notes.pdf")).toBe("notes.pdf");
  });

  it("keeps the extension when shortening a long filename", () => {
    const value = truncateFileNamePreservingExtension("database_design_hacom_cloud_for_production.drawio.png", 32);
    expect(value).toMatch(/^database_design_hacom/);
    expect(value).toMatch(/\.png$/);
    expect(value).toContain("...");
  });

  it("handles filenames without an extension", () => {
    expect(truncateFileNamePreservingExtension("a-very-long-cloud-file-name-without-extension", 20)).toBe("a-very-long-cloud...");
  });
});
