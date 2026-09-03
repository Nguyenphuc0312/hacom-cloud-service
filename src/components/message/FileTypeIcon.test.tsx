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

  it("renders outline Excel as a solid brand tile", () => {
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
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("#217346");
    expect(container.querySelector("text")?.textContent).toBe("X");
  });

  // Real Office files match PDF's solid tile in the storage list. Two icon
  // styles side by side made PDF jump out while .docx/.xlsx receded; the
  // brand colour carries the type, so a glance is enough to tell them apart.
  it.each([
    ["bang-ke.xlsx", "Excel", "X", "#217346"],
    ["huong-dan.docx", "Word", "W", "#2B579A"],
    ["slide.pptx", "PowerPoint", "P", "#D24726"],
  ])("renders outline %s as a solid %s tile", (fileName, title, label, fill) => {
    const { container } = render(
      <FileTypeIcon type="generic" fileName={fileName} variant="outline" />,
    );

    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-label")).toBe(title);
    expect(container.querySelector("text")?.textContent).toBe(label);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe(fill);
  });

  // Non-Office files carry the same solid tile, labelled with the extension.
  it.each([
    ["ban-giao.zip", "ZIP", "archive"],
    ["anh.png", "PNG", "image"],
    ["clip.mp4", "MP4", "video"],
  ])("renders outline %s as a solid tile labelled %s", (fileName, label, type) => {
    const { container } = render(
      <FileTypeIcon
        type={type as React.ComponentProps<typeof FileTypeIcon>["type"]}
        fileName={fileName}
        variant="outline"
      />,
    );

    expect(container.querySelector("rect")).not.toBeNull();
    expect(container.querySelector("text")?.textContent).toBe(label);
  });

  // .csv shares the "spreadsheet" type with .xlsx but is not Excel, so it gets
  // its own CSV tile rather than borrowing Excel's "X".
  it("labels .csv as CSV, never as Excel", () => {
    const { container } = render(
      <FileTypeIcon type="spreadsheet" fileName="du-lieu.csv" variant="outline" />,
    );

    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("CSV");
    expect(container.querySelector("text")?.textContent).toBe("CSV");
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

    // TXT, not "W" — .txt shares the "document" type with .docx but is not Word.
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("TXT");
    expect(container.querySelector("text")?.textContent).toBe("TXT");
  });

  // No filename → no extension to trust. The thin sheet is the safe fallback:
  // a solid "W" tile on an unknown attachment would claim a type we don't know.
  it("falls back to the thin sheet when the filename is missing", () => {
    const { container } = render(<FileTypeIcon type="document" variant="outline" />);

    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Word");
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
