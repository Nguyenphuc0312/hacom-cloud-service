import { describe, expect, it, vi } from "vitest";

import { resolveEmploymentStatusLabel } from "./profileFormat";

describe("resolveEmploymentStatusLabel", () => {
  it("maps the legacy RESIGNED code to the ADMIN label", () => {
    const translate = vi.fn((key: string) => key);

    expect(resolveEmploymentStatusLabel("RESIGNED", translate)).toBe(
      "profile:settings.employmentStatusValues.ADMIN",
    );
    expect(translate).toHaveBeenCalledWith(
      "profile:settings.employmentStatusValues.ADMIN",
      { defaultValue: "ADMIN" },
    );
  });
});
