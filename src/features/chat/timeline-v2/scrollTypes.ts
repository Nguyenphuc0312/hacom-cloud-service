/**
 * Timeline V2 — public types for the scroll owner.
 *
 * This module is intentionally framework-free (no React imports) so it can be
 * unit-tested as pure logic. The React layer lives in useChatScrollOwnerV2.ts.
 */

export type ScrollState =
  | "opening"
  | "measuring_initial"
  | "following_bottom"
  | "detached"
  | "user_scrolling"
  | "loading_older"
  | "preserving_anchor"
  | "sending_own_message"
  | "receiving_remote_message"
  | "media_settling"
  | "jumping_to_latest"
  | "jumping_to_message";

export type ScrollReason =
  | "initial_bottom"
  | "own_message_sent"
  | "remote_message_following"
  | "click_new_message_badge"
  | "preserve_after_prepend"
  | "manual_jump_to_message"
  | "restore_after_reload";

export type ScrollTarget =
  | { kind: "bottom" }
  | { kind: "offset"; value: number }
  | { kind: "index"; index: number; align?: "start" | "center" | "end" };

export type ScrollBehavior = "instant" | "smooth";

export interface ScrollCommand {
  id: string;
  reason: ScrollReason;
  priority: number;
  target: ScrollTarget;
  behavior: ScrollBehavior;
  createdAt: number;
  expiresAt?: number;
  sourceEvent?: string;
}

export const SCROLL_REASON_PRIORITY: Record<ScrollReason, number> = {
  preserve_after_prepend: 100,
  own_message_sent: 90,
  initial_bottom: 85,
  restore_after_reload: 85,
  manual_jump_to_message: 80,
  click_new_message_badge: 75,
  remote_message_following: 50,
};

/**
 * Threshold below which we still consider the user "pinned" to bottom while
 * already pinned (LEAVE). To re-enter pinned state we require a stricter
 * distance (ENTER). These mirror the legacy values but live here so V2 owns
 * its own constants and never imports legacy controllers.
 */
export const PINNED_BOTTOM_ENTER_PX = 24;
export const PINNED_BOTTOM_LEAVE_PX = 80;

/**
 * Distance under which a smooth scroll is preferred. Beyond this we use
 * instant scroll to avoid janky long animations.
 */
export const SMOOTH_SCROLL_MAX_DISTANCE_PX = 640;

/**
 * Cooldown after the user issues a wheel/touch event before we accept their
 * idle state again. Programmatic scroll events are filtered out separately
 * via the programmatic-scroll TTL.
 */
export const USER_SCROLL_IDLE_MS = 180;

/**
 * Cooldown between two load-older invocations to prevent re-entrant loops on
 * anchor restore.
 */
export const LOAD_OLDER_COOLDOWN_MS = 800;

/**
 * Anchor captured before a prepend so we can preserve the user's reading
 * position. `messageKey` uses getMessageStableKey for stability across
 * optimistic→server reconciliation.
 */
export interface VisibleAnchor {
  messageKey: string;
  index: number;
  offsetFromViewportTop: number;
}

/**
 * Events the state machine and queue accept. Each event carries enough
 * payload to drive transitions deterministically without re-reading DOM.
 */
export type ScrollEvent =
  | { type: "CONVERSATION_OPENED"; conversationId: string; at: number }
  | { type: "MESSAGES_READY"; messageCount: number; at: number }
  | { type: "VIRTUALIZER_MEASURED"; at: number }
  | { type: "USER_SCROLL"; distanceToBottom: number; at: number }
  | { type: "USER_SCROLL_IDLE"; at: number }
  | { type: "OWN_MESSAGE_SENT"; messageKey: string; at: number }
  | {
      type: "REMOTE_MESSAGE_APPENDED";
      messageKeys: string[];
      distanceToBottom: number;
      at: number;
    }
  | { type: "LOAD_OLDER_START"; anchor: VisibleAnchor | null; at: number }
  | {
      type: "LOAD_OLDER_DONE";
      prependedCount: number;
      anchorStillExists: boolean;
      at: number;
    }
  | { type: "MEDIA_RESIZED"; deltaPx: number; at: number }
  | { type: "JUMP_TO_LATEST"; at: number }
  | { type: "JUMP_TO_MESSAGE"; messageKey: string; at: number }
  | { type: "BOTTOM_REACHED"; at: number }
  | { type: "PROGRAMMATIC_SCROLL_END"; commandId: string; at: number };

/**
 * Result of classifying a messages array transition. Drives which scroll
 * decisions are appropriate (e.g. reconcile_update should NOT scroll).
 */
export type MessageChangeType =
  | "initial"
  | "append_own"
  | "append_remote"
  | "prepend_older"
  | "reconcile_update"
  | "content_update"
  | "reorder"
  | "noop";

export interface MessageChangeSummary {
  type: MessageChangeType;
  appendedKeys: string[];
  prependedKeys: string[];
  /** Optimistic→server reconciliations keyed by clientMessageId. */
  reconciledKeys: string[];
}

/**
 * Reasons a command was rejected by the queue. Surfaced via debug logs and
 * test assertions.
 */
export type CommandRejectReason =
  | "user_scrolling"
  | "expired"
  | "duplicate"
  | "stale_priority"
  | "state_disallows";
