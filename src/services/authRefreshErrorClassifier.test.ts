import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import {
  isDefiniteAuthRefreshFailure,
  isTransientRefreshFailure,
} from "./authRefreshErrorClassifier";

const axiosError = (status: number, data: unknown): AxiosError =>
  new AxiosError(
    "refresh failed",
    undefined,
    {} as InternalAxiosRequestConfig,
    undefined,
    {
      status,
      statusText: "error",
      headers: {},
      config: {} as InternalAxiosRequestConfig,
      data,
    },
  );

describe("authRefreshErrorClassifier", () => {
  it("keeps the web session for HTTP 429", () => {
    const error = axiosError(429, { error: { code: "RATE_LIMITED" } });

    expect(isDefiniteAuthRefreshFailure(error)).toBe(false);
    expect(isTransientRefreshFailure(error)).toBe(true);
  });

  it("classifies a tagged revoked refresh token as terminal", () => {
    const error = axiosError(401, {
      error: { details: { reasonCode: "REFRESH_TOKEN_REVOKED" } },
    });

    expect(isDefiniteAuthRefreshFailure(error)).toBe(true);
    expect(isTransientRefreshFailure(error)).toBe(false);
  });
});
