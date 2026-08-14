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

  it("keeps the self-chosen displayName instead of the HR legal name", () => {
    // Regression: the adapter preferred `hrProfile.fullName` for `displayName`,
    // so every `/me` overwrote the name the user had just saved — the rename
    // reported success and then snapped back to the HR name on refresh.
    const result = normalizeAuthResponse({
      user: {
        id: "auth-user-1",
        username: "HC000975",
        displayName: "Đậu Cao Minh Nhậtttt",
        hrProfile: {
          employeeCode: "HC000975",
          fullName: "Đậu Cao Minh Nhật",
        },
      },
    });

    expect(result.user).toMatchObject({
      displayName: "Đậu Cao Minh Nhậtttt",
      effectiveDisplayName: "Đậu Cao Minh Nhậtttt",
      // HR stays reachable so it can still win when displayName is empty.
      fullNameFromHr: "Đậu Cao Minh Nhật",
    });
  });

  it("falls back to the HR name when the user has no displayName", () => {
    const result = normalizeAuthResponse({
      user: {
        id: "auth-user-1",
        username: "HC000975",
        displayName: "   ",
        hrProfile: { fullName: "Đậu Cao Minh Nhật" },
      },
    });

    expect(result.user).toMatchObject({
      displayName: "Đậu Cao Minh Nhật",
      effectiveDisplayName: "Đậu Cao Minh Nhật",
    });
  });
});
