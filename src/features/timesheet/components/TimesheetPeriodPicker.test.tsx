import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimesheetPeriodPicker } from "./TimesheetPeriodPicker";

describe("TimesheetPeriodPicker", () => {
  it("shows a locale-independent Vietnamese month and year selector", () => {
    const onMonthChange = vi.fn();
    const onYearChange = vi.fn();

    render(
      <TimesheetPeriodPicker
        month={8}
        year={2026}
        onMonthChange={onMonthChange}
        onYearChange={onYearChange}
      />,
    );

    expect(
      screen.getByRole("option", { name: "Tháng 08" }).selected,
    ).toBe(true);
    expect(screen.getByRole("option", { name: "2026" }).selected).toBe(true);

    fireEvent.change(screen.getByLabelText("Tháng"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Năm"), { target: { value: "2025" } });

    expect(onMonthChange).toHaveBeenCalledWith(9);
    expect(onYearChange).toHaveBeenCalledWith(2025);
  });
});
