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

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: AiSource[];
  isStreaming?: boolean;
  isError?: boolean;
  thinking?: string;
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
