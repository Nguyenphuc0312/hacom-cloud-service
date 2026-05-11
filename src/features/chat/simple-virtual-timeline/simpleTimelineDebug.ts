/**
 * Simple timeline debug logger. No-op by default. Flip
 * `globalThis.__SIMPLE_TIMELINE_DEBUG__ = true` in devtools to enable
 * verbose trace logs. The string event list is closed — adding new
 * events here forces a deliberate change rather than letting components
 * scatter ad-hoc console.log calls.
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
  | "jump_to_latest";

const isDebugEnabled = (): boolean => {
  if (typeof globalThis === "undefined") return false;
  return (
    (globalThis as Record<string, unknown>).__SIMPLE_TIMELINE_DEBUG__ === true
  );
};

export function logSimpleTimeline(
  event: SimpleTimelineDebugEvent,
  payload: Record<string, unknown> = {},
): void {
  if (!isDebugEnabled()) return;
  logger.debug("chat-simple-timeline", event, payload);
}
