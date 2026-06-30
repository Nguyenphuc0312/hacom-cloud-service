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
}

export interface SelectSourcesRequest {
  document_ids: string[];
}
