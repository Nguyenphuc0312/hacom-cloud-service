import { render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelPreview, resolveExcelColor } from "./ExcelPreview";

const maliciousCell = '<img src=x onerror="globalThis.__excelPwned=true">';

const buildWorkbook = (): ArrayBuffer => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Value"],
    ["unsafe", maliciousCell],
  ]);
  worksheet["!cols"] = [{ width: 5 }, { width: 30 }];
  worksheet["!rows"] = [{ hpx: 28 }];
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

  it("chỉ chuyển mã màu workbook hợp lệ thành CSS", () => {
    expect(resolveExcelColor({ rgb: "FFFFFF00" })).toBe("#FFFF00");
    expect(resolveExcelColor({ theme: 0, tint: -0.15 }, [{ rgb: "FFFFFF" }])).toBe("#D9D9D9");
    expect(resolveExcelColor({ rgb: "red; background:url(javascript:alert(1))" })).toBeNull();
    expect(resolveExcelColor({ theme: 9 }, [])).toBeNull();
  });

  it("renders workbook cells as text instead of executable HTML", async () => {
    const { container } = render(
      <ExcelPreview url="/files/untrusted.xlsx" fileName="untrusted.xlsx" />,
    );

    await waitFor(() => expect(screen.getByText(maliciousCell)).not.toBeNull());

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();

    const table = container.querySelector("table");
    const cols = container.querySelectorAll("col");
    const rows = container.querySelectorAll("tr");
    expect(table?.style.width).toBe("250px");
    expect(cols[1]?.style.width).toBe("30px");
    expect(cols[2]?.style.width).toBe("180px");
    expect(rows[1]?.style.height).toBe("28px");
  });
});
