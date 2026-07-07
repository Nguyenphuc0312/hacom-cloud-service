import { visit } from "unist-util-visit";
import type { Root, Element, Text } from "hast";

/**
 * Rehype plugin: gán class độ rộng cột (`col--date/org/mid/wide`) cho từng
 * <th>/<td> của bảng báo cáo theo NHÃN header — KHÔNG theo nth-child (số cột
 * đổi theo phạm vi cá nhân/phòng ban). CSS (.chat-report-table .col--*) lo phần
 * min-width. BE thêm/đổi cột sau này chỉ cần khớp nhãn ở map dưới.
 * Xem spec: FE__work-report-ngay-hoan-thanh-va-do-rong-cot__spec__07-07-26.md (Phần B).
 */

// Nhãn header (đã chuẩn hoá) → class cột.
const COL_CLASS: Record<string, string> = {};
const register = (cls: string, labels: string[]) =>
  labels.forEach((l) => (COL_CLASS[normalize(l)] = cls));

register("col--date", ["Ngày", "Ngày hoàn thành", "Mã NV"]);
register("col--org", ["Công ty", "Phòng ban", "Nhân viên"]);
register("col--mid", ["Yêu cầu", "Khó khăn", "Ghi chú", "Tài liệu"]);
register("col--wide", ["Công việc", "Đã làm được", "Đánh giá"]);

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function textOf(node: Element): string {
  let out = "";
  visit(node, "text", (t: Text) => {
    out += t.value;
  });
  return out;
}

function addClass(node: Element, cls: string) {
  const props = (node.properties ??= {});
  const existing = props.className;
  const list = Array.isArray(existing) ? existing.slice() : existing ? [String(existing)] : [];
  list.push(cls);
  props.className = list;
}

export function rehypeReportTableCols() {
  return (tree: Root) => {
    visit(tree, "element", (table: Element) => {
      if (table.tagName !== "table") return;

      // 1) Đọc nhãn header từ hàng <th> đầu tiên → class theo cột (index).
      const headerClasses: (string | undefined)[] = [];
      let foundHeader = false;
      visit(table, "element", (tr: Element) => {
        if (foundHeader || tr.tagName !== "tr") return;
        const ths = tr.children.filter(
          (c): c is Element => c.type === "element" && c.tagName === "th",
        );
        if (ths.length === 0) return;
        foundHeader = true;
        ths.forEach((th, i) => {
          const cls = COL_CLASS[normalize(textOf(th))];
          headerClasses[i] = cls;
          if (cls) addClass(th, cls);
        });
      });
      if (!foundHeader) return;

      // 2) Đánh dấu bảng + gán class cho <td> theo index cột đã map ở header.
      addClass(table, "chat-report-table");
      visit(table, "element", (tr: Element) => {
        if (tr.tagName !== "tr") return;
        let col = 0;
        for (const cell of tr.children) {
          if (cell.type !== "element" || cell.tagName !== "td") continue;
          const cls = headerClasses[col];
          if (cls) addClass(cell, cls);
          col += 1;
        }
      });
    });
  };
}
