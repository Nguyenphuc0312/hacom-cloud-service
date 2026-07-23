import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";

import {
  isAxiosTimeoutError,
  isNetworkError,
  resolveSendFailureDescriptor,
} from "./sendFailure";

const apiError = (statusCode: number) =>
  ({ statusCode, message: "" }) as ReturnType<
    typeof import("../lib/apiContract").extractApiError
  >;

const axiosError = (partial: Partial<AxiosError>): AxiosError =>
  Object.assign(new AxiosError("boom"), partial);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAxiosTimeoutError", () => {
  it("nhận ECONNABORTED", () => {
    expect(isAxiosTimeoutError(axiosError({ code: "ECONNABORTED" }))).toBe(true);
  });

  it("nhận qua nội dung message, không phân biệt hoa thường", () => {
    expect(isAxiosTimeoutError(axiosError({ message: "Timeout of 5s" }))).toBe(
      true,
    );
  });

  it("lỗi thường / không phải axios thì false", () => {
    expect(isAxiosTimeoutError(axiosError({ message: "boom" }))).toBe(false);
    expect(isAxiosTimeoutError(new Error("timeout"))).toBe(false);
    expect(isAxiosTimeoutError(null)).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("trình duyệt báo offline → luôn coi là lỗi mạng", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkError(new Error("bất kỳ"))).toBe(true);
  });

  it("axios không có response = không tới được server", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNetworkError(axiosError({}))).toBe(true);
  });

  it("server CÓ trả lời thì không phải lỗi mạng", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(
      isNetworkError(axiosError({ response: { status: 500 } as never })),
    ).toBe(false);
  });
});

describe("resolveSendFailureDescriptor — phân loại để user biết nên làm gì", () => {
  it("timeout được ưu tiên trước mọi phân loại khác", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = resolveSendFailureDescriptor(
      axiosError({ code: "ECONNABORTED" }),
      apiError(500),
    );
    expect(result.failureReason).toBe("timeout");
    expect(result.errorCode).toBe("REQUEST_TIMEOUT");
  });

  it("mất mạng xếp trước lỗi từ server", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = resolveSendFailureDescriptor(new Error("x"), apiError(500));
    expect(result.failureReason).toBe("network");
    expect(result.errorCode).toBe("NETWORK_OFFLINE");
  });

  it("5xx = lỗi phía server", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = resolveSendFailureDescriptor(
      axiosError({ response: { status: 503 } as never }),
      apiError(503),
    );
    expect(result.failureReason).toBe("backend_5xx");
  });

  it("4xx = tin bị từ chối", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = resolveSendFailureDescriptor(
      axiosError({ response: { status: 422 } as never }),
      apiError(422),
    );
    expect(result.failureReason).toBe("backend_4xx");
  });

  it("không rơi vào nhóm nào thì 'unknown', KHÔNG ném lỗi", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const result = resolveSendFailureDescriptor(
      new Error("lạ"),
      apiError(0),
    );
    expect(result.failureReason).toBe("unknown");
    expect(result.errorCode).toBe("UNKNOWN_ERROR");
  });

  it("mọi nhánh đều có mã lý do và mã lỗi riêng, không nhánh nào bỏ trống", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const seen = new Set<string>();

    for (const [error, status] of [
      [axiosError({ code: "ECONNABORTED" }), 0],
      [axiosError({ response: { status: 500 } as never }), 500],
      [axiosError({ response: { status: 400 } as never }), 400],
      [new Error("x"), 0],
    ] as const) {
      const result = resolveSendFailureDescriptor(error, apiError(status));
      expect(result.failureReason).toBeTruthy();
      expect(result.errorCode).toBeTruthy();
      seen.add(result.errorCode);
      // `errorMessage` cố ý KHÔNG assert nội dung: nó đi qua i18n, mà trong
      // môi trường test i18n chưa init nên `t()` trả chuỗi rỗng (defaultValue
      // không được áp dụng). Đó là hành vi của i18n, không phải của hàm này.
    }

    // 4 nhánh → 4 mã khác nhau, để log/telemetry phân biệt được nguyên nhân.
    expect(seen.size).toBe(4);
  });
});
