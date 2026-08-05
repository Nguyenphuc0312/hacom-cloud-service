import { describe, it, expect, vi } from "vitest";
import { sanitizeMessageHtml, stripHtmlToText } from "./messageContent.utils";

describe("sanitizeMessageHtml", () => {
  it.each([
    ['<a href="javascript:alert(1)">x</a>', "javascript:"],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', "javascript: viết hoa lẫn thường"],
    ['<a href="  javascript:alert(1)">x</a>', "javascript: có khoảng trắng đầu"],
    ['<a href="java\tscript:alert(1)">x</a>', "javascript: chèn tab"],
    ['<a href="data:text/html,<script>alert(1)</script>">x</a>', "data:"],
    ['<a href="vbscript:msgbox(1)">x</a>', "vbscript:"],
  ])("gỡ href nguy hiểm (%s)", (input) => {
    const out = sanitizeMessageHtml(input).toLowerCase();
    expect(out).not.toContain("href=");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
  });

  it("giữ text hiển thị khi gỡ href độc", () => {
    expect(sanitizeMessageHtml('<a href="javascript:alert(1)">Bấm vào đây</a>')).toContain(
      "Bấm vào đây",
    );
  });

  it.each([
    "https://hacom.vn/bao-cao?quy=3&nam=2026",
    "http://intranet.local/x",
    "mailto:hr@hacomholdings.com.vn",
    "tel:+84901234567",
  ])("giữ nguyên link hợp lệ: %s", (url) => {
    const out = sanitizeMessageHtml(`<a href="${url}">t</a>`);
    expect(out).toContain(`href="${url.replace(/&/g, "&amp;")}"`);
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("gỡ mọi handler on* trên thẻ được phép", () => {
    const out = sanitizeMessageHtml('<a href="/x" onclick="alert(1)">t</a>');
    expect(out).not.toMatch(/onclick/i);
  });

  // V-07: bản cũ return đệ quy khi gặp thẻ cấm → nuốt luôn thẻ anh em hợp lệ.
  it("gỡ thẻ cấm nhưng GIỮ nội dung hợp lệ xung quanh", () => {
    const out = sanitizeMessageHtml(
      "<span>trước</span><img src=x onerror=alert(1)><p>ok</p><svg onload=alert(2)></svg>",
    );
    expect(out).not.toMatch(/onerror|onload|<img|<svg/i);
    expect(out).toContain("trước");
    expect(out).toContain("<p>ok</p>");
  });

  it("unwrap thẻ cấm lồng nhau, giữ text bên trong", () => {
    const out = sanitizeMessageHtml("<div><section><b>đậm</b></section></div>");
    expect(out).not.toMatch(/<div|<section/i);
    expect(out).toContain("<b>đậm</b>");
  });

  // Bản cũ parse lại TOÀN BỘ chuỗi mỗi lần gặp thẻ cấm (return đệ quy) → O(n²):
  // 500 thẻ lồng nhau treo tab vài giây, đủ để DoS bằng một tin nhắn.
  //
  // Đếm số lần parse thay vì đo thời gian: wall-clock flaky khi CI chạy song
  // song (đo được 14x cho bản ĐÚNG, 37x cho bản sai — hai vùng quá gần nhau).
  // Số lần parse thì tất định: đúng = 1, đệ quy = 1 lần/thẻ cấm.
  it("chỉ parse HTML đúng một lần dù có bao nhiêu thẻ cấm", () => {
    const parseSpy = vi.spyOn(DOMParser.prototype, "parseFromString");
    try {
      const out = sanitizeMessageHtml(
        "<div>".repeat(300) + "nội dung" + "</div>".repeat(300),
      );
      expect(out).toContain("nội dung");
      expect(out).not.toContain("<div");
      expect(parseSpy).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });
});

describe("stripHtmlToText", () => {
  it("không để sót payload khi rút text cho preview sidebar", () => {
    const out = stripHtmlToText('<a href="javascript:alert(1)">Báo cáo</a>');
    expect(out).toBe("Báo cáo");
  });
});
