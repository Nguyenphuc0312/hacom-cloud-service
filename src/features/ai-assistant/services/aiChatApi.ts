// TODO: Move to env var VITE_AI_CHAT_API_URL after demo
// TODO: Proxy via backend gateway to avoid CORS and add auth control
const AI_CHAT_API_URL = "https://ai-chat.fitora.id.vn/api/chat";
const TIMEOUT_MS = 60_000;

import type { AiChatResponse } from "../types";

export class AiApiError extends Error {
  readonly status: number;
  readonly kind: "timeout" | "network" | "http";

  constructor(
    status: number,
    kind: "timeout" | "network" | "http" = "http",
  ) {
    super(`AI API error [${kind}]: ${status}`);
    this.name = "AiApiError";
    this.status = status;
    this.kind = kind;
  }
}

export async function sendAiChatMessage(
  question: string,
  sessionId?: string | null,
): Promise<AiChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(AI_CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, session_id: sessionId ?? null }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiApiError(response.status, "http");
    }

    return (await response.json()) as AiChatResponse;
  } catch (err) {
    if (err instanceof AiApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiApiError(0, "timeout");
    }
    throw new AiApiError(0, "network");
  } finally {
    clearTimeout(timeoutId);
  }
}
