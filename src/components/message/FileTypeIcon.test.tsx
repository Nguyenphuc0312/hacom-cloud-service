import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileTypeIcon } from "./FileTypeIcon";

describe("FileTypeIcon", () => {
  it("honors an explicit Office glyph size without retaining full-size classes", () => {
    const { container } = render(<FileTypeIcon type="pdf" fileName="report.pdf" className="h-7 w-7 shrink-0" />);

    const icon = container.querySelector("svg");
    expect(icon?.classList.contains("h-7")).toBe(true);
    expect(icon?.classList.contains("w-7")).toBe(true);
    expect(icon?.classList.contains("shrink-0")).toBe(true);
    expect(icon?.classList.contains("h-full")).toBe(false);
    expect(icon?.classList.contains("w-full")).toBe(false);
  });

  it("keeps the fill-container default when no Office glyph size is supplied", () => {
    const { container } = render(<FileTypeIcon type="pdf" fileName="report.pdf" />);

    const icon = container.querySelector("svg");
    expect(icon?.classList.contains("h-full")).toBe(true);
    expect(icon?.classList.contains("w-full")).toBe(true);
  });

  it("uses the caller size for outline icons as well", () => {
    const { container } = render(<FileTypeIcon type="generic" className="h-9 w-9" />);

    const icon = container.querySelector("svg");
    expect(icon?.classList.contains("h-9")).toBe(true);
    expect(icon?.classList.contains("w-9")).toBe(true);
    expect(icon?.classList.contains("h-6")).toBe(false);
    expect(icon?.classList.contains("w-6")).toBe(false);
  });

  it("can render Excel as a Zalo-style outline document", () => {
    const { container } = render(
      <FileTypeIcon
        type="spreadsheet"
        fileName="bang-ke.xlsx"
        variant="outline"
        className="h-10 w-10"
      />,
    );

    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-label")).toBe("Excel");
    expect(container.querySelector("rect")).toBeNull();
    expect(icon?.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  // Regression: outline Word/Excel/PPT used to render a bare sheet with no
  // letter, so in the shared-files sidebar a .docx and a .xlsx were visually
  // identical while the PDF beside them kept its red glyph.
  it.each([
    ["bang-ke.xlsx", "Excel", "X"],
    ["huong-dan.docx", "Word", "W"],
    ["slide.pptx", "PowerPoint", "P"],
  ])("labels outline %s as %s", (fileName, title, label) => {
    const { container } = render(
      <FileTypeIcon type="generic" fileName={fileName} variant="outline" />,
    );

    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-label")).toBe(title);
    expect(container.querySelector("text")?.textContent).toBe(label);
    // Still the thin sheet outline, not a solid Office tile.
    expect(container.querySelector("rect")).toBeNull();
  });

  // A generic mimeType (application/octet-stream) collapses the icon type to
  // "generic", so the extension is the only remaining signal for Office files.
  it("recognises Office files even when the icon type is generic", () => {
    const { container } = render(
      <FileTypeIcon type="generic" fileName="bao-cao.xlsx" variant="tile" />,
    );

    expect(container.querySelector("text")?.textContent).toBe("X");
  });

  it("does not label a .txt file as Word in the outline variant", () => {
    const { container } = render(
      <FileTypeIcon type="document" fileName="ghi-chu.txt" variant="outline" />,
    );

    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Word");
    expect(container.querySelector("text")).toBeNull();
  });

  it("keeps PDF as a solid red glyph in the outline variant", () => {
    const { container } = render(
      <FileTypeIcon type="pdf" fileName="quyet-dinh.pdf" variant="outline" />,
    );

    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("#D32F2F");
    expect(container.querySelector("text")?.textContent).toBe("PDF");
  });

  it("renders Excel as a solid tile when file rows need stronger Office labels", () => {
    const { container } = render(
      <FileTypeIcon
        type="spreadsheet"
        fileName="bang-ke.xlsx"
        variant="tile"
        className="h-10 w-10"
      />,
    );

    expect(container.querySelector("rect")).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("X");
  });

  it("renders Word as a solid tile in message bubbles", () => {
    const { container } = render(
      <FileTypeIcon
        type="document"
        fileName="huong-dan.docx"
        variant="tile"
        className="h-12 w-12"
      />,
    );

    expect(container.querySelector("rect")).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("W");
  });
});
