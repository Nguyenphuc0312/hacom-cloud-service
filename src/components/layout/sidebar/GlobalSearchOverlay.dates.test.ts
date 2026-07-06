import { describe, expect, it } from "vitest";
import { isoToDisplay, displayToIso } from "./GlobalSearchOverlay";

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
