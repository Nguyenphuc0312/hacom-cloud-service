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
}

// ---------------------------------------------------------------------------
// Work Report types
// ---------------------------------------------------------------------------

export interface WorkReportFormRequest {
  form_type: "daily_work_report";
  date: string;
  employee_code: string;
  fields: string[];
  field_labels: Record<string, string>;
  existing: {
    task_name: string;
    requirements: string;
    completed: string;
    difficulties: string;
  } | null;
  submit_endpoint: string;
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
  task_name: string;
  requirements: string;
  completed: string;
  difficulties: string;
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
}

export interface AiConversation {
  id: string;
  title: string;
  endpoint: AiEndpoint;
  messages: AiMessage[];
  createdAt: Date;
  updatedAt: Date;
  isPinned?: boolean;
}
