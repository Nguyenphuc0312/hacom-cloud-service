/**
 * Simple timeline debug logger. No-op by default. Flip
 * `globalThis.__SIMPLE_TIMELINE_DEBUG__ = true` in devtools to enable
 * verbose trace logs. The string event list is closed — adding new
 * events here forces a deliberate change rather than letting components
 * scatter ad-hoc console.log calls.
 *
 * Usage in devtools:
 *   window.__SIMPLE_TIMELINE_DEBUG__ = true
 *
 * Output format per event:
 *   [chat-simple-timeline] <event> {
 *     scrollTop, scrollHeight, clientHeight, distanceToBottom, ...eventData
 *   }
 *
 * QA acceptance criteria for scroll fixes:
 *   - distanceToBottom <= 2px after initial settle
 *   - last message visible in viewport
 *   - no unexpected re-anchor after user scrolls away
 */
import { logger } from "../../../utils/logger";

export type SimpleTimelineDebugEvent =
  | "initial_bottom"
  | "user_scroll"
  | "append_own_scroll_bottom"
  | "append_remote_scroll_bottom"
  | "append_remote_badge"
  | "load_older_start"
  | "load_older_restore_delta"
  | "media_load_keep_bottom"
  | "media_load_detached_noop"
  | "media_load_noop_distance"
  | "jump_to_latest"
  | "measurement_grow_recorrect_bottom"
  | "rule9_guard_skipped"
  | "rule9_guard_passed";

const isDebugEnabled = (): boolean => {
  if (typeof globalThis === "undefined") return false;
  return (
    (globalThis as Record<string, unknown>).__SIMPLE_TIMELINE_DEBUG__ === true
  );
};

/**
 * Collects scroll state from a DOM element for debugging.
 * Returns null if the element is not available.
 */
const getScrollState = (
  el: HTMLElement | null,
): Record<string, number> | null => {
  if (!el) return null;
  const scrollHeight = el.scrollHeight;
  const scrollTop = el.scrollTop;
  const clientHeight = el.clientHeight;
  const distanceToBottom = scrollHeight - scrollTop - clientHeight;
  return { scrollTop, scrollHeight, clientHeight, distanceToBottom };
};

export function logSimpleTimeline(
  event: SimpleTimelineDebugEvent,
  payload: Record<string, unknown> = {},
): void {
  if (!isDebugEnabled()) return;

  // Include the call site stack for traceability.
  const stack = new Error().stack
    ?.split("\n")
    .slice(2, 6)
    .map((line) => line.trim())
    .join(" <- ");

  logger.debug("chat-simple-timeline", event, {
    ...payload,
    stack,
  });
}

/**
 * Extended debug log that includes scroll element state.
 * Use this for Rule 9 and other scroll-critical events where
 * the scroll element is available at the call site.
 */
export function logSimpleTimelineWithScrollState(
  event: SimpleTimelineDebugEvent,
  el: HTMLElement | null,
  extra: Record<string, unknown> = {},
): void {
  if (!isDebugEnabled()) return;

  const scrollState = getScrollState(el);
  const stack = new Error().stack
    ?.split("\n")
    .slice(2, 4)
    .map((line) => line.trim())
    .join(" <- ");

  logger.debug("chat-simple-timeline", event, {
    ...scrollState,
    ...extra,
    stack,
  });
}
