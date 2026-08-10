import { describe, expect, it } from "vitest";
import { resolveCloudUserId } from "./cloudIdentity";

const tokenWithSubject = "e30.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature";

describe("resolveCloudUserId", () => {
  it("prefers the hydrated auth user", () => {
    expect(resolveCloudUserId("profile-user", tokenWithSubject)).toBe(
      "profile-user",
    );
  });

  it("falls back to the authenticated token subject", () => {
    expect(resolveCloudUserId(undefined, tokenWithSubject)).toBe("user-123");
  });

  it("does not invent an identity when neither source is valid", () => {
    expect(resolveCloudUserId(undefined, "not-a-jwt")).toBeUndefined();
  });
});
