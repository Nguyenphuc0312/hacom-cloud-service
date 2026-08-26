import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bindAuthSessionIdentity,
  clearBoundAuthSessionIdentity,
  compareIdentity,
  getBoundAuthSessionUserId,
  getTokenIdentity,
  reportAuthIdentityMismatch,
  resetAuthIdentityGuard,
  setAuthIdentityMismatchHandler,
  validateBoundAuthSessionIdentity,
  type IdentityComparison,
} from "./authIdentityGuard";

// Build an unsigned JWT (header.payload.signature) with the given claims.
const makeToken = (claims: Record<string, unknown>): string => {
  const b64 = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
};

describe("getTokenIdentity", () => {
  it("extracts authUserId (preferring authUserId over userId/sub) and lowercases email", () => {
    const token = makeToken({ authUserId: "u-1", userId: "x", sub: "y", email: "A@Hacom.VN" });
    expect(getTokenIdentity(token)).toEqual({ authUserId: "u-1", email: "a@hacom.vn" });
  });

  it("falls back to userId then sub", () => {
    expect(getTokenIdentity(makeToken({ userId: "u-2" }))?.authUserId).toBe("u-2");
    expect(getTokenIdentity(makeToken({ sub: "u-3" }))?.authUserId).toBe("u-3");
  });

  it("returns null for non-JWT / empty / claimless tokens", () => {
    expect(getTokenIdentity(null)).toBe(null);
    expect(getTokenIdentity("not-a-jwt")).toBe(null);
    expect(getTokenIdentity(makeToken({ foo: "bar" }))).toBe(null);
  });
});

describe("compareIdentity", () => {
  it("flags mismatch when authUserId differs (the contamination case)", () => {
    const token = makeToken({ authUserId: "user-B", email: "b@hacom.vn" });
    const result = compareIdentity(token, { id: "user-A", email: "a@hacom.vn" });
    expect(result.mismatch).toBe(true);
    expect(result.tokenAuthUserId).toBe("user-B");
    expect(result.userId).toBe("user-A");
  });

  it("matches when authUserId is equal (email case-insensitive ignored when id present)", () => {
    const token = makeToken({ authUserId: "user-A", email: "a@hacom.vn" });
    expect(compareIdentity(token, { id: "user-A", email: "A@HACOM.VN" }).mismatch).toBe(false);
  });

  it("falls back to email when authUserId missing on one side", () => {
    const token = makeToken({ email: "b@hacom.vn" }); // no authUserId
    expect(compareIdentity(token, { id: "user-A", email: "a@hacom.vn" }).mismatch).toBe(true);
    expect(compareIdentity(token, { id: "user-A", email: "B@hacom.vn" }).mismatch).toBe(false);
  });

  it("never false-positives when data is missing", () => {
    expect(compareIdentity(null, { id: "user-A" }).mismatch).toBe(false);
    expect(compareIdentity(makeToken({ authUserId: "u" }), null).mismatch).toBe(false);
    expect(compareIdentity(makeToken({ authUserId: "u" }), {}).mismatch).toBe(false);
  });
});

describe("browser auth-session identity binding", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("binds an explicit login and accepts only the same principal on reload", () => {
    const token = makeToken({ authUserId: "user-A", email: "a@hacom.vn" });

    expect(
      bindAuthSessionIdentity(token, { id: "user-A", email: "a@hacom.vn" }),
    ).toBe(true);
    expect(getBoundAuthSessionUserId()).toBe("user-A");
    expect(
      validateBoundAuthSessionIdentity(token, {
        id: "user-A",
        email: "a@hacom.vn",
      }),
    ).toBe("match");
  });

  it("rejects a valid refreshed token and /me response for another account", () => {
    const tokenA = makeToken({ authUserId: "user-A" });
    const tokenB = makeToken({ authUserId: "system-super-admin" });
    expect(bindAuthSessionIdentity(tokenA, { id: "user-A" })).toBe(true);

    expect(
      validateBoundAuthSessionIdentity(tokenB, {
        id: "system-super-admin",
      }),
    ).toBe("mismatch");
  });

  it("keeps each tab bound when another tab replaces the persistent account", () => {
    sessionStorage.setItem("authSessionUserId", "user-A");
    localStorage.setItem("authSessionUserId", "system-super-admin");

    expect(getBoundAuthSessionUserId()).toBe("user-A");
    expect(
      validateBoundAuthSessionIdentity(
        makeToken({ authUserId: "system-super-admin" }),
        { id: "system-super-admin" },
      ),
    ).toBe("mismatch");
  });

  it("fails closed for a legacy session without a principal binding", () => {
    expect(
      validateBoundAuthSessionIdentity(makeToken({ authUserId: "user-A" }), {
        id: "user-A",
      }),
    ).toBe("missing");
  });

  it("clears the binding during logout cleanup", () => {
    expect(
      bindAuthSessionIdentity(makeToken({ authUserId: "user-A" }), {
        id: "user-A",
      }),
    ).toBe(true);
    clearBoundAuthSessionIdentity();
    expect(getBoundAuthSessionUserId()).toBeNull();
  });
});

describe("reportAuthIdentityMismatch (one-shot)", () => {
  beforeEach(() => {
    resetAuthIdentityGuard();
    setAuthIdentityMismatchHandler(null);
  });

  it("invokes the handler exactly once until reset", () => {
    const handler = vi.fn();
    setAuthIdentityMismatchHandler(handler);
    const info = { mismatch: true } as IdentityComparison;

    reportAuthIdentityMismatch(info);
    reportAuthIdentityMismatch(info);
    expect(handler).toHaveBeenCalledTimes(1);

    resetAuthIdentityGuard();
    reportAuthIdentityMismatch(info);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
