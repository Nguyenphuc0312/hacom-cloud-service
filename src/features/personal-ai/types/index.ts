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
  /** Path tải file gốc BE trả (`/api/chat/personal/documents/<id>/download`). */
  download_url?: string;
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
