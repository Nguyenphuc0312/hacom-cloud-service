import { describe, it, expect, vi } from "vitest";
import {
  getCompactPreviewFromMessage,
  getPreviewFromMessage,
  hasRichFormatting,
  sanitizeMessageHtml,
  stripHtmlToText,
} from "./messageContent.utils";

describe("sanitizeMessageHtml", () => {
  it.each([
    ['<a href="javascript:alert(1)">x</a>', "javascript:"],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', "javascript: viết hoa lẫn thường"],
    [
      '<a href="  javascript:alert(1)">x</a>',
      "javascript: có khoảng trắng đầu",
    ],
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
    expect(
      sanitizeMessageHtml('<a href="javascript:alert(1)">Bấm vào đây</a>'),
    ).toContain("Bấm vào đây");
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

  it.each([
    ["rgb(229, 57, 53)", "#E53935"],
    ["rgb(244, 81, 30)", "#F4511E"],
    ["rgb(249, 168, 37)", "#F9A825"],
    ["rgb(67, 160, 71)", "#43A047"],
    ["rgb(21, 101, 192)", "#1565C0"],
    ["rgb(94, 53, 177)", "#5E35B1"],
    ["rgb(109, 76, 65)", "#6D4C41"],
    ["rgb(117, 117, 117)", "#757575"],
  ])("giữ màu toolbar %s dưới dạng an toàn %s", (input, expected) => {
    const out = sanitizeMessageHtml(
      `<p><span style="color: ${input};"><strong>màu</strong></span></p>`,
    );
    expect(out).toContain(`<span style="color: ${expected};">`);
  });

  it("chỉ giữ color thuộc palette, loại CSS khác và màu tùy ý", () => {
    const safe = sanitizeMessageHtml(
      '<span style="color: rgb(229, 57, 53); background-image: url(javascript:alert(1))">x</span>',
    );
    expect(safe).toContain('style="color: #E53935;"');
    expect(safe).not.toMatch(/background|url\(/i);

    const arbitrary = sanitizeMessageHtml(
      '<span style="color: rgb(1, 2, 3)">x</span>',
    );
    expect(arbitrary).not.toContain("style=");
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

describe("hasRichFormatting", () => {
  it.each([
    ['<p>Dòng một<br>Dòng hai</p>', "xuống dòng mềm"],
    ["<p>Đoạn một</p><p>Đoạn hai</p>", "nhiều đoạn"],
  ])("coi %s là rich text để giữ nguyên bố cục (%s)", (html) => {
    expect(hasRichFormatting(html)).toBe(true);
  });

  it("không đổi một đoạn văn đơn thành rich text", () => {
    expect(hasRichFormatting("<p>Chỉ một dòng</p>")).toBe(false);
  });

  it("nhận diện tin chỉ tô màu là rich text", () => {
    expect(
      hasRichFormatting(
        '<p><span style="color: rgb(229, 57, 53)">màu đỏ</span></p>',
      ),
    ).toBe(true);
  });

  it("không nhận nhầm mention chip là rich text", () => {
    expect(
      hasRichFormatting(
        '<p><span data-mention-chip="" data-mention-id="user-1" class="composer-mention-chip">@Minh Nhật</span> xin chào</p>',
      ),
    ).toBe(false);
  });
});

describe("stripHtmlToText", () => {
  it("không để sót payload khi rút text cho preview sidebar", () => {
    const out = stripHtmlToText('<a href="javascript:alert(1)">Báo cáo</a>');
    expect(out).toBe("Báo cáo");
  });

  it("giữ ngắt dòng của rich text khi rút text cho copy và preview", () => {
    expect(
      stripHtmlToText("<p>Dòng một<br>Dòng hai</p><p>Dòng ba</p>"),
    ).toBe("Dòng một\nDòng hai\nDòng ba");
  });
});

describe("getPreviewFromMessage", () => {
  it("không để lộ thẻ rich text trong preview notification", () => {
    expect(
      getPreviewFromMessage({
        content: "<p><strong>QA-rich-bold-red</strong></p>",
      }),
    ).toBe("QA-rich-bold-red");
  });

  it("giới hạn payload dài trong preview kết quả tìm kiếm", () => {
    expect(getCompactPreviewFromMessage({ content: "0123456789" }, 6)).toBe(
      "01234…",
    );
  });
});
