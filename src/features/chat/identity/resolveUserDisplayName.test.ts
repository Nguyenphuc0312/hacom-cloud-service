import { describe, expect, it } from "vitest";
import { resolveUserDisplayName } from "./resolveUserDisplayName";

describe("resolveUserDisplayName", () => {
  it("prefers display name over every other field", () => {
    expect(
      resolveUserDisplayName({
        displayName: "Display Name",
        fullNameFromHR: "HR Name",
        username: "username-1",
        employeeCode: "EMP001",
      }),
    ).toBe("Display Name");
  });

  it("falls back to HR full name, then full name, then username, then employee code", () => {
    expect(
      resolveUserDisplayName({
        full_name_from_hr: "HR Full Name",
        full_name: "Profile Full Name",
        username: "username-1",
        employee_code: "EMP001",
      }),
    ).toBe("HR Full Name");

    expect(
      resolveUserDisplayName({
        full_name: "Profile Full Name",
        username: "username-1",
        employee_code: "EMP001",
      }),
    ).toBe("Profile Full Name");

    expect(
      resolveUserDisplayName({
        username: "username-1",
        employee_code: "EMP001",
      }),
    ).toBe("username-1");

    expect(
      resolveUserDisplayName({
        employee_code: "EMP001",
      }),
    ).toBe("EMP001");
  });

  it('returns "Unknown user" for empty candidates', () => {
    expect(resolveUserDisplayName(null)).toBe("Unknown user");
    expect(
      resolveUserDisplayName({
        displayName: " ",
        fullNameFromHR: "",
        username: " ",
      }),
    ).toBe("Unknown user");
  });
});
