import { logger } from "../../../utils/logger";

/**
 * Timeline V2 — flag-gated debug logger.
 *
 * Enable in dev/staging via `VITE_CHAT_SCROLL_DEBUG=true`. In production builds
 * with the flag off, calls compile to a near no-op (one env-string compare).
 */

const CHAT_SCROLL_DEBUG =
  typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_CHAT_SCROLL_DEBUG === "true";

export type DebugEvent =
  | "state_transition"
  | "user_scroll"
  | "user_scroll_idle"
  | "bottom_state_change"
  | "classify_message_change"
  | "enqueue_command"
  | "reject_command"
  | "execute_command"
  | "command_expired"
  | "programmatic_scroll_start"
  | "programmatic_scroll_end"
  | "capture_anchor"
  | "restore_anchor"
  | "media_resize"
  | "virtualizer_measure"
  | "optimistic_append"
  | "optimistic_reconcile"
  | "websocket_append"
  | "new_message_badge_show"
  | "new_message_badge_click";

export const isChatScrollDebugEnabled = (): boolean => CHAT_SCROLL_DEBUG;

export function debugScroll(
  event: DebugEvent,
  payload: Record<string, unknown> = {},
): void {
  if (!CHAT_SCROLL_DEBUG) return;
  logger.debug("chat-scroll-v2", event, payload);
}

/**
 * Test-only override. Use ONLY from unit tests via the exported helper; not
 * exported through the package barrel.
 */
let testOverride: ((event: DebugEvent, payload: unknown) => void) | null = null;

export function __setDebugSinkForTest(
  sink: ((event: DebugEvent, payload: unknown) => void) | null,
): void {
  testOverride = sink;
}

export function debugScrollForTest(
  event: DebugEvent,
  payload: Record<string, unknown> = {},
): void {
  if (testOverride) testOverride(event, payload);
  else debugScroll(event, payload);
}
