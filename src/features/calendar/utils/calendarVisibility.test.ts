import { describe, expect, it } from "vitest";

import {
  apiVisibilityToForm,
  meetingVisibilityToApi,
  personalVisibilityToApi,
} from "./calendarVisibility";

describe("calendar visibility mapping", () => {
  it("maps personal private to canonical PRIVATE", () => {
    expect(personalVisibilityToApi("private")).toBe("PRIVATE");
  });

  it("maps personal public to canonical PUBLIC", () => {
    expect(personalVisibilityToApi("public")).toBe("PUBLIC");
  });

  it("keeps meeting private as BUSY_ONLY", () => {
    expect(meetingVisibilityToApi("private")).toBe("BUSY_ONLY");
  });

  it("hydrates API visibility into the two-option form model", () => {
    expect(apiVisibilityToForm("PRIVATE")).toBe("private");
    expect(apiVisibilityToForm("BUSY_ONLY")).toBe("private");
    expect(apiVisibilityToForm("PUBLIC")).toBe("public");
  });
});
