import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import { rehypeReportTableCols } from "./rehypeReportTableCols";

// Chạy pipeline tới hast (không cần stringifier) rồi kiểm tra class trên node.
function toHast(md: string): Root {
  const proc = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeReportTableCols);
  return proc.runSync(proc.parse(md)) as Root;
}

function classesOf(node: Element): string[] {
  const c = node.properties?.className;
  return Array.isArray(c) ? c.map(String) : c ? [String(c)] : [];
}

// Thu <th>/<td> theo văn bản đầu tiên khớp.
function cellByText(tree: Root, tag: "th" | "td", text: string): Element | undefined {
  let hit: Element | undefined;
  visit(tree, "element", (el: Element) => {
    if (hit || el.tagName !== tag) return;
    const t = (el.children.find((c) => c.type === "text") as { value?: string } | undefined)?.value;
    if (t === text) hit = el;
  });
  return hit;
}

describe("rehypeReportTableCols", () => {
  it("gán class cột theo nhãn header cho cả th và td (map theo index)", () => {
    const tree = toHast(
      ["| Ngày | Công việc | Đánh giá |", "|---|---|---|", "| 07/07 | Làm A | Tốt |"].join("\n"),
    );

    let table: Element | undefined;
    visit(tree, "element", (el: Element) => {
      if (!table && el.tagName === "table") table = el;
    });
    expect(classesOf(table!)).toContain("chat-report-table");

    expect(classesOf(cellByText(tree, "th", "Ngày")!)).toContain("col--date");
    expect(classesOf(cellByText(tree, "th", "Công việc")!)).toContain("col--wide");
    expect(classesOf(cellByText(tree, "th", "Đánh giá")!)).toContain("col--wide");

    // td khớp đúng cột dù giá trị khác header
    expect(classesOf(cellByText(tree, "td", "07/07")!)).toContain("col--date");
    expect(classesOf(cellByText(tree, "td", "Làm A")!)).toContain("col--wide");
  });

  it("cột không có trong map → không gán class rác cho th/td", () => {
    const tree = toHast(["| Foo |", "|---|", "| bar |"].join("\n"));
    expect(classesOf(cellByText(tree, "th", "Foo")!)).toHaveLength(0);
    expect(classesOf(cellByText(tree, "td", "bar")!)).toHaveLength(0);
  });
});
