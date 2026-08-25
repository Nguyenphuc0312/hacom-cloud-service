import { render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelPreview } from "./ExcelPreview";

const maliciousCell = '<img src=x onerror="globalThis.__excelPwned=true">';

const buildWorkbook = (): ArrayBuffer => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Value"],
    ["unsafe", maliciousCell],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet 1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
};

describe("ExcelPreview", () => {
  beforeEach(() => {
    const workbook = buildWorkbook();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => workbook,
      }),
    );
  });

  it("renders workbook cells as text instead of executable HTML", async () => {
    const { container } = render(
      <ExcelPreview url="/files/untrusted.xlsx" fileName="untrusted.xlsx" />,
    );

    await waitFor(() => expect(screen.getByText(maliciousCell)).not.toBeNull());

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
