import { describe, expect, it } from "vitest";

import { resolveUserDisplayName } from "../../../identity/resolveUserDisplayName";
import { resolveDisplayName } from "./resolveDisplayName";

describe("resolveDisplayName (group members)", () => {
  it("prefers the self-chosen displayName over the HR legal name", () => {
    // Regression: the member list used to rank fullNameFromHR first, so a user
    // who renamed themselves appeared under their HR name here while every
    // other Chat surface showed the new name.
    expect(
      resolveDisplayName({
        displayName: "Đậu Cao Minh Nhậtttt",
        fullNameFromHR: "Đậu Cao Minh Nhật",
        username: "HC000975",
      }),
    ).toEqual({ displayName: "Đậu Cao Minh Nhậtttt", usedFallback: false });
  });

  it("agrees with the app-wide resolver for the same member", () => {
    const member = {
      displayName: "Nguyễn Thế Huy Hoàng",
      fullNameFromHR: "Nguyễn Thế Huy Hoàn",
      username: "devhacom",
    };

    expect(resolveDisplayName(member).displayName).toBe(
      resolveUserDisplayName(member),
    );
  });

  it("falls back to the HR name when displayName is empty", () => {
    expect(
      resolveDisplayName({
        displayName: "   ",
        fullNameFromHR: "Đậu Cao Minh Nhật",
        username: "HC000975",
      }),
    ).toEqual({ displayName: "Đậu Cao Minh Nhật", usedFallback: false });
  });

  it("does not show an employee code as a name when a real name exists", () => {
    expect(
      resolveDisplayName({
        displayName: "HC000975",
        fullNameFromHR: "Đậu Cao Minh Nhật",
        username: "HC000975",
      }),
    ).toEqual({ displayName: "Đậu Cao Minh Nhật", usedFallback: false });
  });

  it("marks technical stand-ins as fallbacks", () => {
    expect(
      resolveDisplayName({ username: "HC000975" }),
    ).toEqual({ displayName: "HC000975", usedFallback: true });

    expect(
      resolveDisplayName({ email: "nhat@hacom.vn" }),
    ).toEqual({ displayName: "Nhat", usedFallback: true });

    expect(resolveDisplayName({})).toEqual({
      displayName: "Người dùng",
      usedFallback: true,
    });
  });

  it("never renders an email address as the member name", () => {
    expect(
      resolveDisplayName({
        displayName: "nhat@hacom.vn",
        email: "nhat@hacom.vn",
      }).displayName,
    ).not.toContain("@");
  });
});
