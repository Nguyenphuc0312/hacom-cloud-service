/**
 * @fileoverview Authenticated SSE (Server-Sent Events) transport layer.
 *
 * # Why not `EventSource`?
 * The `EventSource` API does not support custom request headers — including
 * `Authorization`.  It also only supports GET requests.  For a POST-based
 * SSE stream that requires Bearer authentication we MUST use fetch() with
 * a `ReadableStream` body reader.
 *
 * # Architecture
 * This module handles the transport layer only:
 *   - authenticated connection setup (via `fetchWithAuth`)
 *   - raw SSE frame parsing (`parseSSEEvent`)
 *   - error normalisation and cleanup
 *
 * Domain-specific event interpretation (e.g. `token`, `thinking`, `done`)
 * stays in `aiChatApi.ts`.  The `onEvent(type, data)` callback decouples the
 * protocol from the transport.
 *
 * # Cleanup and cancellation
 * `openSSEStream` returns a `cleanup` function.  Calling it:
 *   - Aborts the fetch connection
 *   - Cancels the ReadableStream reader
 *   - Does NOT invoke `onError` — a deliberate abort is not an error
 *
 * React consumers store this in a ref and call it from `useEffect` cleanup.
 *
 * # Retry on 401
 * If the initial connection returns 401, the auth refresh is attempted once
 * via `fetchWithAuth`'s built-in retry.  Mid-stream 401s are not retried
 * (the stream would need to restart from the beginning, which is the caller's
 * responsibility if needed).
 */

import { fetchWithAuth } from "./fetchWithAuth";
import { normalizeResponseError, normalizeAiChatError } from "./normalizeError";
import { AI_CHAT_SSE_TIMEOUT_MS, X_REQUEST_ID_HEADER } from "./constants";
import type { NormalizedError, ParsedSSEEvent } from "./types";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// SSE frame parser
// ---------------------------------------------------------------------------

/**
 * Parses a single SSE event block (text between blank lines).
 *
 * Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
 *
 * Handles:
 *   - `event: <type>`
 *   - `data: <payload>`
 *   - Multi-line data fields (concatenated with newlines)
 *   - Comment lines (`:`) — silently ignored
 *
 * Returns `null` when the block has no `data` field (ping / comment blocks).
 */
export function parseSSEEvent(block: string): ParsedSSEEvent | null {
  let type = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.startsWith(":")) continue; // SSE comment — skip

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      // Field with no value — spec says treat value as empty string.
      if (line === "event") type = "";
      continue;
    }

    const field = line.slice(0, colonIndex);
    // Single space after colon is stripped per spec.
    const value = line.slice(colonIndex + 1).replace(/^ /, "");

    if (field === "event") type = value;
    else if (field === "data") dataLines.push(value);
    // `id` and `retry` fields are intentionally ignored for this use-case.
  }

  if (dataLines.length === 0) return null;

  return { type, data: dataLines.join("\n") };
}

// ---------------------------------------------------------------------------
// Stream options
// ---------------------------------------------------------------------------

export interface SSEStreamOptions {
  /** External abort signal (e.g. from React useEffect cleanup). */
  signal?: AbortSignal;

  /**
   * Called for each parsed SSE event.
   * `type` is the event type (defaults to `"message"`).
   * `data` is the raw data payload (may be JSON or plain text).
   */
  onEvent: (type: string, data: string) => void;

  /** Called once when the stream ends cleanly (server closed the connection). */
  onComplete: () => void;

  /**
   * Called on transport errors — 4xx/5xx responses, network failures, timeouts.
   * NOT called on deliberate cancellation via the cleanup function or signal.
   */
  onError: (err: NormalizedError) => void;

  /**
   * Override the SSE-specific timeout.
   * Default: `AI_CHAT_SSE_TIMEOUT_MS` (120 seconds).
   */
  timeoutMs?: number;

  /** Pre-computed correlation ID — forwarded to `fetchWithAuth`. */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Core stream function
// ---------------------------------------------------------------------------

/**
 * Opens an authenticated SSE stream via a POST request.
 *
 * @returns A cleanup function.  Call it to abort the stream at any time.
 *          It is idempotent — calling it multiple times is safe.
 *
 * @example
 *   // In a React hook:
 *   const abortRef = useRef<() => void>(() => undefined);
 *   abortRef.current = openSSEStream(url, body, { onEvent, onComplete, onError });
 *   // In useEffect cleanup:
 *   return () => abortRef.current();
 */
export function openSSEStream(
  url: string,
  body: unknown,
  opts: SSEStreamOptions,
): () => void {
  const ac = new AbortController();
  let aborted = false;

  // Compose the caller's signal with ours.
  if (opts.signal) {
    if (opts.signal.aborted) {
      ac.abort(opts.signal.reason);
    } else {
      opts.signal.addEventListener("abort", () => ac.abort(opts.signal!.reason), {
        once: true,
      });
    }
  }

  // Launch the async reader in a void IIFE so the synchronous caller
  // receives the cleanup function immediately.
  void (async () => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetchWithAuth(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          // Pass our composed signal — fetchWithAuth will compose it further
          // with its internal timeout.
          signal: ac.signal,
        },
        {
          signal: ac.signal,
          timeoutMs: opts.timeoutMs ?? AI_CHAT_SSE_TIMEOUT_MS,
          correlationId: opts.correlationId,
        },
      );

      if (!response.ok) {
        if (!aborted) {
          opts.onError(
            normalizeResponseError(response, {
              correlationId:
                response.headers.get(X_REQUEST_ID_HEADER) ?? opts.correlationId,
            }),
          );
        }
        return;
      }

      if (!response.body) {
        if (!aborted) {
          opts.onError({
            kind: "http",
            status: response.status,
            message: "Response body is null — SSE stream unavailable.",
            retryable: false,
            correlationId: opts.correlationId,
          });
        }
        return;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      // Buffer holds an incomplete SSE event block between chunks.
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (aborted) break;

        // `stream: true` tells the decoder not to flush multi-byte sequences
        // at chunk boundaries — required for UTF-8 correctness.
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by blank lines (\n\n).
        // We split, keep all complete events, and retain the trailing partial.
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          if (!block.trim()) continue;
          const event = parseSSEEvent(block);
          if (event && !aborted) {
            opts.onEvent(event.type, event.data);
          }
        }
      }

      // Flush any remaining buffer content (no trailing \n\n at stream end).
      if (buffer.trim() && !aborted) {
        const event = parseSSEEvent(buffer);
        if (event) opts.onEvent(event.type, event.data);
      }

      if (!aborted) opts.onComplete();
    } catch (err) {
      if (aborted) return; // deliberate abort — not an error

      const isDomAbort =
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "TimeoutError");

      if (isDomAbort && aborted) return;

      const normalized = normalizeAiChatError(err, opts.correlationId);

      // Filter out deliberate cancellation that surfaces as AbortError.
      if (normalized.kind === "network" && normalized.message.includes("cancelled")) {
        return;
      }

      logger.warn("ai-chat-sse", "stream_error", {
        url,
        kind: normalized.kind,
        status: normalized.status,
        correlationId: opts.correlationId,
      });

      opts.onError(normalized);
    } finally {
      // Always release the reader lock to prevent ReadableStream leaks.
      try {
        await reader?.cancel();
      } catch {
        // ignore — reader may already be closed
      }
    }
  })();

  return () => {
    aborted = true;
    ac.abort("user_abort");
  };
}
