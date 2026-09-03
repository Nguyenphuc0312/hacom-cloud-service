import { describe, expect, it } from "vitest";

import {
  timesheetSymbolClass,
  timesheetSymbolLookupCode,
} from "./timesheetSymbolPresentation";

describe("timesheet symbol presentation", () => {
  it.each([
    ["P", "bg-[#fff59d]"],
    ["KL", "bg-[#ff7875]"],
    ["CT", "bg-[#c7e9b4]"],
    ["TR", "bg-[#f8bbd0]"],
    ["OM", "bg-[#ffd8a8]"],
  ])("uses the canonical HRM surface for %s", (symbol, className) => {
    expect(timesheetSymbolClass(symbol)).toContain(className);
  });

  it("normalizes legacy holiday and social-insurance symbols for lookup", () => {
    expect(timesheetSymbolLookupCode("L1")).toBe("L");
    expect(timesheetSymbolLookupCode("Ô")).toBe("OM");
    expect(timesheetSymbolLookupCode("Cô")).toBe("CO");
  });
});
