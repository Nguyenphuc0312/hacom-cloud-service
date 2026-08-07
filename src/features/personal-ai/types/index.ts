import type { WorkReportFormRequest, DepartmentSelectionRequest } from "../../ai-assistant/types";

export type PersonalDocumentStatus = "uploading" | "indexed" | "error";

export interface PersonalDocument {
  /** Backend-owned document identity. This is the only id sent back to document APIs. */
  document_id: string;
  id: string;
  name: string;
  page_count?: number;
  size_bytes?: number;
  uploaded_at: string;
  status: PersonalDocumentStatus;
  /** Tên file gốc do BE trả — dùng đặt tên khi tải về (contract §F). */
  original_filename?: string;
  /**
   * Link tải file gốc BE trả (`/api/chat/personal/documents/<id>/download`) —
   * ưu tiên số 1 để tải: trả đúng file upload gốc + `Content-Disposition: attachment`.
   */
  download_url?: string;
  /** Link file gốc BE trả (`/api/source-files/<id>`) — fallback khi thiếu download_url. */
  open_url?: string;
  /**
   * Link trình đọc BE trả (`/api/sources/<id>`) — CHỈ dùng cho "Xem/Đọc nguồn",
   * KHÔNG dùng để tải: response reader có thể là HTML/nội dung index, không phải file gốc.
   */
  reader_url?: string;
}

export interface PersonalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  citations?: PersonalCitation[];
  isStreaming?: boolean;
  isError?: boolean;
  thinking?: string;
  thinkingPhase?: "searching" | "reasoning" | null;
  formRequest?: WorkReportFormRequest;
  selectionRequest?: DepartmentSelectionRequest;
  /**
   * SSE `work_report_scope_required` hoặc lỗi 400/403 — render widget bắt chọn
   * phạm vi báo cáo; câu hỏi đang hoãn nằm trong `workReportScopeStore`.
   */
  scopeRequired?: boolean;
  /** #tongcvtuan — render danh sách file báo cáo tuần inline trong chat. */
  weeklyReportList?: boolean;
  /**
   * #baocaocv — đánh dấu message là kết quả xem báo cáo. Khi BE gửi `token`
   * (user thường) thay vì `selection_request` (admin/giám đốc), nội dung
   * `content` được hiển thị trong bordered box "Xem báo cáo công việc".
   */
  reportRequest?: boolean;
  /** SSE `done.exportable_table` — bật nút "In" cho câu trả lời dạng bảng. */
  exportableTable?: boolean;
  /** SSE `done.export_id` — token snapshot dữ liệu gốc trong session để BE xuất Excel đủ cột. */
  exportId?: string;
  /** session_id gắn với `exportId` (dùng cho endpoint export-table). */
  exportSessionId?: string;
  /**
   * `dataEpoch` (workReportScopeStore) tại lúc bảng/snapshot được tạo (§5). Khi
   * user đổi phạm vi báo cáo, epoch hiện tại tăng → bảng/snapshot của scope CŨ
   * không còn khớp token mới, TableExportMenu vô hiệu nút Xuất để tránh xuất
   * nhầm dữ liệu scope cũ với token scope mới. undefined = bảng không thuộc
   * phạm vi báo cáo (câu trả lời thường) → không ràng buộc epoch.
   */
  scopeEpoch?: number;
  /**
   * SSE `done.calendar_events` — khi câu trả lời là lịch, BE trả mảng sự kiện
   * (cùng thứ tự các dòng bảng markdown). Có thì FE render bảng lịch 5 cột +
   * nút "Xem chi tiết" thay cho markdown thuần. Rỗng/thiếu → render text thường.
   */
  calendarEvents?: CalendarEventRow[];
  /**
   * SSE `work_report_ai_draft_ready` — bản nháp AI đã dựng xong, render nút
   * "Tải bản nháp AI (chỉ để đọc tham khảo)". Nút tải bằng fetch kèm token
   * (endpoint đòi `Authorization`), KHÔNG phải link bấm được.
   */
  aiDraft?: WorkReportAiDraftReady;
}

/** Loại phạm vi một authorization báo cáo công việc (spec §3). */
export type WorkReportScopeType = "CORPORATION" | "ORG_UNIT" | "DEPARTMENT";

/**
 * Capability = "thao tác user cần phạm vi" (spec §2/§3). FE gửi đúng một trong
 * số này qua `GET /scopes?capability=...`; BE quyết định scope nào hợp lệ.
 * FE KHÔNG tự đổi sang capability khác khi lỗi (§7 — 422 là lỗi tích hợp).
 */
export type WorkReportCapability =
  | "department_submit"
  | "org_unit_submit"
  | "corporation_aggregate"
  | "department_read"
  | "org_unit_read"
  | "report_read";

/** Action một authorization yêu cầu để chạy được một capability (spec §6). */
export type WorkReportRequiredAction =
  | "READ"
  | "SUBMIT"
  | "AGGREGATE_CORPORATE_REPORTS";

/**
 * Một phạm vi báo cáo cho tài khoản (`GET /api/work-reports/scopes`).
 *
 * Nguồn quyền: HRM (`/auth/me`) chỉ trả `workReportAuthorizations` thô. `scopes`
 * ở endpoint này là kết quả CHATBOT BE lọc theo capability và ký `selectionToken`
 * — HRM KHÔNG ký token. `selectionToken` là opaque do chatbot BE ký: FE chỉ
 * chuyển tiếp nguyên văn qua field `scope_token`, KHÔNG decode/sửa/lưu dài hạn (§3).
 */
export interface WorkReportScope {
  authorizationId: string;
  authorizationVersion: number;
  actions: string[];
  scopeType: WorkReportScopeType;
  scopeId: string;
  scopeName: string;
  reportingTargetType: string;
  reportingTargetId: string;
  reportingTargetName: string;
  reportingUnitId: string;
  reportingUnitName: string;
  selectionToken: string;
}

/**
 * Response của `GET /api/work-reports/scopes?capability=...` (spec §3).
 *
 * `capability`/`requiredAction`/`allowedScopeTypes` do BE ECHO lại — FE dùng để
 * đối chiếu (không suy quyền), KHÔNG tự nghĩ ra. `scopes` là danh sách khớp.
 */
export interface WorkReportScopesResponse {
  count: number;
  scopes: WorkReportScope[];
  capability?: WorkReportCapability;
  requiredAction?: WorkReportRequiredAction;
  allowedScopeTypes?: WorkReportScopeType[];
  /**
   * §2.4: BE đã gộp nhiều authorization cùng trỏ một phòng/đơn vị thành MỘT
   * phạm vi; còn đúng một lựa chọn → `true` và BE tự bind, `selectionToken`
   * rỗng CÓ CHỦ ĐÍCH. FE không hiện dropdown và gọi thao tác KHÔNG kèm
   * `scope_token` (gửi token cũ quá TTL từng gây 403 "lần đầu nộp không được").
   */
  autoSelected: boolean;
  /**
   * §2.5: `promptId` của chính lần gọi `/scopes` này — sinh mới mỗi lần gọi, để
   * token lấy CHỦ ĐỘNG từ `/scopes` (luồng nộp file) cũng gắn được vào đúng một
   * lượt gửi như luồng chat SSE. Rỗng khi `autoSelected` (không có gì để chọn).
   */
  promptId?: string;
}

/**
 * SSE `work_report_scope_required` — BE báo câu hỏi cần chọn scope trước khi
 * truy vấn. FE lưu `question`, mở widget, rồi gửi lại chính request chat kèm
 * `scope_token` đã chọn (§3).
 */
export interface WorkReportScopeRequired {
  reason: string;
  /**
   * §4 (bản 2.2): mã ngẫu nhiên BE sinh MỚI cho mỗi lần phát sự kiện này — kể
   * cả khi `question` trùng chữ y hệt lần trước. Đây là NGUỒN SỰ THẬT để xác
   * định "cùng một lần hỏi", thay cho việc so chuỗi `question` (bản 2.1 làm
   * tạm; hai lần hỏi khác nhau thật sự vẫn có thể trùng chữ).
   * Rỗng = BE chưa ship `promptId` → FE lùi về so chuỗi `question` (xem
   * `isTokenValidFor`), giữ tương thích ngược với BE bản 2.1.
   */
  promptId?: string;
  /** Câu hỏi gốc — từ 2.2 chỉ dùng để hiển thị/gửi lại, KHÔNG dùng để khớp token. */
  question: string;
  scopes: WorkReportScope[];
  /** BE cho biết capability/action/loại scope đang yêu cầu (spec §4). */
  capability?: WorkReportCapability;
  requiredAction?: WorkReportRequiredAction;
  allowedScopeTypes?: WorkReportScopeType[];
}

/**
 * SSE `work_report_ai_draft_ready` — BE đã dựng xong bản nháp AI báo cáo giao
 * ban, gửi link tải. Phát ở CẢ hai luồng: gõ `#TBP_AITEST`, và (khi cờ
 * `WORK_REPORT_AI_DRAFT_V3_SHADOW_ON_QUESTION_ENABLED` bật) khi TBP hỏi tổng
 * hợp báo cáo bộ phận theo cách thường — luồng sau có thêm `read_only: true`
 * và KHÔNG kèm bảng nháp trong transcript.
 *
 * Bản nháp chỉ để ĐỌC THAM KHẢO: nộp lại chính file này bằng `#TBP_baocao` sẽ
 * bị BE từ chối (nhận diện bằng dấu nhúng trong file, đổi tên không qua được).
 * Không có sự kiện này = bản nháp chưa dựng xong; câu trả lời vẫn trọn vẹn.
 */
export interface WorkReportAiDraftReady {
  draft_id: string;
  /** URL tải đã ghép sẵn host AI — dùng thẳng cho `downloadWorkReportDraft`. */
  export_url: string;
  export_format?: string;
  /** true = bản nháp dựng ngầm theo câu hỏi thường (không phải luồng tag). */
  read_only?: boolean;
}

/** Action mở chi tiết một sự kiện lịch (SSE `done.calendar_events[].detail_action`). */
export interface CalendarEventAction {
  type: "calendar_event_detail";
  event_id: string;
}

/** Một dòng sự kiện lịch BE trả ở SSE `done.calendar_events`. */
export interface CalendarEventRow {
  event_id: string;
  title?: string;
  time?: string;
  day?: string;
  event_type?: string;
  location?: string;
  chair?: string;
  detail_action?: CalendarEventAction;
}

export interface PersonalCitation {
  document_id: string;
  document_name: string;
  page?: number;
  excerpt?: string;
  citation_index?: number;
}

export interface PersonalChatRequest {
  question: string;
  session_id: string | null;
  new_conversation?: boolean;
  employee_code?: string;
  employee_name?: string;
  department_name?: string;
  org_unit?: string;
  document_ids?: string[];
}

export interface PersonalChatResponse {
  session_id: string;
  answer: string;
  sources?: PersonalCitation[];
  /** BE bật ở SSE `done` khi câu trả lời là bảng có thể "In". */
  exportable_table?: boolean;
  /** SSE `done` — token snapshot dữ liệu gốc để BE xuất Excel đủ cột đã bị ẩn khỏi bảng chat. */
  export_id?: string;
  /** SSE `done` — mảng sự kiện lịch khi câu trả lời là bảng lịch (xem CalendarEventRow). */
  calendar_events?: CalendarEventRow[];
}

export interface UploadDocumentResponse {
  /** Backend-owned document identity. This is the only id sent back to document APIs. */
  document_id: string;
  id: string;
  name: string;
  page_count?: number;
  size_bytes?: number;
  uploaded_at: string;
  status: PersonalDocumentStatus;
  original_filename?: string;
  download_url?: string;
  open_url?: string;
  reader_url?: string;
}

export interface SelectSourcesRequest {
  document_ids: string[];
}

/**
 * Response của POST /api/level-reports/upload (nộp file bản cấp TBP/LĐĐV).
 * FE chỉ hiển thị `message`; các field khác để dành cho log/nghiệm thu.
 */
export interface LevelReportUploadResponse {
  ok: boolean;
  message: string;
  report?: Record<string, unknown>;
}
