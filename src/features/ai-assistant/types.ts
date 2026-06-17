export type AiEndpoint = "company" | "personal";

export interface AiSource {
  citation_index: number;
  display_label?: string;
  source_name?: string;
  document_name?: string;
  source_file?: string;
  open_url?: string;
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
  task_name: string;
  requirements: string;
  completed: string;
  difficulties: string;
  notes?: string;
}

/**
 * File đính kèm ở mức báo cáo NGÀY (không theo từng task).
 * `download_url` là tương đối tới host AI — KHÔNG bao giờ chứa stored_path.
 */
export interface WorkReportAttachment {
  id: number;
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
}
