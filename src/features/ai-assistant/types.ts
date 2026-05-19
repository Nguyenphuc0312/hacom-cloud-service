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
}

export interface AiChatResponse {
  session_id: string;
  question: string;
  answer: string;
  sources: AiChatSource[];
}
