import { describe, expect, it } from "vitest";
import { truncateFilenameEnd } from "./truncateFilename";

/** Chuyển từ HacomCloudInfoSidebar.test.ts khi panel Cloud bỏ bản cắt tên riêng
 *  để dùng util dùng chung. */
describe("truncateFilenameEnd", () => {
  it("leaves a short filename unchanged", () => {
    expect(truncateFilenameEnd("notes.pdf", 34)).toBe("notes.pdf");
  });

  it("keeps the extension when shortening a long filename", () => {
    const value = truncateFilenameEnd("database_design_hacom_cloud_for_production.drawio.png", 32);
    expect(value).toMatch(/^database_design_hacom/);
    expect(value).toMatch(/\.png$/);
    expect(value).toContain("…");
    expect(value.length).toBeLessThanOrEqual(32);
  });

  it("handles filenames without an extension", () => {
    const value = truncateFilenameEnd("a-very-long-cloud-file-name-without-extension", 20);
    expect(value).toBe("a-very-long-cloud-f…");
    expect(value.length).toBe(20);
  });

  // Chỗ bản cắt tên cũ của Cloud làm sai: dấu chấm giữa tên bị hiểu là đuôi file.
  it("does not mistake dots inside a descriptive name for an extension", () => {
    const value = truncateFilenameEnd("26.04.11_Ke hoach trien khai he thong moi", 20);
    expect(value).toBe("26.04.11_Ke hoach t…");
  });
});
