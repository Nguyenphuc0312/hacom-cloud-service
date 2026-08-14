import { describe, expect, it } from "vitest";

import { formatWorkDate, formatWorkDateTime } from "./workDatePresentation";

describe("workDatePresentation", () => {
  it("keeps ISO state as a day-first HRM display without timezone drift", () => {
    expect(formatWorkDate("2026-08-13")).toBe("13/08/2026");
    expect(formatWorkDate("2026-02-30")).toBe("-");
  });

  it("formats timestamp and never exposes a raw ISO fallback", () => {
    expect(formatWorkDateTime("2026-08-13T10:15:00")).toBe("13/08/2026 10:15");
    expect(formatWorkDate("not-a-date")).toBe("-");
  });
});
