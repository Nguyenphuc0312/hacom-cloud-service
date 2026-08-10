import { describe, expect, it } from "vitest";
import {
  fallbackUploadMessage,
  readUploadFailureFromBody,
  readWorkReportUploadFailure,
  shouldRefreshAndRetry,
  withRetryAfterHint,
} from "./uploadFailure";

/**
 * Contract FE 07/08/26 §2 + §7. Bug gốc: FE vứt body lỗi và hiện chung một câu
 * "Đã xảy ra lỗi hệ thống", nên mọi lý do nghiệp vụ khác nhau trông y hệt nhau.
 */
describe("readUploadFailureFromBody", () => {
  it("§7.1 detail chuỗi → hiện NGUYÊN VĂN lý do BE trả", () => {
    const detail =
      "File chứa công việc của nhiều tuần. Mỗi lần chỉ được nộp đúng một tuần.";
    expect(readUploadFailureFromBody(400, JSON.stringify({ detail })).message).toBe(
      detail,
    );
  });

  it("§2 detail OBJECT → lấy detail.message, KHÔNG ra [object Object]", () => {
    const failure = readUploadFailureFromBody(
      401,
      JSON.stringify({
        detail: {
          reason: "session_expired",
          message: "Phiên đăng nhập hoặc quyền HRM không còn hiệu lực.",
          action: "refresh_token_and_retry",
        },
      }),
    );
    expect(failure.message).toBe(
      "Phiên đăng nhập hoặc quyền HRM không còn hiệu lực.",
    );
    expect(failure.message).not.toContain("[object Object]");
    expect(failure.reason).toBe("session_expired");
    expect(failure.action).toBe("refresh_token_and_retry");
  });

  it("§7.6 detail.scopes đi kèm để caller mở picker phạm vi", () => {
    const failure = readUploadFailureFromBody(
      400,
      JSON.stringify({
        detail: {
          reason: "multiple_matching_authorizations",
          message: "Vui lòng chọn phạm vi báo cáo trước khi nộp.",
          scopes: [{ displayName: "Phòng A", selectionToken: "tok" }],
        },
      }),
    );
    expect(failure.scopes).toHaveLength(1);
    expect(failure.message).toBe("Vui lòng chọn phạm vi báo cáo trước khi nộp.");
  });

  it("§2 thứ tự ưu tiên: detail.message > detail > message > error", () => {
    const all = JSON.stringify({
      detail: { message: "A" },
      message: "B",
      error: "C",
    });
    expect(readUploadFailureFromBody(400, all).message).toBe("A");
    expect(
      readUploadFailureFromBody(400, JSON.stringify({ message: "B", error: "C" }))
        .message,
    ).toBe("B");
    expect(readUploadFailureFromBody(400, JSON.stringify({ error: "C" })).message).toBe(
      "C",
    );
  });

  it("§7.9 HTTP 500 body rỗng → fallback an toàn, không nói thành công", () => {
    const message = readUploadFailureFromBody(500, "").message;
    expect(message).toBe(fallbackUploadMessage(500));
    expect(message).toContain("chưa được ghi nhận");
  });

  it("§7.9 body là HTML/stack trace của proxy → KHÔNG đổ ra UI", () => {
    const html = `<html><body>${"x".repeat(500)}</body></html>`;
    expect(readUploadFailureFromBody(502, html).message).toBe(
      fallbackUploadMessage(502),
    );
  });

  it("text thuần ngắn (không JSON) vẫn là lý do đọc được", () => {
    expect(readUploadFailureFromBody(400, "Sai form báo cáo").message).toBe(
      "Sai form báo cáo",
    );
  });

  it("detail rỗng/khoảng trắng → không chấp nhận, dùng fallback", () => {
    expect(readUploadFailureFromBody(403, JSON.stringify({ detail: "   " })).message).toBe(
      fallbackUploadMessage(403),
    );
  });

  it("§4 429 kèm Retry-After → giữ số giây để hiện thời gian chờ", () => {
    const failure = readUploadFailureFromBody(429, "{}", "90");
    expect(failure.retryAfterSeconds).toBe(90);
    expect(withRetryAfterHint(failure)).toContain("2 phút");

    const seconds = readUploadFailureFromBody(429, "{}", "30");
    expect(withRetryAfterHint(seconds)).toContain("30 giây");
  });

  it("Retry-After thiếu/hỏng → không bịa thời gian chờ", () => {
    expect(readUploadFailureFromBody(429, "{}").retryAfterSeconds).toBeUndefined();
    expect(readUploadFailureFromBody(429, "{}", "sau").retryAfterSeconds).toBeUndefined();
    const failure = readUploadFailureFromBody(429, "{}");
    expect(withRetryAfterHint(failure)).toBe(failure.message);
  });

  it("chỉ 429 mới ghép hint chờ — status khác giữ nguyên câu BE", () => {
    const failure = readUploadFailureFromBody(503, JSON.stringify({ detail: "Bảo trì" }), "60");
    expect(withRetryAfterHint(failure)).toBe("Bảo trì");
  });
});

describe("readWorkReportUploadFailure", () => {
  it("đọc qua clone() nên caller vẫn đọc lại được body gốc", async () => {
    const response = new Response(JSON.stringify({ detail: "Sai tuần" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
    expect((await readWorkReportUploadFailure(response)).message).toBe("Sai tuần");
    // Body chưa bị tiêu thụ — đây là lý do phải clone.
    await expect(response.json()).resolves.toEqual({ detail: "Sai tuần" });
  });
});

/**
 * §4: retry là hành động gửi LẠI CẢ FILE — chỉ làm khi BE nói rõ đáng làm.
 * Đoán bừa từ status 401 thì 401-vì-sai-quyền cũng bị retry vô ích.
 */
describe("shouldRefreshAndRetry", () => {
  const failure = (status: number, action?: string) =>
    readUploadFailureFromBody(
      status,
      JSON.stringify({ detail: { message: "x", ...(action ? { action } : {}) } }),
    );

  it("CHỈ retry khi 401 + action=refresh_token_and_retry", () => {
    expect(shouldRefreshAndRetry(failure(401, "refresh_token_and_retry"))).toBe(true);
  });

  it("401 detail CHUỖI (BE tuần hiện tại) → CHƯA có tín hiệu, không retry", () => {
    // BE endpoint tuần chưa chuẩn hoá 401 — FE không được tự đoán mà retry.
    expect(
      shouldRefreshAndRetry(
        readUploadFailureFromBody(401, JSON.stringify({ detail: "Hết phiên" })),
      ),
    ).toBe(false);
    expect(shouldRefreshAndRetry(readUploadFailureFromBody(401, ""))).toBe(false);
  });

  it("KHÔNG retry 400/403/409/429/5xx dù có action", () => {
    for (const status of [400, 403, 409, 429, 500, 503]) {
      expect(shouldRefreshAndRetry(failure(status, "refresh_token_and_retry"))).toBe(
        false,
      );
    }
  });

  it("KHÔNG retry khi action là giá trị khác", () => {
    expect(shouldRefreshAndRetry(failure(401, "relogin"))).toBe(false);
  });
});

describe("fallbackUploadMessage", () => {
  it("mỗi status có câu riêng, không dùng chung 'lỗi hệ thống'", () => {
    const statuses = [400, 401, 403, 409, 413, 415, 422, 429, 500, 503];
    const messages = statuses.map(fallbackUploadMessage);
    expect(new Set(messages).size).toBeGreaterThanOrEqual(9);
    for (const m of messages) expect(m).not.toContain("lỗi hệ thống");
  });

  it("5xx nói rõ báo cáo CHƯA được ghi nhận (không để user tưởng đã nộp)", () => {
    expect(fallbackUploadMessage(500)).toContain("chưa được ghi nhận");
    expect(fallbackUploadMessage(503)).toContain("chưa được ghi nhận");
  });
});
