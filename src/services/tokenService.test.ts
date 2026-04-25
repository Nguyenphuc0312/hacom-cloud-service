import { afterEach, describe, expect, it } from "vitest";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isAccessTokenLocalStorageMode,
  storeTokens,
} from "./tokenService";
import { AUTH_CONFIG } from "../config";

afterEach(() => {
  clearTokens();
  localStorage.clear();
  sessionStorage.clear();
});

describe("tokenService storage policy", () => {
  it("stores access tokens in sessionStorage by default even when remember-me is enabled", () => {
    expect(isAccessTokenLocalStorageMode()).toBe(false);

    storeTokens("access-token", "refresh-token", true);

    expect(getAccessToken()).toBe("access-token");
    expect(sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)).toBe(
      "access-token",
    );
    expect(localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
  });

  it("clears access and refresh tokens from both storage areas", () => {
    storeTokens("access-token", "refresh-token", true);

    expect(getRefreshToken()).toBe("refresh-token");

    clearTokens();

    expect(sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY)).toBeNull();
  });
});
