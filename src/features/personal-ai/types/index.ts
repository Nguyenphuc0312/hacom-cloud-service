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
   * SSE `done.calendar_events` — khi câu trả lời là lịch, BE trả mảng sự kiện
   * (cùng thứ tự các dòng bảng markdown). Có thì FE render bảng lịch 5 cột +
   * nút "Xem chi tiết" thay cho markdown thuần. Rỗng/thiếu → render text thường.
   */
  calendarEvents?: CalendarEventRow[];
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
 * Một authorization HRM cấp cho tài khoản (`GET /api/work-reports/scopes`).
 *
 * `selectionToken` là token opaque BE ký — FE chỉ chuyển tiếp nguyên văn qua
 * field `scope_token`, KHÔNG decode/sửa/lưu dài hạn (§3).
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
}

/**
 * SSE `work_report_scope_required` — BE báo câu hỏi cần chọn scope trước khi
 * truy vấn. FE lưu `question`, mở widget, rồi gửi lại chính request chat kèm
 * `scope_token` đã chọn (§3).
 */
export interface WorkReportScopeRequired {
  reason: string;
  question: string;
  scopes: WorkReportScope[];
  /** BE cho biết capability/action/loại scope đang yêu cầu (spec §4). */
  capability?: WorkReportCapability;
  requiredAction?: WorkReportRequiredAction;
  allowedScopeTypes?: WorkReportScopeType[];
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
