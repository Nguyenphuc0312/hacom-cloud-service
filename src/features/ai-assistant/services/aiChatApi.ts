const BASE_URL = "https://ai-chat.fitora.id.vn";
const ENDPOINTS = {
  company: `${BASE_URL}/api/chat/personal/stream`,
  personal: `${BASE_URL}/api/chat/stream`,
};
const TIMEOUT_MS = 60_000;

import type { AiChatRequest, AiChatResponse } from "../types";

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

/**
 * Sends a message to the AI chat API and handles the real-time SSE stream.
 */
export async function sendAiChatMessage(
  request: AiChatRequest,
  endpoint: "company" | "personal" = "company",
  options?: {
    onToken?: (token: string) => void;
    onThinking?: (thinking: string) => void;
  }
): Promise<AiChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const url = ENDPOINTS[endpoint];

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiApiError(response.status, "http");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is null");

    const decoder = new TextDecoder();
    let accumulatedText = "";
    let finalResponse: AiChatResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulatedText += chunk;

      // Handle multiple SSE events in one chunk
      const events = chunk.split("\n\n");
      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.replace("event: ", "").trim();
          } else if (line.startsWith("data: ")) {
            data = line.replace("data: ", "").trim();
          }
        }

        if (eventType === "token" && options?.onToken) {
          try {
            const tokenData = JSON.parse(data);
            options.onToken(tokenData.token);
          } catch (e) {
            // Fallback if not JSON
            options.onToken(data);
          }
        } else if (eventType === "thinking" && options?.onThinking) {
          options.onThinking(data);
        } else if (eventType === "done") {
          try {
            finalResponse = JSON.parse(data);
          } catch (e) {
            console.error("Failed to parse SSE done data", e);
          }
        }
      }
    }

    if (!finalResponse) {
      // Final attempt to parse from accumulated text if done event wasn't caught
      const doneMatch = accumulatedText.match(/event: done\s*data: (.*)/);
      if (doneMatch && doneMatch[1]) {
        try {
          finalResponse = JSON.parse(doneMatch[1]);
        } catch (e) {
          console.error("Failed to parse SSE done data from fallback match", e);
        }
      }
    }

    if (!finalResponse) {
      throw new Error("No final response received from AI stream");
    }

    return finalResponse;
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
