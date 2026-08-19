export type AiEndpoint = "company" | "personal";

export interface AiSource {
  citation_index: number;
  display_label?: string;
  source_name?: string;
  document_name?: string;
  source_file?: string;
  // Link aliases from BE (priority: reader_url → url → source_url → open_url →
  // download_url). May be relative (e.g. "/api/sources/{id}?page=3").
  reader_url?: string;
  url?: string;
  source_url?: string;
  open_url?: string;
  download_url?: string;
  page_number?: number;
  page_start?: number;
  page_end?: number;
  pages?: number[];
  document_id?: string;
  dms_document_id?: string;
  document_type?: string;
  chapter?: string;
  section?: string;
  article?: string;
  heading_path?: string;
}

export interface AiChatRequest {
  question: string;
  session_id: string | null;
  new_conversation?: boolean;
  user_id?: string;
  user_name?: string;
  employee_code?: string;
  employee_name?: string;
  department?: string;
}

export interface AiChatResponse {
  session_id: string;
  question?: string;
  answer: string;
  sources?: AiSource[];
  /** BE bật cờ này ở SSE `done` khi câu trả lời là bảng có thể "In". */
  exportable_table?: boolean;
}

// ---------------------------------------------------------------------------
// Work Report types
// ---------------------------------------------------------------------------

export interface WorkReportTaskItem {
  /**
   * Id công việc do BE cấp (chỉ có sau khi lưu báo cáo). Khi SỬA báo cáo phải
   * gửi lại id này để giữ liên kết file ↔ việc — nếu thiếu, BE coi là việc mới.
   */
  id?: string;
  task_name: string;
  /** Deadline (không bắt buộc). Nhập: "yyyy-mm-dd"; submitted_tasks trả "dd/mm/yyyy". */
  completion_date?: string;
  requirements: string;
  completed: string;
  difficulties: string;
  /** "Đề xuất" — không bắt buộc (redesign 08/07). */
  proposals?: string;
  notes?: string;
  /** File đính kèm thuộc riêng công việc này (chế độ attach_level="task"). */
  attachments?: WorkReportAttachment[];
}

/**
 * File đính kèm của báo cáo. `task_id` xác định file thuộc công việc nào:
 *   - task_id = id công việc → file của việc đó.
 *   - task_id = null/undefined → file "chung" của cả báo cáo (gồm file cũ).
 * `download_url` là tương đối tới host AI — KHÔNG bao giờ chứa stored_path.
 */
export interface WorkReportAttachment {
  id: number;
  task_id?: string | null;
  original_filename: string;
  content_type?: string;
  file_size?: number;
  created_at?: string;
  download_url: string;
}

export interface WorkReportFormRequest {
  form_type: "daily_work_report";
  date: string;
  employee_code: string;
  employee_name?: string;
  department_name?: string;
  org_unit?: string;
  allow_multiple_tasks?: boolean;
  fields: string[];
  field_labels: Record<string, string>;
  extra_fields?: string[];
  extra_field_labels?: Record<string, string>;
  /**
   * "append" = form là NHẬP MỚI (mỗi lần submit THÊM công việc mới vào báo cáo
   * ngày, KHÔNG ghi đè/sửa). Khi ở chế độ này form luôn TRỐNG, không đọc `existing`.
   */
  mode?: "append" | string;
  /**
   * Danh sách công việc ĐÃ nộp hôm nay (chỉ-đọc) để hiển thị + cho xóa lẻ.
   * Mỗi phần tử có `id` (dùng gọi xóa) và `attachments` riêng của công việc.
   */
  submitted_tasks?: WorkReportTaskItem[];
  /** "DELETE /api/work-reports/tasks/{task_id}" — gọi để xóa một công việc. */
  task_delete_endpoint?: string;
  /** File "chung" (chưa gắn việc) đã nộp hôm nay (chỉ-đọc). */
  attachments?: WorkReportAttachment[];
  existing: {
    tasks?: WorkReportTaskItem[];
    attachments?: WorkReportAttachment[];
    // legacy flat fields (backward compat)
    task_name?: string;
    requirements?: string;
    completed?: string;
    difficulties?: string;
    notes?: string;
  } | null;
  submit_endpoint: string;

  // Cấu hình đính kèm file (BE gửi kèm form_request).
  allow_attachments?: boolean;
  /** "task" = đính kèm theo từng công việc; mặc định/khác = mức báo cáo ngày (legacy). */
  attach_level?: "report" | "task";
  /** true = BẮT BUỘC chọn việc khi upload (BE bật REQUIRE_TASK_ATTACHMENT). */
  attach_requires_task?: boolean;
  accepted_file_types?: string[];
  max_file_mb?: number;
  attach_endpoint?: string;
  attachments_endpoint?: string;
}

export interface DepartmentOption {
  label: string;
  value: string;
  type: string;
  company: string;
  count: number;
}

export interface DepartmentSelectionRequest {
  selection_type: "department_report" | "company_department_report";
  title: string;
  options: DepartmentOption[];
  multi_select: boolean;
  date_range: boolean;
  fetch_endpoint: string;
}

export interface WorkReportRecord {
  user_id: string;
  user_name: string;
  department: string;
  date: string;
  // Multi-task format (new) — notes per task inside WorkReportTaskItem
  tasks?: WorkReportTaskItem[];
  // File đính kèm cấp ngày (BE trả thêm ở GET /api/work-reports).
  attachments?: WorkReportAttachment[];
  // Legacy flat fields (backward compat)
  task_name?: string;
  requirements?: string;
  completed?: string;
  difficulties?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: AiSource[];
  isStreaming?: boolean;
  isError?: boolean;
  thinking?: string;
  /** Set when backend sends form_request SSE event */
  formRequest?: WorkReportFormRequest;
  /** Set when backend sends selection_request SSE event */
  selectionRequest?: DepartmentSelectionRequest;
  /** SSE `done.exportable_table` — bật nút "In" cho câu trả lời dạng bảng. */
  exportableTable?: boolean;
}

export interface AiConversation {
  id: string;
  title: string;
  endpoint: AiEndpoint;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
  isPinned?: boolean;
  /** Session ID do backend cấp. null = chưa gửi message nào lên backend. */
  serverSessionId?: string | null;
  /** employee_code/id của tài khoản sở hữu conversation này. */
  ownerId?: string | null;
  /** User đã tự đổi tên → giữ tên local, không để loadServerSessions ghi đè
   * bằng title cũ của server nếu BE chưa lưu rename. */
  titleRenamed?: boolean;
}
