import { describe, expect, it, vi } from "vitest";

import { resolveEmploymentStatusLabel } from "./profileFormat";

describe("resolveEmploymentStatusLabel", () => {
  it("maps the legacy RESIGNED code to the single TERMINATED label", () => {
    const translate = vi.fn((key: string) => key);

    expect(resolveEmploymentStatusLabel("RESIGNED", translate)).toBe(
      "profile:settings.employmentStatusValues.TERMINATED",
    );
    expect(translate).toHaveBeenCalledWith(
      "profile:settings.employmentStatusValues.TERMINATED",
      { defaultValue: "TERMINATED" },
    );
  });
});
