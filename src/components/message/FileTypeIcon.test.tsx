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
