import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPersonalDocuments,
  selectPersonalSources,
  streamPersonalChat,
} from "./personalAiApi";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => "test-token",
}));

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