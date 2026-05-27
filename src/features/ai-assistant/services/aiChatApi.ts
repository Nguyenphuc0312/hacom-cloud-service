const BASE_URL = "https://ai-chat.fitora.id.vn";
const ENDPOINTS = {
  company: `${BASE_URL}/api/chat/stream`,
  personal: `${BASE_URL}/api/chat/personal/stream`,
};
const UPLOAD_ENDPOINTS = {
  personalWeeklyReport: `${BASE_URL}/api/chat/personal/weekly-report/upload`,
};
const TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

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
          } catch {
            // Malformed SSE done payload — finalResponse stays null,
            // fallback regex parse below will attempt recovery.
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
        } catch {
          // Unrecoverable — caller will throw "No final response received"
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

export interface WeeklyReportUploadRequest {
  /** Câu hỏi của user về báo cáo — required, min length 1. */
  question: string;
  /** Mặc định "default" nếu không có session đang hoạt động. */
  session_id?: string;
  company?: string;
  week_start?: string;
  week_end?: string;
}

export interface WeeklyReportUploadResponse extends AiChatResponse {
  /** Trường mở rộng tuỳ backend trả về. */
  filename?: string;
  file_id?: string;
  [key: string]: unknown;
}

/**
 * Parse phần body trả về của endpoint upload weekly-report.
 * Endpoint có thể trả về JSON thường HOẶC SSE buffered text (cùng schema
 * với `/chat/personal/stream`). Hàm này thử cả hai để rút ra
 * `AiChatResponse`-compatible payload.
 */
function parseWeeklyReportUploadBody(
  text: string,
): WeeklyReportUploadResponse {
  const trimmed = text.trim();
  if (!trimmed) return { session_id: "", answer: "" };

  // 1) JSON trực tiếp
  try {
    const json = JSON.parse(trimmed);
    if (json && typeof json === "object") {
      return normalizeUploadResponse(json);
    }
  } catch {
    // fallthrough
  }

  // 2) SSE buffered — tìm event "done" cuối cùng
  const doneMatches = [
    ...trimmed.matchAll(/event:\s*done\s*\n\s*data:\s*(.+)/g),
  ];
  if (doneMatches.length > 0) {
    const lastData = doneMatches[doneMatches.length - 1][1].trim();
    try {
      return normalizeUploadResponse(JSON.parse(lastData));
    } catch {
      // fallthrough
    }
  }

  // 3) Fallback — gom text token nếu có
  const tokenChunks: string[] = [];
  const tokenMatches = trimmed.matchAll(/event:\s*token\s*\n\s*data:\s*(.+)/g);
  for (const match of tokenMatches) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "token" in parsed) {
        tokenChunks.push(String((parsed as { token?: unknown }).token ?? ""));
      } else if (typeof parsed === "string") {
        tokenChunks.push(parsed);
      }
    } catch {
      tokenChunks.push(raw);
    }
  }

  if (tokenChunks.length > 0) {
    return { session_id: "", answer: tokenChunks.join("") };
  }

  // 4) Last resort — trả raw text dưới dạng answer
  return { session_id: "", answer: trimmed };
}

function normalizeUploadResponse(value: unknown): WeeklyReportUploadResponse {
  const obj = (value ?? {}) as Record<string, unknown>;
  const answer =
    typeof obj.answer === "string"
      ? obj.answer
      : typeof obj.message === "string"
        ? (obj.message as string)
        : "";
  const sessionId =
    typeof obj.session_id === "string" ? (obj.session_id as string) : "";
  const sources = Array.isArray(obj.sources)
    ? (obj.sources as WeeklyReportUploadResponse["sources"])
    : undefined;
  return {
    ...obj,
    session_id: sessionId,
    answer,
    sources,
  } as WeeklyReportUploadResponse;
}

/**
 * Upload weekly report file kèm câu hỏi lên endpoint AI cá nhân.
 * Dùng XHR để có upload progress; response (JSON hoặc SSE buffered)
 * sẽ được chuẩn hoá thành `AiChatResponse`.
 */
export function uploadPersonalWeeklyReport(
  file: File,
  body: WeeklyReportUploadRequest,
  options?: {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<WeeklyReportUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = UPLOAD_ENDPOINTS.personalWeeklyReport;
    const timeoutId = window.setTimeout(() => {
      xhr.abort();
      reject(new AiApiError(0, "timeout"));
    }, UPLOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener("abort", handleAbort);
      }
    };

    const handleAbort = () => {
      xhr.abort();
      cleanup();
      reject(new AiApiError(0, "timeout"));
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new AiApiError(0, "timeout"));
        return;
      }
      options.signal.addEventListener("abort", handleAbort);
    }

    const form = new FormData();
    // ── Field order theo schema multipart/form-data của backend ──
    form.append("session_id", body.session_id?.trim() || "default");
    form.append("question", body.question);
    form.append("company", body.company ?? "");
    form.append("week_start", body.week_start ?? "");
    form.append("week_end", body.week_end ?? "");
    form.append("file", file, file.name);

    xhr.open("POST", url, true);
    xhr.responseType = "text";

    if (options?.onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          );
          options.onProgress?.(percent);
        }
      });
    }

    xhr.addEventListener("load", () => {
      cleanup();
      const status = xhr.status;
      const text = xhr.responseText ?? "";
      if (status >= 200 && status < 300) {
        resolve(parseWeeklyReportUploadBody(text));
        return;
      }
      reject(new AiApiError(status, "http"));
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new AiApiError(0, "network"));
    });

    xhr.addEventListener("abort", () => {
      cleanup();
      reject(new AiApiError(0, "timeout"));
    });

    xhr.send(form);
  });
}
