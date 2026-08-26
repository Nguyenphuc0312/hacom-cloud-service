import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import { extractApiError } from "./apiContract";

describe("extractApiError", () => {
  it("keeps the HTTP status for flat contract failures without statusCode", () => {
    const error = new AxiosError(
      "Request failed with status code 401",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: { headers: {} },
        data: {
          success: false,
          error: "Yeu cau access token",
          code: "UNAUTHORIZED",
          requestId: "request-1",
        },
      },
    );

    expect(extractApiError(error)).toMatchObject({
      statusCode: 401,
      isAuthError: true,
      code: "UNAUTHORIZED",
      requestId: "request-1",
    });
  });
});
