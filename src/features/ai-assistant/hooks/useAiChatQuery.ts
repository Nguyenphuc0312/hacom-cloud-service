/**
 * @fileoverview Data-fetching hooks for AI Chat REST endpoints.
 *
 * # Why vanilla hooks instead of a query library
 * This project uses RTK Query for the internal HACOM API.  The AI Chat
 * service is a different origin with a different data contract.  Rather than
 * adding a third state management library, these hooks are implemented with
 * vanilla React (useState + useEffect + useCallback) and delegate transport
 * to `aiChatClient`.  The same patterns apply — request deduplication is
 * handled by callers passing stable keys; cancellation uses AbortController.
 *
 * # Auth-aware retry
 * All hooks share `aiChatRetry` which uses `NormalizedError.retryable` as the
 * single source of truth.  Auth failures (401/403) are NEVER retried —
 * retrying a 401 would race the token coordinator and spam the auth service.
 *
 * # Cancellation
 * Every fetch is tied to an `AbortController` stored in a ref.  The effect
 * cleanup aborts in-flight requests on unmount and on dependency changes.
 */

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import aiChatClient from "../../../services/ai-chat/aiChatClient";
import { normalizeAiChatError } from "../../../services/ai-chat/aiChatClient";
import { isRetryableError } from "../../../services/ai-chat/normalizeError";
import type { NormalizedError } from "../../../services/ai-chat/types";
import type { AiMessage } from "../types";

// Identity (user_id / employee_code) is carried by the JWT Bearer token now;
// the backend extracts it server-side, so no X-User-Id / X-Employee-Code
// header is built here. The `userId` / `employeeCode` args are kept only as
// refetch keys (re-run the query when the signed-in account changes).

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: NormalizedError | null;
  /** Call to manually trigger a refetch. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Auth-aware retry helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the error is safe to retry.
 * Auth failures (401/403) and rate-limits → never retry.
 * Network / timeout / 5xx → retry up to `maxAttempts` times.
 */
function aiChatRetry(
  error: unknown,
  attemptsDone: number,
  maxAttempts = 2,
): boolean {
  const normalized = normalizeAiChatError(error);
  if (!isRetryableError(normalized)) return false;
  return attemptsDone < maxAttempts;
}

// ---------------------------------------------------------------------------
// Response normalizers — handle multiple API response shapes
// ---------------------------------------------------------------------------

function normalizeSessionsResponse(raw: unknown): AiChatSession[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) arr = obj.data;
    else if (Array.isArray(obj.sessions)) arr = obj.sessions;
    else if (Array.isArray(obj.items)) arr = obj.items;
  }

  return arr
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const obj = s as Record<string, unknown>;
      const id = String(obj.id ?? obj.session_id ?? "");
      if (!id) return null;
      return {
        id,
        title: String(obj.title ?? ""),
        createdAt: String(obj.createdAt ?? obj.created_at ?? new Date().toISOString()),
        updatedAt: String(obj.updatedAt ?? obj.updated_at ?? new Date().toISOString()),
        messageCount: Number(obj.messageCount ?? obj.message_count ?? 0),
      } satisfies AiChatSession;
    })
    .filter((s): s is AiChatSession => s !== null);
}

function normalizeMessagesResponse(raw: unknown): AiMessage[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) arr = obj.data;
    else if (Array.isArray(obj.messages)) arr = obj.messages;
    else if (Array.isArray(obj.items)) arr = obj.items;
    // Xử lý format {session: {messages: [...]}} hoặc {history: [...]}
    else if (obj.session && typeof obj.session === "object") {
      const sess = obj.session as Record<string, unknown>;
      if (Array.isArray(sess.messages)) arr = sess.messages;
      else if (Array.isArray(sess.data)) arr = sess.data;
    } else if (Array.isArray(obj.history)) arr = obj.history;
  }

  return arr
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const obj = m as Record<string, unknown>;
      // Backend dùng nhiều role cho tool-calling: "user", "assistant",
      // "assistant_tool_call" (rỗng), "tool" (kết quả tool nội bộ). Chỉ
      // user/assistant mới là tin nhắn hiển thị cho người dùng; các role
      // khác là chi tiết nội bộ — KHÔNG ép thành "user" (sẽ làm kết quả tool
      // hiện nhầm thành câu hỏi của user và sinh bong bóng rỗng sau khi F5).
      const role = String(obj.role ?? "user");
      const content = String(obj.content ?? obj.message ?? obj.text ?? "");
      const rawTs = obj.timestamp ?? obj.created_at ?? obj.createdAt;
      // sources lịch sử nằm trong metadata.sources (assistant) — giữ lại để
      // hiển thị nguồn trích dẫn sau khi tải lại.
      const meta = (obj.metadata ?? null) as Record<string, unknown> | null;
      const sources = Array.isArray(meta?.sources)
        ? (meta!.sources as AiMessage["sources"])
        : undefined;
      return {
        id: String(obj.id ?? obj.message_id ?? crypto.randomUUID()),
        role,
        content,
        timestamp: rawTs ? new Date(String(rawTs)) : new Date(),
        isStreaming: false,
        sources,
      };
    })
    // Bỏ message không phải hội thoại hiển thị (tool/assistant_tool_call/role
    // lạ) và assistant rỗng (placeholder tool-call). User rỗng cũng loại.
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .map((m) => ({ ...m, role: m.role as "user" | "assistant" })) as AiMessage[];
}

// ---------------------------------------------------------------------------
// useAiChatSessions
// ---------------------------------------------------------------------------

export function useAiChatSessions(
  userId?: string | null,
): QueryState<AiChatSession[]> {
  const [data, setData] = useState<AiChatSession[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NormalizedError | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    let attempts = 0;

    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { data: res } = await aiChatClient.get<unknown>(
          "/api/sessions",
          { signal: ac.signal, params: { limit: 100 } },
        );
        if (!ac.signal.aborted) {
          const sessions = normalizeSessionsResponse(res);
          setData(sessions.length > 0 ? sessions : undefined);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        if (aiChatRetry(err, attempts)) {
          attempts++;
          await run();
        } else {
          setError(normalizeAiChatError(err));
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => ac.abort("cleanup");
  }, [trigger, userId]);

  const refetch = useCallback(() => {
    setTrigger((n) => n + 1);
  }, []);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// useAiChatHistory
// ---------------------------------------------------------------------------

export function useAiChatHistory(
  sessionId: string | null | undefined,
  userId?: string | null,
  employeeCode?: string | null,
): QueryState<AiMessage[]> {
  // Lưu messages KÈM session_id mà chúng thuộc về. Nhờ vậy khi `sessionId`
  // đổi (chuyển hội thoại / mở hội thoại mới), `data` được tính lại ngay trong
  // render → KHÔNG để lịch sử cũ rò sang hội thoại khác (hội thoại mới bị
  // "dính" nội dung cũ).
  const [entry, setEntry] = useState<{ sid: string; messages: AiMessage[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NormalizedError | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setEntry(null);
      return;
    }

    const ac = new AbortController();
    let attempts = 0;

    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { data: res } = await aiChatClient.get<unknown>(
          `/api/sessions/${sessionId}`,
          { signal: ac.signal },
        );
        if (!ac.signal.aborted) {
          const messages = normalizeMessagesResponse(res);
          setEntry(messages.length > 0 ? { sid: sessionId, messages } : null);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        if (aiChatRetry(err, attempts)) {
          attempts++;
          await run();
        } else {
          setError(normalizeAiChatError(err));
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => ac.abort("cleanup");
  }, [sessionId, trigger, userId, employeeCode]);

  const refetch = useCallback(() => setTrigger((n) => n + 1), []);

  // Chỉ trả về data khi nó đúng với sessionId hiện tại (tránh rò dữ liệu cũ).
  const data = entry && sessionId && entry.sid === sessionId ? entry.messages : undefined;

  return { data, loading, error, refetch };
}
