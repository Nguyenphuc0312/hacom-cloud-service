import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeDmsAuthorization, getDmsAccessToken } from "./dmsOAuth";

const token = (expiresAt: number): string => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expiresAt / 1000) }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
};

describe("DMS OAuth token boundary", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("redeems a callback once across concurrent mounts and cleans its state", async () => {
    window.history.replaceState(null, "", "/chat?code=local-code&state=local-state&view=documents");
    sessionStorage.setItem("hacom.dms.oauth-state", "local-state");
    sessionStorage.setItem("hacom.dms.oauth-verifier", "local-verifier");
    sessionStorage.setItem("hacom.dms.oauth-redirect", `${window.location.origin}/chat`);
    sessionStorage.setItem("hacom.dms.oauth-document", "33333333-3333-4333-8333-333333333333");
    const accessToken = token(Date.now() + 120_000);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: accessToken }) });
    vi.stubGlobal("fetch", fetchMock);
    const first = completeDmsAuthorization();
    const second = completeDmsAuthorization();
    expect(first).toBe(second);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getDmsAccessToken()).toBe(accessToken);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("documents");
    expect(new URLSearchParams(window.location.search).get("documentId")).toBe("33333333-3333-4333-8333-333333333333");
    expect(sessionStorage.getItem("hacom.dms.oauth-document")).toBeNull();
    expect(sessionStorage.getItem("hacom.dms.oauth-verifier")).toBeNull();
    expect(await completeDmsAuthorization()).toBe(false);
  });

  it("rejects a mismatched state without exchanging or retaining callback secrets", async () => {
    window.history.replaceState(null, "", "/chat?code=local-code&state=wrong");
    sessionStorage.setItem("hacom.dms.oauth-state", "expected");
    sessionStorage.setItem("hacom.dms.oauth-verifier", "local-verifier");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeDmsAuthorization()).rejects.toThrow("DMS_OAUTH_CALLBACK_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem("hacom.dms.oauth-verifier")).toBeNull();
  });

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
