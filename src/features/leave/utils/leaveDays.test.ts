import { describe, expect, it } from "vitest";

import { calculateLeaveDays } from "./leaveDays";

describe("calculateLeaveDays", () => {
  it("counts full single-day leave", () => {
    expect(calculateLeaveDays("2026-08-10", "2026-08-10", "FULL", "FULL")).toBe(1);
  });

  it("counts half-day leave", () => {
    expect(calculateLeaveDays("2026-08-10", "2026-08-10", "AM", "AM")).toBe(0.5);
    expect(calculateLeaveDays("2026-08-10", "2026-08-10", "PM", "PM")).toBe(0.5);
  });

  it("subtracts edge half-days for multi-day leave", () => {
    expect(calculateLeaveDays("2026-08-10", "2026-08-12", "PM", "AM")).toBe(2);
  });

  it("rejects invalid or reversed ranges", () => {
    expect(calculateLeaveDays("bad", "2026-08-12", "FULL", "FULL")).toBe(0);
    expect(calculateLeaveDays("2026-08-12", "2026-08-10", "FULL", "FULL")).toBe(0);
  });
});
