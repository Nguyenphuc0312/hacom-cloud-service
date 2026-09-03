import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { sanitizeTableHtml } from "../../utils/sanitizeTableHtml";

/**
 * Kiểm chứng ĐẦU-CUỐI đường đi thật của ExcelPreview:
 *   file .xlsx độc hại → XLSX.read → sheet_to_html → sanitizeTableHtml → render
 *
 * Cơ chế lỗ hổng (đã dựng lại và xác nhận bằng chính test này):
 * SheetJS escape phần TEXT của ô, nhưng nhét giá trị THÔ, KHÔNG escape vào
 * thuộc tính `data-v="..."`. Một ô chứa `">​<img src=x onerror=...>` sẽ đóng
 * sớm thuộc tính rồi đóng luôn thẻ `<td>`, khiến trình duyệt parse phần còn lại
 * thành **thẻ thật**. Parse HTML thô cho ra 1 phần tử <img> sống — tức XSS thật,
 * không phải giả định.
 *
 * Vì vậy assert phải đếm **phần tử DOM thật** sau khi parse, KHÔNG phải tìm chuỗi
 * "onerror" trong output: text đã escape vẫn chứa chữ "onerror" nhưng hoàn toàn
 * vô hại (nó chỉ là chữ hiển thị cho người xem).
 */
const buildSheetHtml = (...cells: string[]): string => {
  const ws = XLSX.utils.aoa_to_sheet([["Tháng", "Ghi chú"], [7, ...cells]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  // Đúng lời gọi trong ExcelPreview.tsx
  return XLSX.utils.sheet_to_html(wb.Sheets["Sheet1"], { editable: false });
};

/** Đếm phần tử nguy hiểm THẬT sau khi trình duyệt parse. */
const countLiveThreats = (html: string): number => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dangerous = doc.querySelectorAll(
    "img, script, svg, iframe, object, embed, a, link, style",
  ).length;
  // Bất kỳ phần tử nào còn giữ handler on* hoặc href/src đều tính là sót.
  const withHandlers = Array.from(doc.querySelectorAll("*")).filter((el) =>
    Array.from(el.attributes).some(
      (a) =>
        a.name.toLowerCase().startsWith("on") ||
        ["href", "src", "srcdoc", "data"].includes(a.name.toLowerCase()),
    ),
  ).length;
  return dangerous + withHandlers;
};

describe("ExcelPreview — payload trong ô Excel không sống sót", () => {
  it.each([
    ['<img src=x onerror="alert(1)">', "thẻ img trong text ô"],
    ['"><img src=x onerror=alert(1)><td x="', "thoát khỏi data-v (vector THẬT)"],
    ['"><script>alert(1)</script><td x="', "thoát ra rồi chèn script"],
    ['"><svg onload=alert(1)></svg><td x="', "thoát ra rồi chèn svg"],
    ['"><iframe src="javascript:alert(1)"></iframe><td x="', "thoát ra rồi chèn iframe"],
    ['<a href="javascript:alert(1)">bấm</a>', "link javascript:"],
  ])("lọc sạch: %s (%s)", (payload) => {
    const safeHtml = sanitizeTableHtml(buildSheetHtml(payload));
    expect(countLiveThreats(safeHtml)).toBe(0);
  });

  /**
   * Từ 05-08-26 nâng SheetJS 0.18.5 → 0.20.3 (bản vá chỉ có trên cdn.sheetjs.com),
   * bản mới đã tự escape `data-v` nên HTML thô KHÔNG còn sinh thẻ sống nữa.
   *
   * Test này trước đây khẳng định điều ngược lại và đã đỏ sau khi nâng — đó là
   * dấu hiệu bản vá ăn, không phải hồi quy. Nay đảo lại thành chốt chặn: nếu ai
   * hạ version hoặc đổi sang bản chưa vá, test đỏ ngay.
   *
   * sanitizeTableHtml vẫn giữ nguyên và vẫn được kiểm ở các case trên — phòng thủ
   * nhiều lớp, không dựa mỗi vào thư viện.
   */
  it("bản SheetJS đang dùng đã tự escape data-v — HTML thô không còn sinh thẻ sống", () => {
    const raw = buildSheetHtml('"><img src=x onerror=alert(1)><td x="');
    const rawDoc = new DOMParser().parseFromString(raw, "text/html");
    expect(rawDoc.querySelectorAll("img").length).toBe(0);
    // Bước lọc vẫn phải sạch — đây mới là lớp bảo vệ ta tự kiểm soát.
    expect(countLiveThreats(sanitizeTableHtml(raw))).toBe(0);
  });

  it("giữ nguyên dữ liệu thật của bảng", () => {
    const safeHtml = sanitizeTableHtml(buildSheetHtml("Doanh thu quý 3"));
    expect(safeHtml).toContain("Doanh thu quý 3");
    expect(safeHtml).toContain("Tháng");
    expect(safeHtml).toContain("<table>");
    expect(safeHtml).toContain("<td>");
  });
});
