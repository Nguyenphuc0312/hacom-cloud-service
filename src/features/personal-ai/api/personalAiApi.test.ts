import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkReportDraftExportUrl,
  LevelReportScopeRequiredError,
  listPersonalDocuments,
  deletePersonalAttachment,
  listPersonalAttachments,
  matchLevelReportTag,
  normalizePersonalAttachment,
  normalizeWorkReportAiDraft,
  selectPersonalSources,
  streamPersonalChat,
  uploadLevelReport,
  ATTACHMENT_MODE_REJECTED,
  stripDraftExportLinks,
} from "./personalAiApi";

describe("stripDraftExportLinks", () => {
  it("bỏ link Markdown tải bản nháp (nút riêng lo việc tải, link thô luôn 401)", () => {
    const out = stripDraftExportLinks(
      "Đã dựng xong bản nháp.\n\n[Tải bản nháp](/api/work-report-drafts/abc-1/export.xlsx)",
    );
    expect(out).toBe("Đã dựng xong bản nháp.");
    expect(out).not.toContain("work-report-drafts");
  });

  it("bỏ cả URL trần và URL tuyệt đối kèm query", () => {
    expect(
      stripDraftExportLinks(
        "Tải tại https://chat.hacomholdings.com.vn/api/work-report-drafts/d1/export.xlsx?scope_token=x nhé",
      ),
    ).toBe("Tải tại  nhé".trim());
    expect(
      stripDraftExportLinks("Link: /api/work-report-drafts/d1/export.xlsx"),
    ).toBe("Link:");
  });

  it("giữ nguyên nội dung không liên quan (kể cả bảng markdown)", () => {
    const table = "| Việc | Trạng thái |\n| --- | --- |\n| A | Xong |";
    expect(stripDraftExportLinks(table)).toBe(table);
    expect(stripDraftExportLinks("")).toBe("");
  });

  it("KHÔNG đụng link work-report-drafts khác export.xlsx", () => {
    const keep = "Xem [chi tiết](/api/work-report-drafts/d1/items) để đối chiếu.";
    expect(stripDraftExportLinks(keep)).toBe(keep);
  });
});
import { isAttachmentExpired } from "../types";

describe("isAttachmentExpired", () => {
  const now = Date.parse("2026-08-07T10:00:00Z");

  it("coi là hết hạn khi đã qua expires_at", () => {
    expect(
      isAttachmentExpired(
        { attachment_id: "pga-1", filename: "a.md", expires_at: "2026-08-07T09:59:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("còn hạn thì không chặn", () => {
    expect(
      isAttachmentExpired(
        { attachment_id: "pga-1", filename: "a.md", expires_at: "2026-08-07T10:01:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("thiếu/hỏng expires_at → coi là CÒN hạn, để BE quyết (không chặn oan)", () => {
    expect(isAttachmentExpired({ attachment_id: "p", filename: "a.md" }, now)).toBe(false);
    expect(
      isAttachmentExpired(
        { attachment_id: "p", filename: "a.md", expires_at: "không-phải-ngày" },
        now,
      ),
    ).toBe(false);
  });
});

describe("matchLevelReportTag", () => {
  it("nhận ra tag nộp lên TBP và LĐĐV (không phân biệt hoa thường)", () => {
    expect(matchLevelReportTag("#TBP_baocao tuần này")?.tag).toBe("#tbp_baocao");
    expect(matchLevelReportTag("#tbp_BaoCao")?.tag).toBe("#tbp_baocao");
    expect(matchLevelReportTag("nộp #LDDV_baocao")?.tag).toBe("#lddv_baocao");
  });

  it("mô tả đích đến để hộp xác nhận nói rõ báo cáo đi đâu", () => {
    expect(matchLevelReportTag("#TBP_baocao")?.destination).toContain("Trưởng bộ phận");
    expect(matchLevelReportTag("#LDDV_baocao")?.destination).toContain("Lãnh đạo đơn vị");
  });

  it("KHÔNG coi #TCT_tonghop là nộp — tag đó chỉ tổng hợp", () => {
    expect(matchLevelReportTag("#TCT_tonghop")).toBeNull();
  });

  it("trả null khi không có tag nộp nào", () => {
    expect(matchLevelReportTag("#congviectuan")).toBeNull();
    expect(matchLevelReportTag("báo cáo giúp tôi")).toBeNull();
  });
});

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

describe("streamPersonalChat SSE error event", () => {
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

  it("ném AiStreamError giữ nguyên code + detail của BE (không hoá thành network)", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: error\ndata: ${JSON.stringify({
          code: ATTACHMENT_MODE_REJECTED,
          detail: "Tệp không dùng được ở luồng này.",
        })}\n\n`,
      ),
    );

    await expect(
      streamPersonalChat({ question: "tóm tắt", session_id: "s" }),
    ).rejects.toMatchObject({
      name: "AiStreamError",
      code: ATTACHMENT_MODE_REJECTED,
      message: "Tệp không dùng được ở luồng này.",
    });
  });

  it("stream lỗi KHÔNG được rơi xuống fallback 'done' cũ trong buffer", async () => {
    // `done` đứng trước rồi BE mới báo lỗi → lỗi phải thắng, không trả kết quả dở.
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: done\ndata: {"session_id":"s","answer":"nửa chừng"}\n\n` +
          `event: error\ndata: {"code":"ATTACHMENT_MODE_REJECTED"}\n\n`,
      ),
    );

    await expect(
      streamPersonalChat({ question: "q", session_id: "s" }),
    ).rejects.toMatchObject({ name: "AiStreamError" });
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

// Trong dev/test VITE_AI_CHAT_BASE_URL="/ai-api" (prefix proxy tương đối), nên
// mọi URL gọi API chatbot đều mang prefix này — giống sourceUtils.test.ts.
const AI = "/ai-api";

describe("buildWorkReportDraftExportUrl", () => {
  it("ghép path bản nháp qua host AI, giữ query", () => {
    expect(
      buildWorkReportDraftExportUrl("/api/work-report-drafts/b6141bd9/export.xlsx"),
    ).toBe(`${AI}/api/work-report-drafts/b6141bd9/export.xlsx`);
    expect(
      buildWorkReportDraftExportUrl("/api/work-report-drafts/b6/export.xlsx?scope_token=x"),
    ).toContain("?scope_token=x");
  });

  it("chấp nhận URL tuyệt đối BE gửi, nhưng vẫn ghim về host AI", () => {
    // BE có thể gửi kèm host; FE luôn gọi qua BASE_URL để đi đúng proxy/host AI
    // như mọi endpoint chatbot khác, không phụ thuộc host trong payload.
    expect(
      buildWorkReportDraftExportUrl(
        "https://chat.hacomholdings.com.vn/api/work-report-drafts/b6/export.xlsx",
      ),
    ).toBe(`${AI}/api/work-report-drafts/b6/export.xlsx`);
  });

  it("từ chối path không phải bản nháp → caller không hiện nút tải hỏng", () => {
    expect(buildWorkReportDraftExportUrl(undefined)).toBeNull();
    expect(buildWorkReportDraftExportUrl("")).toBeNull();
    expect(buildWorkReportDraftExportUrl("/api/level-reports/export")).toBeNull();
    // Thiếu draft_id, hoặc không phải export.xlsx.
    expect(buildWorkReportDraftExportUrl("/api/work-report-drafts/export.xlsx")).toBeNull();
    expect(buildWorkReportDraftExportUrl("/api/work-report-drafts/b6/items")).toBeNull();
  });
});

describe("normalizeWorkReportAiDraft", () => {
  // Cùng một hàm phục vụ SSE `work_report_ai_draft_ready` và
  // `metadata.work_report_ai_draft` lúc tải lịch sử, nên nút sau F5 giống hệt.
  it("dựng lại nút tải từ metadata sau khi reload", () => {
    expect(
      normalizeWorkReportAiDraft({
        draft_id: "b6141bd9",
        export_url: "/api/work-report-drafts/b6141bd9/export.xlsx",
        export_format: "ai_work_report_draft_v3_full",
        read_only: true,
      }),
    ).toEqual({
      draft_id: "b6141bd9",
      export_url: `${AI}/api/work-report-drafts/b6141bd9/export.xlsx`,
      export_format: "ai_work_report_draft_v3_full",
      read_only: true,
    });
  });

  it("thiếu export_url thì ghép từ draft_id", () => {
    expect(normalizeWorkReportAiDraft({ draft_id: "abc-123" })?.export_url).toBe(
      `${AI}/api/work-report-drafts/abc-123/export.xlsx`,
    );
  });

  it("payload hỏng trả undefined để không hiện nút tải chết", () => {
    expect(normalizeWorkReportAiDraft(undefined)).toBeUndefined();
    expect(normalizeWorkReportAiDraft(null)).toBeUndefined();
    expect(normalizeWorkReportAiDraft("chuỗi")).toBeUndefined();
    expect(normalizeWorkReportAiDraft({})).toBeUndefined();
    // draft_id chứa ký tự tách path -> không được dựng URL trỏ đi chỗ khác.
    expect(normalizeWorkReportAiDraft({ draft_id: "../../etc" })).toBeUndefined();
  });

  it("read_only chỉ true khi BE gửi đúng boolean true", () => {
    expect(normalizeWorkReportAiDraft({ draft_id: "x1" })?.read_only).toBe(false);
    expect(normalizeWorkReportAiDraft({ draft_id: "x1", read_only: "true" })?.read_only).toBe(false);
  });
});

describe("tệp đính kèm hỏi đáp tạm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("normalize nhận cả dạng bọc { attachment } và object phẳng", () => {
    const wrapped = normalizePersonalAttachment({
      ok: true,
      attachment: { attachment_id: "pga-1", filename: "huong_dan.md", pages: 1 },
    });
    expect(wrapped?.attachment_id).toBe("pga-1");
    expect(wrapped?.filename).toBe("huong_dan.md");
    expect(normalizePersonalAttachment({ attachment_id: "pga-2" })?.attachment_id).toBe("pga-2");
  });

  it("thiếu attachment_id thì bỏ — không dựng chip không xoá được", () => {
    expect(normalizePersonalAttachment({ filename: "a.md" })).toBeUndefined();
    expect(normalizePersonalAttachment(null)).toBeUndefined();
  });

  it("list gọi đúng endpoint tệp tạm, KHÔNG đụng documents (Sources)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ attachments: [{ attachment_id: "pga-9", filename: "x.md" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const list = await listPersonalAttachments("personal-HC000001-abc");
    expect(list).toHaveLength(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/chat/personal/attachments");
    expect(url).toContain("session_id=personal-HC000001-abc");
    expect(url).not.toContain("/documents");
  });

  it("delete ném lỗi khi BE không trả 2xx → caller giữ nguyên chip", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Tệp đã hết hạn" }), { status: 409 }),
    );
    await expect(deletePersonalAttachment("pga-1", "sess-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("delete resolve khi 2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deletePersonalAttachment("pga-1", "sess-1")).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/attachments/pga-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});

describe("streamPersonalChat work_report_ai_draft_ready", () => {
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

  it("gọi onDraftReady với export_url đã ghép host AI", async () => {
    const draft = {
      draft_id: "b6141bd9-2e3e-4873-bae4-1d36b37f8b30",
      export_url: "/api/work-report-drafts/b6141bd9-2e3e-4873-bae4-1d36b37f8b30/export.xlsx",
      export_format: "ai_work_report_draft_v3_full",
      read_only: true,
    };
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_ready\ndata: ${JSON.stringify(draft)}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"xong"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    const res = await streamPersonalChat(
      { question: "#TBP_AITEST", session_id: null },
      { onDraftReady },
    );

    expect(onDraftReady).toHaveBeenCalledTimes(1);
    expect(onDraftReady).toHaveBeenCalledWith({
      draft_id: "b6141bd9-2e3e-4873-bae4-1d36b37f8b30",
      export_url: `${AI}/api/work-report-drafts/b6141bd9-2e3e-4873-bae4-1d36b37f8b30/export.xlsx`,
      export_format: "ai_work_report_draft_v3_full",
      read_only: true,
    });
    // Bản nháp KHÔNG được nuốt câu trả lời — luồng dựng ngầm vẫn giữ bảng tất định.
    expect(res.answer).toBe("xong");
  });

  it("read_only mặc định false ở luồng tag (#TBP_AITEST)", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_ready\ndata: {"draft_id":"d1","export_url":"/api/work-report-drafts/d1/export.xlsx"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftReady });

    expect(onDraftReady).toHaveBeenCalledWith(
      expect.objectContaining({ draft_id: "d1", read_only: false }),
    );
  });

  it("bỏ qua payload không dựng được URL (thiếu draft_id, hoặc JSON hỏng)", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        // Thiếu draft_id: có export_url hợp lệ nhưng contract đòi draft_id.
        `event: work_report_ai_draft_ready\ndata: {"export_url":"/api/work-report-drafts/d1/export.xlsx"}\n\n` +
          `event: work_report_ai_draft_ready\ndata: {khong-phai-json}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    const res = await streamPersonalChat(
      { question: "#TBP_AITEST", session_id: null },
      { onDraftReady },
    );

    expect(onDraftReady).not.toHaveBeenCalled();
    // Payload hỏng không được làm gãy phần còn lại của stream.
    expect(res.answer).toBe("a");
  });

  it("export_url sai dạng nhưng có draft_id → lùi về ghép từ draft_id", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_ready\ndata: {"draft_id":"d2","export_url":"/api/level-reports/export"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftReady });

    // Không đi theo export_url lạ — luôn ghim về path bản nháp của draft_id.
    expect(onDraftReady).toHaveBeenCalledWith(
      expect.objectContaining({
        export_url: `${AI}/api/work-report-drafts/d2/export.xlsx`,
      }),
    );
  });

  it("dựng export_url từ draft_id khi event không kèm export_url", async () => {
    // Contract §"Trình bày chat và xuất Excel" mô tả event mang `draft_id`;
    // request 06/08 mô tả mang `export_url`. FE nhận cả hai.
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_ready\ndata: {"draft_id":"d7"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftReady });

    expect(onDraftReady).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_id: "d7",
        export_url: `${AI}/api/work-report-drafts/d7/export.xlsx`,
      }),
    );
  });

  it("draft_id có ký tự tách path → không dựng URL, bỏ qua event", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_ready\ndata: {"draft_id":"../../evil"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftReady = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftReady });

    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it("waiting → onDraftWaiting kèm job_id để FE tự poll", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_waiting\ndata: {"job_id":"j1","period_start":"2026-08-01","period_end":"2026-08-07"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftWaiting = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftWaiting });

    expect(onDraftWaiting).toHaveBeenCalledWith({
      job_id: "j1",
      period_start: "2026-08-01",
      period_end: "2026-08-07",
    });
  });

  it("`..._job` KHÔNG phải kết thúc — vẫn báo job_id để poll tiếp", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_job\ndata: {"job_id":"j2"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftWaiting = vi.fn();
    const res = await streamPersonalChat(
      { question: "#TBP_AITEST", session_id: null },
      { onDraftWaiting },
    );

    expect(onDraftWaiting).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "j2" }),
    );
    expect(res.answer).toBe("a");
  });

  it("failed → onDraftFailed kèm error_message", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(
        `event: work_report_ai_draft_failed\ndata: {"error_message":"pipeline hỏng"}\n\n` +
          `event: done\ndata: {"session_id":"s","answer":"a"}\n\n`,
      ),
    );

    const onDraftFailed = vi.fn();
    await streamPersonalChat({ question: "#TBP_AITEST", session_id: null }, { onDraftFailed });

    expect(onDraftFailed).toHaveBeenCalledWith("pipeline hỏng");
  });

  it("không có sự kiện = bản nháp chưa dựng xong, câu trả lời vẫn trọn vẹn", async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(`event: done\ndata: {"session_id":"s","answer":"Bản nháp đang tạo."}\n\n`),
    );

    const onDraftReady = vi.fn();
    const res = await streamPersonalChat(
      { question: "tổng hợp báo cáo bộ phận", session_id: null },
      { onDraftReady },
    );

    expect(onDraftReady).not.toHaveBeenCalled();
    expect(res.answer).toBe("Bản nháp đang tạo.");
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