import { describe, expect, it } from "vitest";
import {
  isoToDisplay,
  displayToIso,
  buildMonthCells,
} from "../../common/resource-filter/dateRange";

describe("isoToDisplay", () => {
  it("converts yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(isoToDisplay("2026-07-06")).toBe("06/07/2026");
  });
  it("returns empty for partial/invalid iso", () => {
    expect(isoToDisplay("2026-07")).toBe("");
    expect(isoToDisplay("")).toBe("");
  });
});

describe("displayToIso", () => {
  it("parses dd/mm/yyyy to yyyy-mm-dd", () => {
    expect(displayToIso("06/07/2026")).toBe("2026-07-06");
  });
  it("rejects overflow dates (31/02) and garbage", () => {
    expect(displayToIso("31/02/2026")).toBeNull();
    expect(displayToIso("6/7/2026")).toBeNull();
    expect(displayToIso("")).toBeNull();
  });
});

describe("buildMonthCells", () => {
  // July 2026 (month0=6): 1st is a Wednesday (dow=3), 31 days.
  const cells = buildMonthCells(2026, 6);

  it("always fills a 6×7 grid", () => {
    expect(cells).toHaveLength(42);
  });

  it("places the 1st in the correct weekday column with leading prev-month days", () => {
    const firstInMonth = cells.findIndex((c) => c.inMonth);
    // 3 leading days (Sun–Tue) before Wed 1 July.
    expect(firstInMonth).toBe(3);
    expect(cells[0]).toMatchObject({ iso: "2026-06-28", inMonth: false });
    expect(cells[3]).toMatchObject({ iso: "2026-07-01", day: 1, inMonth: true });
  });

  it("has 31 in-month days for July", () => {
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
    expect(cells.find((c) => c.iso === "2026-07-31")?.inMonth).toBe(true);
  });
});
