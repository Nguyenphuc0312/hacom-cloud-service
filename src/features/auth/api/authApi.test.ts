import { describe, expect, it } from "vitest";
import { normalizeAuthResponse } from "./authApi";

describe("normalizeAuthResponse", () => {
  it("adapts the normalized Auth /me HR profile into legacy UI state", () => {
    const result = normalizeAuthResponse({
      user: {
        id: "auth-user-1",
        username: "HC000975",
        accountEmail: "account@example.com",
        hrProfile: {
          employeeId: "hr-employee-1",
          employeeCode: "HC000975",
          fullName: "HR Canonical Name",
          phone: "0900000000",
          organization: {
            unitName: "Hacom Holdings",
            unitCode: "DV001",
            departmentName: "Engineering",
          },
        },
      },
    });

    expect(result.user).toMatchObject({
      email: "account@example.com",
      employeeCode: "HC000975",
      hrEmployeeId: "hr-employee-1",
      fullNameFromHr: "HR Canonical Name",
      effectiveDisplayName: "HR Canonical Name",
      phone: "0900000000",
      departmentName: "Engineering",
      orgUnit: "Hacom Holdings",
      unitCode: "DV001",
    });
  });
});
