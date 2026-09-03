import { describe, expect, it } from "vitest";

import {
  WEEKDAY_LABELS,
  WEEK_COLUMNS,
  datesInMonth,
  gridColumnFor,
  weekdayIndex,
} from "./timesheetCalendar";

/**
 * The month grid used to render bare numbers 1..31 in whatever order they
 * arrived, so a reader could not tell which day was a Saturday without counting
 * by hand — and the columns did not line up with any weekday.
 */
describe("weekdayIndex", () => {
  it("reads the weekday from the date string, not the local timezone", () => {
    // 2026-08-22 is a Saturday, 2026-08-23 a Sunday, 2026-08-24 a Monday.
    expect(weekdayIndex("2026-08-22")).toBe(6);
    expect(weekdayIndex("2026-08-23")).toBe(0);
    expect(weekdayIndex("2026-08-24")).toBe(1);
  });

  it("labels those days the way a Vietnamese calendar does", () => {
    expect(WEEKDAY_LABELS[weekdayIndex("2026-08-22")]).toBe("T7");
    expect(WEEKDAY_LABELS[weekdayIndex("2026-08-23")]).toBe("CN");
    expect(WEEKDAY_LABELS[weekdayIndex("2026-08-24")]).toBe("T2");
  });
});

describe("gridColumnFor", () => {
  it("starts the week on Monday and pushes Sunday to the last column", () => {
    expect(gridColumnFor("2026-08-24")).toBe(1); // Monday
    expect(gridColumnFor("2026-08-22")).toBe(6); // Saturday
    expect(gridColumnFor("2026-08-23")).toBe(7); // Sunday
  });

  it("puts every day under its own header column", () => {
    for (let day = 1; day <= 31; day += 1) {
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const column = gridColumnFor(date);
      expect(WEEK_COLUMNS[column - 1]).toBe(WEEKDAY_LABELS[weekdayIndex(date)]);
    }
  });

  it("keeps the header row and the column count in step", () => {
    expect(WEEK_COLUMNS).toHaveLength(7);
    expect(WEEKDAY_LABELS).toHaveLength(7);
  });
});

describe("datesInMonth", () => {
  it("always returns the full selected month", () => {
    const september = datesInMonth(2026, 9);

    expect(september).toHaveLength(30);
    expect(september[0]).toBe("2026-09-01");
    expect(september.at(-1)).toBe("2026-09-30");
  });

  it("includes leap day when February has one", () => {
    expect(datesInMonth(2028, 2)).toHaveLength(29);
    expect(datesInMonth(2028, 2).at(-1)).toBe("2028-02-29");
  });
});
