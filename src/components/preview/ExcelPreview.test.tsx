import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelPreview } from "./ExcelPreview";

const maliciousCell = '<img src=x onerror="globalThis.__excelPwned=true">';

vi.mock("xlsx", () => ({
  read: vi.fn(() => ({
    SheetNames: ["Sheet 1"],
    Sheets: { "Sheet 1": {} },
  })),
  utils: {
    sheet_to_html: vi.fn(() => `<table><tr><td>Name</td><td>Value</td></tr><tr><td>unsafe</td><td>${maliciousCell}</td></tr></table>`),
    decode_range: vi.fn(() => ({ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } })),
    encode_col: vi.fn((c: number) => String.fromCharCode(65 + c)),
  },
}));


describe("ExcelPreview", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
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
