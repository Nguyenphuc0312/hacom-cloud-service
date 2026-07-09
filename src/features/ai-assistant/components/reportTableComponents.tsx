import React from "react";
import clsx from "clsx";

/**
 * Renderer bảng báo cáo DÙNG CHUNG cho cả 2 màn AI:
 *  - Cá nhân: `personal-ai/.../PersonalMessageBubble.tsx`
 *  - Công ty: `ai-assistant/.../AiAnswerContent.tsx`
 *
 * Chỉ gồm phần THUẦN TRÌNH BÀY (thead/tbody/tr/th/td) → đồng bộ style 2 màn.
 * KHÔNG gồm <table> vì mỗi màn bọc khác nhau (Cá nhân có TableExportMenu + snapshot
 * export; Công ty không). Wrapper <table> để từng màn tự lo.
 *
 * Class cột (col--org/date/mid/wide) do rehypeReportTableCols gán theo nhãn header;
 * CSS min/max-width ở ai-animations.css.
 */
export const reportTableComponents = {
  thead: ({ children }: React.ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-gradient-to-r from-surface-active to-surface-hover">{children}</thead>
  ),
  tbody: ({ children }: React.ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-border/40">{children}</tbody>
  ),
  tr: ({ children }: React.ComponentPropsWithoutRef<"tr">) => (
    <tr className="transition-colors hover:bg-[#1976D2]/4">{children}</tr>
  ),
  th: ({ children, className }: React.ComponentPropsWithoutRef<"th">) => (
    <th
      className={clsx(
        "whitespace-nowrap border-b border-border/60 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted",
        className,
      )}
    >
      {children}
    </th>
  ),
  td: ({ children, className }: React.ComponentPropsWithoutRef<"td">) => {
    const isOrg = clsx(className).includes("col--org");
    const isEmpty =
      children == null ||
      children === "" ||
      (Array.isArray(children) && children.every((c) => c == null || c === ""));
    // Ô bộ phận/công ty trống = dòng công việc tiếp theo của CÙNG bộ phận (BE gộp).
    // Không để trơ trẽn như bảng lỗi — dấu tiếp-tục mảnh, canh trái.
    if (isOrg && isEmpty) {
      return (
        <td className={clsx("px-4 py-2.5 align-top", className)}>
          <span className="mt-1 block h-0.5 w-3.5 rounded-full bg-border" aria-hidden />
        </td>
      );
    }
    // Ô bộ phận: tách "(khoảng ngày)" ở cuối xuống dòng riêng, nhỏ + mờ hơn.
    if (isOrg && typeof children === "string") {
      const m = children.match(/^(.*?)\s*(\([^()]*\))\s*$/);
      if (m) {
        return (
          <td className={clsx("px-4 py-2.5 align-top text-text-primary", className)}>
            <div className="font-medium text-text-secondary break-words">{m[1]}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">{m[2]}</div>
          </td>
        );
      }
    }
    return (
      <td
        className={clsx(
          "px-4 py-2.5 align-top text-text-primary",
          isOrg && "font-medium text-text-secondary",
          className,
        )}
      >
        <div className="whitespace-pre-wrap break-words">{children}</div>
      </td>
    );
  },
};
