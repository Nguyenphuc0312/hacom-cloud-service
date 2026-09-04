import { beforeEach, describe, expect, it } from "vitest";
import { getDmsAccessToken } from "./dmsOAuth";

const token = (expiresAt: number): string => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAt / 1000) }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
};

describe("DMS OAuth token boundary", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps a short-lived DMS resource token in tab storage only", () => {
    const accessToken = token(Date.now() + 120_000);
    sessionStorage.setItem("hacom.dms.access-token", accessToken);
    expect(getDmsAccessToken()).toBe(accessToken);
    expect(localStorage.getItem("hacom.dms.access-token")).toBeNull();
  });

  it("fails closed and removes an expired token", () => {
    sessionStorage.setItem("hacom.dms.access-token", token(Date.now() - 1_000));
    expect(getDmsAccessToken()).toBeNull();
    expect(sessionStorage.getItem("hacom.dms.access-token")).toBeNull();
  });
});
