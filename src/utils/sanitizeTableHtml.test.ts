import { describe, it, expect } from "vitest";
import { sanitizeTableHtml } from "./sanitizeTableHtml";

describe("sanitizeTableHtml", () => {
  it("gỡ payload nhúng trong ô Excel, giữ nguyên dữ liệu bảng", () => {
    const out = sanitizeTableHtml(
      '<table><tr><td id="A1"><img src=x onerror=alert(1)>Doanh thu</td></tr></table>',
    );
    expect(out).not.toMatch(/<img|onerror|id=/i);
    expect(out).toContain("Doanh thu");
    expect(out).toContain("<td>");
  });

  it("gỡ script và svg trong ô", () => {
    const out = sanitizeTableHtml(
      "<table><tr><td><svg onload=alert(1)></svg>100</td></tr></table>",
    );
    expect(out).not.toMatch(/<svg|onload/i);
    expect(out).toContain("100");
  });

  it("gỡ mọi thuộc tính, kể cả loại vô hại", () => {
    const out = sanitizeTableHtml(
      '<table border="1"><tr><td colspan="2" style="color:red">x</td></tr></table>',
    );
    expect(out).not.toMatch(/border=|colspan=|style=/i);
    expect(out).toContain("x");
  });

  it("giữ cấu trúc bảng nhiều dòng/cột", () => {
    const out = sanitizeTableHtml(
      "<table><tr><th>Tháng</th><th>Tiền</th></tr><tr><td>7</td><td>500</td></tr></table>",
    );
    expect(out).toContain("Tháng");
    expect(out).toContain("500");
    expect((out.match(/<tr>/g) ?? []).length).toBe(2);
  });
});
