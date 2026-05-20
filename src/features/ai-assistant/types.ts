export type AiEndpoint = "company" | "personal";

export interface AiChatSource {
  source_name: string;
  source_path: string;
  page_number: number;
  document_id: string;
  vector_score: number;
  lexical_score: number;
  rerank_score: number;
  metadata_score: number;
  rrf_score: number;
  hybrid_score: number;
  llm_rerank_score: number;
  final_score: number;
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
  question: string;
  answer: string;
  sources: AiChatSource[];
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: AiChatSource[];
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
