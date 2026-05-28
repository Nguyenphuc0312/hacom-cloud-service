/**
 * @fileoverview Production-grade React hook for AI Chat streaming.
 *
 * # Architecture decisions
 *
 * ## useReducer instead of multiple useState calls
 * Chat state has several interdependent fields (isStreaming, messages, error).
 * `useReducer` guarantees atomic updates — a streaming token update and an
 * error state can never interleave into an inconsistent render.
 *
 * ## Refs for stable callbacks
 * The `send` function is memoised with an empty dependency array.  Inside it,
 * we read `endpointRef`, `sessionIdRef`, and `abortRef` — all React refs —
 * so the callback never re-creates even when these values change.  This
 * prevents child components from re-rendering when the parent's props change.
 *
 * ## AbortController lifecycle
 * A new AbortController is created for each `send()` call and stored in
 * `abortRef`.  The `useEffect` cleanup aborts it on unmount, preventing
 * state updates on an unmounted component.  Calling `abort()` from the UI
 * cancels mid-stream without re-mounting.
 *
 * ## Optimistic placeholder
 * A `PLACEHOLDER` assistant message is inserted synchronously with
 * `isStreaming: true` before the network call.  Tokens are accumulated into
 * it via reducer `TOKEN_RECEIVED`.  On completion/error, the placeholder is
 * replaced or marked as failed.  This gives instant visual feedback.
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { sendAiChatMessage } from "../services/aiChatApi";
import { normalizeAiChatError } from "../../../services/ai-chat/aiChatClient";
import type { NormalizedError } from "../../../services/ai-chat/types";
import type { AiEndpoint, AiMessage, AiSource } from "../types";

// ---------------------------------------------------------------------------
// State & Action types
// ---------------------------------------------------------------------------

interface ChatState {
  messages: AiMessage[];
  isStreaming: boolean;
  error: NormalizedError | null;
  currentSessionId: string | null;
}

type ChatAction =
  | { type: "USER_MESSAGE_ADDED"; payload: AiMessage }
  | { type: "PLACEHOLDER_ADDED"; payload: AiMessage }
  | { type: "TOKEN_RECEIVED"; payload: { id: string; token: string } }
  | {
      type: "STREAM_COMPLETED";
      payload: { id: string; answer: string; sessionId: string; sources?: AiSource[] };
    }
  | { type: "STREAM_FAILED"; payload: { id: string; error: NormalizedError } }
  | { type: "ERROR_CLEARED" }
  | { type: "SESSION_ID_UPDATED"; payload: string };

// ---------------------------------------------------------------------------
// Reducer — pure function, easy to unit-test in isolation
// ---------------------------------------------------------------------------

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "USER_MESSAGE_ADDED":
      return { ...state, messages: [...state.messages, action.payload] };

    case "PLACEHOLDER_ADDED":
      return {
        ...state,
        isStreaming: true,
        error: null,
        messages: [...state.messages, action.payload],
      };

    case "TOKEN_RECEIVED":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.payload.id
            ? { ...m, content: m.content + action.payload.token }
            : m,
        ),
      };

    case "STREAM_COMPLETED":
      return {
        ...state,
        isStreaming: false,
        currentSessionId: action.payload.sessionId,
        messages: state.messages.map((m) =>
          m.id === action.payload.id
            ? {
                ...m,
                content: action.payload.answer,
                sources: action.payload.sources,
                isStreaming: false,
              }
            : m,
        ),
      };

    case "STREAM_FAILED":
      return {
        ...state,
        isStreaming: false,
        error: action.payload.error,
        messages: state.messages.map((m) =>
          m.id === action.payload.id
            ? { ...m, isStreaming: false, isError: true }
            : m,
        ),
      };

    case "ERROR_CLEARED":
      return { ...state, error: null };

    case "SESSION_ID_UPDATED":
      return { ...state, currentSessionId: action.payload };

    default:
      return state;
  }
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  error: null,
  currentSessionId: null,
};

// ---------------------------------------------------------------------------
// Hook options & return type
// ---------------------------------------------------------------------------

export interface UseAiChatOptions {
  /** Which AI model backend to target. Default: `"company"`. */
  endpoint?: AiEndpoint;
  /**
   * Initial session ID.  The hook tracks the server-assigned session after
   * the first successful response.
   */
  sessionId?: string | null;
  /** Employee context forwarded to the AI service. */
  userContext?: {
    userId?: string;
    userName?: string;
    employeeCode?: string;
    employeeName?: string;
    department?: string;
  };
}

export interface UseAiChatReturn {
  /** Full message list — render this directly. */
  messages: AiMessage[];
  /** True while the SSE stream is open and tokens are arriving. */
  isStreaming: boolean;
  /** Normalized error from the last failed call, or null. */
  error: NormalizedError | null;
  /** Current session ID (null before the first successful turn). */
  sessionId: string | null;
  /**
   * Send a user message.  Returns a promise that resolves when the AI's full
   * response has been received, or rejects with a `NormalizedError`.
   *
   * The promise rejection is also stored in `error` — callers that don't
   * need the promise can ignore it; they'll observe `error` state instead.
   */
  send: (text: string) => Promise<void>;
  /** Abort the current stream mid-flight (no-op when not streaming). */
  abort: () => void;
  /** Clear the `error` state (e.g. when user dismisses the error banner). */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useAiChat(opts: UseAiChatOptions = {}): UseAiChatReturn {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  // Refs keep the send callback stable (empty deps) while reading live values.
  const endpointRef = useRef<AiEndpoint>(opts.endpoint ?? "company");
  const sessionIdRef = useRef<string | null>(opts.sessionId ?? null);
  const userContextRef = useRef(opts.userContext);
  const abortRef = useRef<AbortController | null>(null);

  // Keep refs in sync with incoming props without re-creating `send`.
  useEffect(() => {
    endpointRef.current = opts.endpoint ?? "company";
  }, [opts.endpoint]);

  useEffect(() => {
    // Prefer the tracked session ID from state; fall back to prop.
    sessionIdRef.current = state.currentSessionId ?? opts.sessionId ?? null;
  }, [state.currentSessionId, opts.sessionId]);

  useEffect(() => {
    userContextRef.current = opts.userContext;
  }, [opts.userContext]);

  // Abort in-flight stream on unmount to prevent state updates on unmounted component.
  useEffect(() => {
    return () => {
      abortRef.current?.abort("unmount");
    };
  }, []);

  // ---------------------------------------------------------------------------
  // send — stable (no deps, reads everything through refs)
  // ---------------------------------------------------------------------------
  const send = useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Cancel any in-progress stream before starting a new one.
    abortRef.current?.abort("new_message");
    const ac = new AbortController();
    abortRef.current = ac;

    // Deterministic IDs so we can target the right message in later actions.
    const userMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const botMsgId = `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Insert user message + empty assistant placeholder synchronously.
    dispatch({
      type: "USER_MESSAGE_ADDED",
      payload: {
        id: userMsgId,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      },
    });
    dispatch({
      type: "PLACEHOLDER_ADDED",
      payload: {
        id: botMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    });

    try {
      const ctx = userContextRef.current;
      const response = await sendAiChatMessage(
        {
          question: trimmed,
          session_id: sessionIdRef.current,
          user_id: ctx?.userId,
          user_name: ctx?.userName,
          employee_code: ctx?.employeeCode,
          employee_name: ctx?.employeeName,
          department: ctx?.department,
        },
        endpointRef.current,
        {
          signal: ac.signal,
          onToken: (token) =>
            dispatch({ type: "TOKEN_RECEIVED", payload: { id: botMsgId, token } }),
        },
      );

      dispatch({
        type: "STREAM_COMPLETED",
        payload: {
          id: botMsgId,
          answer: response.answer,
          sessionId: response.session_id,
          sources: response.sources,
        },
      });
    } catch (err) {
      // Don't report errors on deliberate cancellation.
      if (ac.signal.aborted) return;

      const normalized = normalizeAiChatError(err);
      dispatch({ type: "STREAM_FAILED", payload: { id: botMsgId, error: normalized } });
      throw normalized;
    }
  }, []); // stable — everything read via refs

  const abort = useCallback((): void => {
    abortRef.current?.abort("user_abort");
  }, []);

  const clearError = useCallback((): void => {
    dispatch({ type: "ERROR_CLEARED" });
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    sessionId: state.currentSessionId,
    send,
    abort,
    clearError,
  };
}
