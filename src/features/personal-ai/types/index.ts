import type { WorkReportFormRequest, DepartmentSelectionRequest } from "../../ai-assistant/types";

export type PersonalDocumentStatus = "uploading" | "indexed" | "error";

export interface PersonalDocument {
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
  session_id: string;
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
}

export interface UploadDocumentResponse {
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
