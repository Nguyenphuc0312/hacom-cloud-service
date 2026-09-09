import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentPreview } from "./DocumentPreview";

describe("DocumentPreview", () => {
  it("keeps Office files in the local authenticated download flow without an iframe", () => {
    const onDownload = vi.fn();
    const { container } = render(
      <DocumentPreview
        fileName="ke-hoach.docx"
        fileSize={1_024}
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        previewType="document"
        onDownload={onDownload}
      />,
    );

    expect(
      screen.getByText(
        "Tải bản gốc về để mở và chỉnh sửa bằng Microsoft Office hoặc ứng dụng phù hợp.",
      ),
    ).toBeTruthy();
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tải bản gốc" }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("does not expose a download action when the server disallows it", () => {
    render(
      <DocumentPreview
        fileName="bao-cao.xlsx"
        mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        previewType="spreadsheet"
        canDownload={false}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Tải bản gốc" }).hasAttribute("disabled")).toBe(true);
  });
});
