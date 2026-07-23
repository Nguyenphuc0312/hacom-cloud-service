import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

describe("SegmentedControl", () => {
  it("lays tabs out in equal columns so labels/counts cannot skew widths", () => {
    render(
      <SegmentedControl
        value="all"
        onChange={() => {}}
        options={[
          { id: "all", label: "Tất cả", count: 40 },
          { id: "groups", label: "Nhóm", count: 10 },
        ]}
      />,
    );

    const list = screen.getByRole("tablist");
    expect(list.className).toContain("auto-cols-fr");
    expect(list.className).not.toContain("overflow-x-auto");

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-w-0");
      expect(tab.className).not.toContain("flex-[1_0_auto]");
    }
  });

  it("hides the count badge at zero and keeps it non-shrinking otherwise", () => {
    render(
      <SegmentedControl
        value="all"
        onChange={() => {}}
        options={[
          { id: "all", label: "Tất cả", count: 0 },
          { id: "groups", label: "Nhóm", count: 120 },
        ]}
      />,
    );

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("99+").className).toContain("shrink-0");
  });
});
