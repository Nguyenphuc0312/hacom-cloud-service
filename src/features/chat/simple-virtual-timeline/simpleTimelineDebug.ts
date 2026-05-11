import { logger } from "../../../utils/logger";
import { isChatSimpleTimelineDebugEnabled } from "./simpleTimelineFlags";

/**
 * Simple timeline debug logger. Off by default; opt in via
 * `VITE_CHAT_SIMPLE_TIMELINE_DEBUG=true` (or the `__CHAT_FLAGS_OVERRIDE__`
 * bucket at runtime). The string event list is closed — adding new events
 * here forces a deliberate change rather than letting components scatter
 * ad-hoc console.log calls.
 */
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

export function logSimpleTimeline(
  event: SimpleTimelineDebugEvent,
  payload: Record<string, unknown> = {},
): void {
  if (!isChatSimpleTimelineDebugEnabled()) return;
  logger.debug("chat-simple-timeline", event, payload);
}
