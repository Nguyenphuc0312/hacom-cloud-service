import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LevelReportScopeRequiredError,
  listPersonalDocuments,
  selectPersonalSources,
  streamPersonalChat,
  uploadLevelReport,
} from "./personalAiApi";

let currentToken = "test-token";
vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => currentToken,
}));

const ensureFreshMock = vi.fn(async () => currentToken);
const refreshSharedMock = vi.fn(async () => currentToken);
vi.mock("../../../services/authRefreshCoordinator", () => ({
  ensureFreshAccessToken: (...args: unknown[]) => ensureFreshMock(...(args as [])),
  refreshAccessTokenShared: (...args: unknown[]) => refreshSharedMock(...(args as [])),
}));

beforeEach(() => {
  currentToken = "test-token";
  ensureFreshMock.mockClear();
  refreshSharedMock.mockClear();
  refreshSharedMock.mockImplementation(async () => currentToken);
});

const fetchMock = vi.fn();

describe("personalAiApi document identity contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes list documents to backend document_id even when id is a frontend UUID", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          documents: [
            {
              id: "a1b0e94a-528b-4213-bfdb-7ad9710e4c08",
              document_id: "personal-HC888890-c30d71d620f8",
              name: "BAO_CAO_HIEU_NANG_SERVER_AI.docx",
              status: "indexed",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const docs = await listPersonalDocuments({
      employeeCode: "HC888890",
      sessionId: "personal-HC888890-session",
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: "personal-HC888890-c30d71d620f8",
      document_id: "personal-HC888890-c30d71d620f8",
      name: "BAO_CAO_HIEU_NANG_SERVER_AI.docx",
    });
  });

  it("posts backend document_ids to the source endpoint", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await selectPersonalSources(["personal-HC888890-c30d71d620f8"], {
      employeeCode: "HC888890",
      sessionId: "personal-HC888890-session",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      document_ids: ["personal-HC888890-c30d71d620f8"],
      employee_code: "HC888890",
      session_id: "personal-HC888890-session",
    });
  });
});

describe("streamPersonalChat calendar_events (done)", () => {
  const sseResponse = (body: string) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("parses calendar_events and keeps a valid detail_action", async () => {
    const done = {
      session_id: "personal-HC001-desk",
      answer: "| Ngày | Giờ |...",
      calendar_events: [
        {
          event_id: "ev1",
          title: "Hội ý nhóm CĐS",
          time: "16:00-17:30",
          day: "Thứ Hai 29/06/2026",
          event_type: "Họp",
          location: "Văn phòng Hacom",
          chair: "Trần Đăng Công",
          detail_action: { type: "calendar_event_detail", event_id: "ev1" },
        },
        // Dòng thiếu event_id → phải bị loại.
        { title: "Không có id" },
      ],
    };
    fetchMock.mockResolvedValueOnce(
      sseResponse(`event: done\ndata: ${JSON.stringify(done)}\n\n`),
    );

    const res = await streamPersonalChat({ question: "lịch", session_id: null });

    expect(res.calendar_events).toHaveLength(1);
    expect(res.calendar_events?.[0]).toMatchObject({
      event_id: "ev1",
      detail_action: { type: "calendar_event_detail", event_id: "ev1" },
    });
  });

  it("drops malformed detail_action but keeps the row", async () => {
    const done = {
      session_id: "s",
      answer: "a",
      calendar_events: [
        { event_id: "ev2", title: "Bận", detail_action: { type: "wrong" } },
      ],
    };
    fetchMock.mockResolvedValueOnce(
      sseResponse(`event: done\ndata: ${JSON.stringify(done)}\n\n`),
    );

    const res = await streamPersonalChat({ question: "lịch", session_id: null });

    expect(res.calendar_events?.[0]).toMatchObject({ event_id: "ev2" });
    expect(res.calendar_events?.[0].detail_action).toBeUndefined();
  });

  it("leaves calendar_events undefined for a non-calendar answer", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(`event: done\ndata: {"session_id":"s","answer":"hi"}\n\n`),
    );

    const res = await streamPersonalChat({ question: "hi", session_id: null });

    expect(res.calendar_events).toBeUndefined();
  });
});

describe("streamPersonalChat work_report_scope_required (§4 SSE)", () => {
  const sseResponse = (body: string) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );

  const rawScope = {
    authorizationId: "a1",
    authorizationVersion: 4,
    actions: ["READ", "SUBMIT"],
    scopeType: "DEPARTMENT",
    scopeId: "s1",
    scopeName: "BCH",
    reportingTargetType: "DEPARTMENT",
    reportingTargetId: "t1",
    reportingTargetName: "BCH Công trường",
    reportingUnitId: "u1",
    reportingUnitName: "Cty Hacom",
    selectionToken: "tok-a",
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("parse scopes + capability/requiredAction/allowedScopeTypes, rồi kết thúc bằng done", async () => {
    const scopeEvent = {
      reason: "multiple_matching_authorizations",
      question: "#TBP_baocao",
      capability: "department_submit",
      requiredAction: "SUBMIT",
      allowedScopeTypes: ["DEPARTMENT"],
      scopes: [rawScope, { ...rawScope, authorizationId: "a2", selectionToken: "tok-b" }],
    };
    const body =
      `event: work_report_scope_required\ndata: ${JSON.stringify(scopeEvent)}\n\n` +
      `event: done\ndata: {"session_id":"s","answer":""}\n\n`;
    fetchMock.mockResolvedValueOnce(sseResponse(body));

    const onScopeRequired = vi.fn();
    await streamPersonalChat(
      { question: "#TBP_baocao", session_id: null },
      { onScopeRequired },
    );

    expect(onScopeRequired).toHaveBeenCalledTimes(1);
    const arg = onScopeRequired.mock.calls[0][0];
    expect(arg).toMatchObject({
      question: "#TBP_baocao",
      capability: "department_submit",
      requiredAction: "SUBMIT",
      allowedScopeTypes: ["DEPARTMENT"],
    });
    expect(arg.scopes).toHaveLength(2);
  });

  it("parse `promptId` (§4 bản 2.2) để FE khớp token theo lần hỏi, không theo chuỗi", async () => {
    const scopeEvent = {
      reason: "multiple_matching_authorizations",
      promptId: "9f2c1a7e4b3d4c5e8a6f0d1b2c3e4f5a",
      question: "tổng hợp báo cáo của mọi người trong phòng ban",
      capability: "report_read",
      scopes: [rawScope, { ...rawScope, authorizationId: "a2", selectionToken: "tok-b" }],
    };
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_scope_required\ndata: ${JSON.stringify(scopeEvent)}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":""}\n\n`,
      ),
    );

    const onScopeRequired = vi.fn();
    await streamPersonalChat({ question: "x", session_id: null }, { onScopeRequired });

    expect(onScopeRequired.mock.calls[0][0].promptId).toBe(
      "9f2c1a7e4b3d4c5e8a6f0d1b2c3e4f5a",
    );
  });

  it("BE bản cũ không gửi `promptId` → chuỗi rỗng (store lùi về khớp câu hỏi)", async () => {
    const scopeEvent = {
      reason: "multiple_matching_authorizations",
      question: "#TBP_baocao",
      capability: "department_submit",
      scopes: [rawScope],
    };
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_scope_required\ndata: ${JSON.stringify(scopeEvent)}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":""}\n\n`,
      ),
    );

    const onScopeRequired = vi.fn();
    await streamPersonalChat({ question: "x", session_id: null }, { onScopeRequired });

    expect(onScopeRequired.mock.calls[0][0].promptId).toBe("");
  });

  it("payload thiếu scope hợp lệ → KHÔNG gọi onScopeRequired", async () => {
    const body =
      `event: work_report_scope_required\ndata: {"question":"x","scopes":[{"no":"token"}]}\n\n` +
      `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`;
    fetchMock.mockResolvedValueOnce(sseResponse(body));

    const onScopeRequired = vi.fn();
    await streamPersonalChat({ question: "x", session_id: null }, { onScopeRequired });

    expect(onScopeRequired).not.toHaveBeenCalled();
  });
});

describe("uploadLevelReport — lỗi chọn phạm vi mang sẵn dropdown (§2.5)", () => {
  const rawScope = {
    authorizationId: "a1",
    authorizationVersion: 1,
    actions: ["SUBMIT"],
    scopeType: "DEPARTMENT",
    reportingTargetName: "BCH Công trường Liền kề",
    reportingUnitName: "Văn phòng TCT",
    selectionToken: "tok-a",
  };

  /** XHR giả: trả sẵn status + body cho lần `send()` kế tiếp. */
  function stubXhr(status: number, responseText: string) {
    return stubXhrSequence([{ status, responseText }]);
  }

  /**
   * XHR giả trả kết quả KHÁC NHAU theo từng lượt gửi — cần cho §2.6 (401 rồi
   * gửi lại thành công). Lượt vượt quá dãy dùng lại phần tử cuối.
   */
  function stubXhrSequence(steps: { status: number; responseText: string }[]) {
    const sent: FormData[] = [];
    const headers: Record<string, string>[] = [];
    let call = 0;
    class FakeXhr {
      status = 0;
      responseText = "";
      responseType = "";
      private myHeaders: Record<string, string> = {};
      private handlers: Record<string, (() => void)[]> = {};
      open() {}
      setRequestHeader(key: string, value: string) {
        this.myHeaders[key] = value;
      }
      abort() {}
      addEventListener(type: string, fn: () => void) {
        (this.handlers[type] ??= []).push(fn);
      }
      send(form: FormData) {
        const step = steps[Math.min(call, steps.length - 1)];
        call += 1;
        sent.push(form);
        headers.push(this.myHeaders);
        this.status = step.status;
        this.responseText = step.responseText;
        this.handlers.load?.forEach((fn) => fn());
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr as unknown as typeof XMLHttpRequest);
    return Object.assign(sent, { headers });
  }

  afterEach(() => vi.unstubAllGlobals());

  // §2.6 — 401 KHÔNG được làm mất file đang nộp.
  it("[2.6] 401 → làm mới token rồi gửi lại CÙNG file, user không mất tệp", async () => {
    const sent = stubXhrSequence([
      { status: 401, responseText: JSON.stringify({ detail: { reason: "session_expired" } }) },
      { status: 200, responseText: JSON.stringify({ ok: true, message: "Đã nhận." }) },
    ]);
    refreshSharedMock.mockImplementation(async () => {
      currentToken = "fresh-token";
      return currentToken;
    });

    const file = new File(["x"], "bc.xlsx");
    const res = await uploadLevelReport(file, {
      question: "#TBP_baocao",
      scopeToken: "tok-a",
    });

    expect(res.message).toBe("Đã nhận.");
    expect(sent).toHaveLength(2);
    // Lượt gửi lại: cùng tệp, cùng scope_token, token auth MỚI.
    expect((sent[1].get("file") as File).name).toBe(file.name);
    expect(sent[1].get("scope_token")).toBe("tok-a");
    expect(sent.headers[1].Authorization).toBe("Bearer fresh-token");
  });

  it("[2.6] 401 mà refresh hỏng (hết phiên thật) → ném 401, không gửi lại", async () => {
    const sent = stubXhrSequence([{ status: 401, responseText: "" }]);
    refreshSharedMock.mockRejectedValueOnce(new Error("session gone"));

    const err = await uploadLevelReport(new File(["x"], "bc.xlsx"), {
      question: "#TBP_baocao",
    }).catch((e) => e);

    expect(err.status).toBe(401);
    expect(sent).toHaveLength(1);
  });

  it("400 kèm detail.scopes → LevelReportScopeRequiredError giữ scopes + promptId", async () => {
    stubXhr(
      400,
      JSON.stringify({
        detail: {
          reason: "multiple_matching_authorizations",
          message: "Bạn có nhiều phạm vi phù hợp.",
          promptId: "00c8c7c4120c45499c78a057c11f456c",
          question: "#TBP_baocao",
          capability: "department_submit",
          scopes: [rawScope, { ...rawScope, authorizationId: "a2", selectionToken: "tok-b" }],
        },
      }),
    );

    const err = await uploadLevelReport(new File(["x"], "bc.xlsx"), {
      question: "#TBP_baocao",
    }).catch((e) => e);

    expect(err).toBeInstanceOf(LevelReportScopeRequiredError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Bạn có nhiều phạm vi phù hợp.");
    expect(err.scope.promptId).toBe("00c8c7c4120c45499c78a057c11f456c");
    expect(err.scope.scopes).toHaveLength(2);
  });

  it("detail vẫn là chuỗi (đường lùi BE) → lỗi thường, KHÔNG in [object Object]", async () => {
    stubXhr(400, JSON.stringify({ detail: "Thiếu tag báo cáo." }));

    const err = await uploadLevelReport(new File(["x"], "bc.xlsx"), {
      question: "#TBP_baocao",
    }).catch((e) => e);

    expect(err).not.toBeInstanceOf(LevelReportScopeRequiredError);
    expect(err.message).toBe("Thiếu tag báo cáo.");
  });

  it("chỉ gửi scope_token khi caller truyền vào (lượt nộp đầu gửi trần — §2.4)", async () => {
    const sentFirst = stubXhr(200, JSON.stringify({ ok: true, message: "Đã nhận." }));
    await uploadLevelReport(new File(["x"], "bc.xlsx"), { question: "#TBP_baocao" });
    expect(sentFirst[0].get("scope_token")).toBeNull();

    const sentRetry = stubXhr(200, JSON.stringify({ ok: true, message: "Đã nhận." }));
    await uploadLevelReport(new File(["x"], "bc.xlsx"), {
      question: "#TBP_baocao",
      scopeToken: "tok-b",
    });
    expect(sentRetry[0].get("scope_token")).toBe("tok-b");
  });
});