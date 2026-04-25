import { describe, expect, it } from "vitest";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import {
  extractApiError,
  getSafeApiErrorMessage,
  parseRetryAfterSeconds,
} from "./apiContract";

const buildAxiosError = (
  status?: number,
  data?: unknown,
  headers?: Record<string, string>,
) => ({
  isAxiosError: true,
  message: "Request failed with raw backend detail",
  response:
    status === undefined
      ? undefined
      : {
          status,
          data,
          headers,
        },
});

describe("api error normalization", () => {
  it("parses Retry-After seconds and HTTP-date values", () => {
    expect(parseRetryAfterSeconds("12")).toBe(12);
    expect(
      parseRetryAfterSeconds("Wed, 21 Oct 2015 07:28:00 GMT", Date.parse("2015-10-21T07:27:30Z")),
    ).toBe(30);
    expect(parseRetryAfterSeconds("invalid")).toBeUndefined();
  });

  it("normalizes 429 with retry metadata and safe copy", () => {
    const error = extractApiError(buildAxiosError(429, undefined, { "retry-after": "9" }));

    expect(error.status).toBe(429);
    expect(error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(error.isRateLimit).toBe(true);
    expect(error.retryAfterSeconds).toBe(9);
    expect(error.message).toBe("Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.");
  });

  it("normalizes offline failures without leaking raw axios message", () => {
    const error = extractApiError(buildAxiosError());

    expect(error.status).toBe(0);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toBe("Mất kết nối mạng. Kiểm tra Internet rồi thử lại.");
    expect(error.message).not.toContain("raw backend");
  });

  it("normalizes 413 payload-too-large responses with safe copy", () => {
    const error = extractApiError(buildAxiosError(413));

    expect(error.status).toBe(413);
    expect(error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(error.message).toBe(
      "Tin nhắn quá dài. Vui lòng rút gọn nội dung hoặc gửi dưới dạng tệp.",
    );
  });

  it("uses safe generic text for unknown runtime errors", () => {
    const error = extractApiError(new Error("stack includes internal token"));

    expect(error.status).toBe(500);
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.message).toBe(getSafeApiErrorMessage(500));
    expect(error.message).not.toContain("token");
  });
});
