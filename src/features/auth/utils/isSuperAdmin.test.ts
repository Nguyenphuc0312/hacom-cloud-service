import { describe, expect, it } from "vitest";

import type { User } from "../../../stores/authStore";
import { isSuperAdmin } from "./isSuperAdmin";

const user = (roles?: string[], role?: string) =>
  ({ id: "user-1", username: "tester", roles, role }) as User;

describe("isSuperAdmin", () => {
  it("accepts canonical and legacy spellings", () => {
    expect(isSuperAdmin(user(["SUPER_ADMIN"]))).toBe(true);
    expect(isSuperAdmin(user(["super-admin"]))).toBe(true);
    expect(isSuperAdmin(user(undefined, "super admin"))).toBe(true);
  });

  it("does not grant review visibility to other roles", () => {
    expect(isSuperAdmin(user(["ADMIN", "HR"]))).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});
