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
});
