import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkReportDraftJob,
  describeDraftError,
  DRAFT_PERIOD_MAX_DAYS,
  fetchDraftPreflight,
  validateDraftPeriod,
} from "./workReportDraftApi";
import { AiHttpError, PersonalAiError } from "./personalAiApi";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => "test-token",
}));

describe("validateDraftPeriod", () => {
  it("chấp nhận kỳ 1 ngày (start === end)", () => {
    expect(validateDraftPeriod("2026-08-01", "2026-08-01")).toEqual({ ok: true });
  });

  it("chấp nhận đúng 31 ngày — biên trên hợp lệ", () => {
    // 01/08 → 31/08 tính trọn hai đầu là 31 ngày.
    expect(validateDraftPeriod("2026-08-01", "2026-08-31")).toEqual({ ok: true });
  });

  it("từ chối 32 ngày — vượt biên", () => {
    const res = validateDraftPeriod("2026-08-01", "2026-09-01");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain(String(DRAFT_PERIOD_MAX_DAYS));
  });

  it("từ chối khi ngày bắt đầu sau ngày kết thúc", () => {
    const res = validateDraftPeriod("2026-08-10", "2026-08-01");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("trước");
  });

  it("từ chối khi thiếu ngày hoặc ngày rác", () => {
    expect(validateDraftPeriod("", "2026-08-01").ok).toBe(false);
    expect(validateDraftPeriod("2026-08-01", "").ok).toBe(false);
    expect(validateDraftPeriod("khong-phai-ngay", "2026-08-01").ok).toBe(false);
  });

  it("tính đúng qua mốc chuyển tháng", () => {
    // 20/08 → 19/09 là 31 ngày, vẫn hợp lệ.
    expect(validateDraftPeriod("2026-08-20", "2026-09-19")).toEqual({ ok: true });
    expect(validateDraftPeriod("2026-08-20", "2026-09-20").ok).toBe(false);
  });
});

const fetchMock = vi.fn();

describe("fetchDraftPreflight", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("gửi period + scope_token qua query", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ready: true }));

    await fetchDraftPreflight({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      scopeToken: "tok-a",
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/work-report-drafts/preflight");
    expect(url).toContain("period_start=2026-08-01");
    expect(url).toContain("period_end=2026-08-07");
    expect(url).toContain("scope_token=tok-a");
  });

  it("không đính scope_token khi không có (BE tự bind phạm vi duy nhất)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ready: true }));

    await fetchDraftPreflight({ periodStart: "2026-08-01", periodEnd: "2026-08-07" });

    expect(String(fetchMock.mock.calls[0][0])).not.toContain("scope_token");
  });

  it("đọc đủ trường và tách trong/ngoài phạm vi", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ready: true,
        source_task_count: 30,
        scope_attribution_complete: true,
        unattributed_task_count_in_scope: 0,
        unattributed_task_count_outside_scope: 12,
        unattributed_scopes: [
          {
            company: "Công ty A",
            department: "Phòng Hành chính",
            task_count: 12,
            in_selected_scope: false,
          },
        ],
        reason: "",
      }),
    );

    const res = await fetchDraftPreflight({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
    });

    expect(res.ready).toBe(true);
    expect(res.source_task_count).toBe(30);
    expect(res.unattributed_task_count_outside_scope).toBe(12);
    expect(res.unattributed_scopes).toHaveLength(1);
    expect(res.unattributed_scopes[0]).toMatchObject({
      company: "Công ty A",
      task_count: 12,
      in_selected_scope: false,
    });
  });

  it("payload thiếu trường → giá trị an toàn, không crash", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ready: false, reason: "Chưa có CUID" }));

    const res = await fetchDraftPreflight({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
    });

    expect(res.ready).toBe(false);
    expect(res.reason).toBe("Chưa có CUID");
    expect(res.source_task_count).toBe(0);
    expect(res.unattributed_scopes).toEqual([]);
  });

  it("bỏ dòng rác trong unattributed_scopes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ready: true,
        unattributed_scopes: [null, "rác", { company: "B", task_count: 3 }],
      }),
    );

    const res = await fetchDraftPreflight({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
    });

    expect(res.unattributed_scopes).toHaveLength(1);
    expect(res.unattributed_scopes[0].company).toBe("B");
  });
});

describe("createWorkReportDraftJob", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POST body đúng contract, đọc reused", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: "j1",
          status: "queued",
          reused: true,
          source_task_count: 30,
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    const job = await createWorkReportDraftJob({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      scopeToken: "tok-a",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      period_start: "2026-08-01",
      period_end: "2026-08-07",
      scope_token: "tok-a",
    });
    expect(job).toMatchObject({ job_id: "j1", reused: true, source_task_count: 30 });
  });

  it("không có scope_token thì không gửi field đó", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: "j2", status: "queued" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await createWorkReportDraftJob({ periodStart: "2026-08-01", periodEnd: "2026-08-07" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("scope_token");
  });
});

describe("describeDraftError", () => {
  it("ưu tiên thông điệp thật của BE", () => {
    const err = new AiHttpError(409, JSON.stringify({ detail: "CUID chưa sẵn sàng" }));
    expect(describeDraftError(err)).toBe("CUID chưa sẵn sàng");
  });

  it("lùi về câu theo mã lỗi khi BE không nói gì", () => {
    expect(describeDraftError(new PersonalAiError(403))).toContain("thí điểm");
    expect(describeDraftError(new PersonalAiError(422))).toContain("không hợp lệ");
    expect(describeDraftError(new PersonalAiError(503))).toContain("chưa sẵn sàng");
  });

  it("phân biệt timeout với network", () => {
    expect(describeDraftError(new PersonalAiError(0, "timeout"))).toContain("quá thời gian");
    expect(describeDraftError(new PersonalAiError(0, "network"))).toContain("kết nối");
  });

  it("lỗi lạ → câu chung, không lộ chi tiết kỹ thuật", () => {
    expect(describeDraftError(new Error("boom"))).toBe("Đã xảy ra lỗi không xác định.");
  });
});
