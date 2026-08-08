/**
 * Nhớ trang PDF: sai chỗ này thì mở file nhảy lung tung hoặc nhảy quá số trang.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPdfKey,
  loadPdfPage,
  savePdfPage,
} from "./pdfReadingPosition";

beforeEach(() => {
  localStorage.clear();
});

describe("pdfReadingPosition", () => {
  it("lưu rồi đọc lại đúng trang", () => {
    const key = buildPdfKey("bao-cao.pdf", 1024);
    savePdfPage(key, 7, 20);
    expect(loadPdfPage(key, 20)).toBe(7);
  });

  it("khoá phân biệt theo cả tên lẫn dung lượng", () => {
    const a = buildPdfKey("bao-cao.pdf", 1024);
    const b = buildPdfKey("bao-cao.pdf", 2048);
    expect(a).not.toBe(b);
    savePdfPage(a, 5, 20);
    expect(loadPdfPage(b, 20)).toBeNull();
  });

  it("tên file rỗng → khoá rỗng, không lưu gì", () => {
    const key = buildPdfKey("", 100);
    expect(key).toBe("");
    savePdfPage(key, 5, 20);
    expect(loadPdfPage(key, 20)).toBeNull();
  });

  it("không nhớ trang 1 và file quá ngắn", () => {
    const key = buildPdfKey("ngan.pdf", 10);
    savePdfPage(key, 1, 20); // trang 1 = mặc định, nhớ làm gì
    expect(loadPdfPage(key, 20)).toBeNull();

    savePdfPage(key, 2, 2); // file 2 trang, dưới ngưỡng
    expect(loadPdfPage(key, 2)).toBeNull();
  });

  it("file bị thay bằng bản ngắn hơn → bỏ trang cũ, không nhảy quá số trang", () => {
    const key = buildPdfKey("thay-doi.pdf", 500);
    savePdfPage(key, 40, 50);
    expect(loadPdfPage(key, 10)).toBeNull();
  });

  it("dữ liệu hỏng thì trả null thay vì ném lỗi", () => {
    localStorage.setItem("chat.pdfReadingPosition", "khong-phai-json");
    const key = buildPdfKey("x.pdf", 1);
    expect(() => loadPdfPage(key, 10)).not.toThrow();
    expect(loadPdfPage(key, 10)).toBeNull();
  });
});
