import { describe, expect, it } from "vitest";
import { MAX_FILES, nameClipboardFile, rejectFile } from "./ReportIssuePage";

const makeFile = (name: string, type: string, size: number): File => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("rejectFile", () => {
  it("chấp nhận ảnh png hợp lệ", () => {
    expect(rejectFile(makeFile("a.png", "image/png", 1024), [])).toBeNull();
  });

  it("từ chối ảnh vượt giới hạn dung lượng của policy chung", () => {
    // policy: image = 37.5MB (uploadPolicy.ts UPLOAD_LIMITS.maxBytesByCategory.image)
    const tooBig = makeFile("big.png", "image/png", 40 * 1024 * 1024);
    expect(rejectFile(tooBig, [])).toMatch(/vượt quá/);
  });

  it("từ chối loại tệp không được hỗ trợ", () => {
    expect(rejectFile(makeFile("x.exe", "application/x-msdownload", 10), []))
      .toMatch(/không được hỗ trợ|không nhận dạng/);
  });

  it("từ chối khi đuôi file không khớp MIME", () => {
    expect(rejectFile(makeFile("fake.png", "application/pdf", 10), []))
      .toMatch(/không khớp/);
  });

  it("từ chối khi đã đủ số tệp tối đa", () => {
    const existing = Array.from({ length: MAX_FILES }, (_, i) =>
      makeFile(`f${i}.png`, "image/png", 10),
    );
    expect(rejectFile(makeFile("new.png", "image/png", 10), existing))
      .toMatch(/tối đa/);
  });

  it("bỏ qua im lặng file trùng (không báo lỗi)", () => {
    const file = makeFile("dup.png", "image/png", 10);
    expect(rejectFile(file, [file])).toBeNull();
  });
});

describe("nameClipboardFile", () => {
  it("đặt tên có đuôi đúng cho ảnh dán tên rỗng", () => {
    const named = nameClipboardFile(makeFile("", "image/png", 10));
    expect(named?.name).toMatch(/^anh-dan-\d{8}-\d{6}\.png$/);
    expect(named?.type).toBe("image/png");
  });

  it("ảnh dán đi qua được validate đuôi-khớp-MIME của rejectFile", () => {
    const named = nameClipboardFile(makeFile("", "image/jpeg", 1024));
    expect(named).not.toBeNull();
    expect(rejectFile(named!, [])).toBeNull();
  });

  it("hai ảnh dán ở thời điểm khác nhau không bị coi là trùng", () => {
    const first = nameClipboardFile(
      makeFile("", "image/png", 10),
      new Date("2026-07-17T10:00:00Z"),
    )!;
    const second = nameClipboardFile(
      makeFile("", "image/png", 10),
      new Date("2026-07-17T10:00:05Z"),
    )!;
    expect(second.name).not.toBe(first.name);
    expect(rejectFile(second, [first])).toBeNull();
  });

  it("bỏ qua nội dung clipboard không phải ảnh", () => {
    expect(nameClipboardFile(makeFile("note.pdf", "application/pdf", 10))).toBeNull();
  });
});
