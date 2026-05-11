/**
 * Timeline V2 — pure state machine.
 *
 * Inputs: (currentState, event) → nextState.
 * No side effects, no React, no DOM. Side effects (scroll calls, queue
 * enqueue, badge toggles) are produced by `deriveSideEffects()` and consumed
 * by the React hook. This separation makes every transition exhaustively
 * testable.
 */

import type {
  ScrollEvent,
  ScrollState,
  ScrollReason,
  ScrollTarget,
  VisibleAnchor,
} from "./scrollTypes";
import { PINNED_BOTTOM_ENTER_PX, PINNED_BOTTOM_LEAVE_PX } from "./scrollTypes";

export interface MachineContext {
  conversationId: string | null;
  /** Stable key of the latest known message; used to detect new tail items. */
  latestMessageKey: string | null;
  /** True once the virtualizer has produced a measurement for the current convo. */
  measured: boolean;
  /** Anchor captured at the start of a load-older fetch. */
  loadingOlderAnchor: VisibleAnchor | null;
  /** Whether the user appears to be at/near bottom. Hysteresis-managed. */
  isPinnedToBottom: boolean;
  /** True between USER_SCROLL and USER_SCROLL_IDLE. Blocks low-prio commands. */
  isUserScrolling: boolean;
  /** Pending count for the "new messages" badge. */
  pendingNewMessages: number;
  /** Last load-older completion time; used to cool down further attempts. */
  lastLoadOlderAt: number;
}

export interface CommandRequest {
  reason: ScrollReason;
  target: ScrollTarget;
  behavior: "instant" | "smooth";
  sourceEvent: string;
}

export interface SideEffects {
  /** Commands the machine wants enqueued (subject to queue rejection rules). */
  enqueue: CommandRequest[];
  /** Whether to flip badge visibility. null = don't change. */
  badgeDelta: number;
  /** Optional debug payload to surface. */
  debug?: Record<string, unknown>;
}

export interface Transition {
  next: ScrollState;
  context: MachineContext;
  effects: SideEffects;
}

export const initialContext = (): MachineContext => ({
  conversationId: null,
  latestMessageKey: null,
  measured: false,
  loadingOlderAnchor: null,
  isPinnedToBottom: false,
  isUserScrolling: false,
  pendingNewMessages: 0,
  lastLoadOlderAt: 0,
});

export const initialState: ScrollState = "opening";

const noEffects = (): SideEffects => ({ enqueue: [], badgeDelta: 0 });

/**
 * Hysteresis-aware pinned-to-bottom resolver. Mirrors legacy thresholds but
 * lives in V2 so the machine has a single source of truth.
 */
export const resolvePinnedToBottom = (
  distanceToBottom: number,
  previouslyPinned: boolean,
): boolean =>
  previouslyPinned
    ? distanceToBottom < PINNED_BOTTOM_LEAVE_PX
    : distanceToBottom <= PINNED_BOTTOM_ENTER_PX;

/**
 * The transition function. Pure: never reads/writes anything outside the
 * inputs and outputs.
 *
 * @param state   current ScrollState
 * @param ctx     machine context
 * @param event   external event
 */
export function transition(
  state: ScrollState,
  ctx: MachineContext,
  event: ScrollEvent,
): Transition {
  switch (event.type) {
    case "CONVERSATION_OPENED": {
      const next: ScrollState = "opening";
      return {
        next,
        context: {
          ...initialContext(),
          conversationId: event.conversationId,
        },
        effects: { ...noEffects(), debug: { conversationId: event.conversationId } },
      };
    }

    case "MESSAGES_READY": {
      if (event.messageCount <= 0) {
        // Empty conversation: jump straight to following_bottom (nothing to
        // scroll, but conceptually we are pinned to the empty tail).
        return {
          next: "following_bottom",
          context: { ...ctx, isPinnedToBottom: true },
          effects: noEffects(),
        };
      }
      return {
        next: "measuring_initial",
        context: ctx,
        effects: noEffects(),
      };
    }

    case "VIRTUALIZER_MEASURED": {
      if (state === "measuring_initial") {
        // Initial bottom: only fires once per conversation, and only after
        // both data + measurement are ready. No setTimeout magic.
        return {
          next: "following_bottom",
          context: { ...ctx, measured: true, isPinnedToBottom: true },
          effects: {
            enqueue: [
              {
                reason: "initial_bottom",
                target: { kind: "bottom" },
                behavior: "instant",
                sourceEvent: "VIRTUALIZER_MEASURED",
              },
            ],
            badgeDelta: 0,
          },
        };
      }
      // Re-measurements after initial don't trigger scrolling on their own;
      // MEDIA_RESIZED is the dedicated channel for that.
      return {
        next: state,
        context: { ...ctx, measured: true },
        effects: noEffects(),
      };
    }

    case "USER_SCROLL": {
      const pinned = resolvePinnedToBottom(
        event.distanceToBottom,
        ctx.isPinnedToBottom,
      );
      // User scroll always wins: it forces user_scrolling state and clears
      // any badge if they reach bottom themselves.
      const badgeDelta = pinned ? -ctx.pendingNewMessages : 0;
      return {
        next: "user_scrolling",
        context: {
          ...ctx,
          isPinnedToBottom: pinned,
          isUserScrolling: true,
          pendingNewMessages: pinned ? 0 : ctx.pendingNewMessages,
        },
        effects: { enqueue: [], badgeDelta },
      };
    }

    case "USER_SCROLL_IDLE": {
      // Resolve into following_bottom or detached based on current pin state.
      const next: ScrollState = ctx.isPinnedToBottom
        ? "following_bottom"
        : "detached";
      return {
        next,
        context: { ...ctx, isUserScrolling: false },
        effects: noEffects(),
      };
    }

    case "OWN_MESSAGE_SENT": {
      // Always follow bottom for own messages — even when detached, because
      // the user explicitly composed and sent.
      return {
        next: "sending_own_message",
        context: {
          ...ctx,
          isPinnedToBottom: true,
          latestMessageKey: event.messageKey,
          pendingNewMessages: 0,
        },
        effects: {
          enqueue: [
            {
              reason: "own_message_sent",
              target: { kind: "bottom" },
              behavior: "smooth",
              sourceEvent: "OWN_MESSAGE_SENT",
            },
          ],
          badgeDelta: -ctx.pendingNewMessages,
        },
      };
    }

    case "REMOTE_MESSAGE_APPENDED": {
      // Only auto-scroll if we are CURRENTLY following bottom AND the user
      // is not actively scrolling. Otherwise just bump the badge.
      const canFollow =
        state === "following_bottom" &&
        !ctx.isUserScrolling &&
        ctx.isPinnedToBottom;

      if (canFollow) {
        return {
          next: "receiving_remote_message",
          context: {
            ...ctx,
            latestMessageKey:
              event.messageKeys[event.messageKeys.length - 1] ??
              ctx.latestMessageKey,
          },
          effects: {
            enqueue: [
              {
                reason: "remote_message_following",
                target: { kind: "bottom" },
                behavior: "smooth",
                sourceEvent: "REMOTE_MESSAGE_APPENDED",
              },
            ],
            badgeDelta: 0,
          },
        };
      }
      // Detached / user_scrolling / etc.: append data but DO NOT scroll.
      return {
        next: state,
        context: {
          ...ctx,
          latestMessageKey:
            event.messageKeys[event.messageKeys.length - 1] ??
            ctx.latestMessageKey,
          pendingNewMessages: ctx.pendingNewMessages + event.messageKeys.length,
        },
        effects: { enqueue: [], badgeDelta: event.messageKeys.length },
      };
    }

    case "LOAD_OLDER_START": {
      // Cooldown enforcement happens in the queue, not here. The machine
      // simply records the anchor.
      return {
        next: "loading_older",
        context: { ...ctx, loadingOlderAnchor: event.anchor },
        effects: noEffects(),
      };
    }

    case "LOAD_OLDER_DONE": {
      const baseCtx: MachineContext = {
        ...ctx,
        lastLoadOlderAt: event.at,
      };
      if (event.prependedCount === 0) {
        // No new items; return to the appropriate settled state.
        return {
          next: ctx.isPinnedToBottom ? "following_bottom" : "detached",
          context: { ...baseCtx, loadingOlderAnchor: null },
          effects: noEffects(),
        };
      }
      if (!event.anchorStillExists || !ctx.loadingOlderAnchor) {
        // Anchor lost: hold current scrollTop, do NOT scroll bottom.
        return {
          next: "detached",
          context: { ...baseCtx, loadingOlderAnchor: null },
          effects: { ...noEffects(), debug: { fallback: "anchor_lost" } },
        };
      }
      // Restore via priority-100 command. After execution the hook will
      // dispatch USER_SCROLL_IDLE (or a no-op) to return to detached.
      return {
        next: "preserving_anchor",
        context: baseCtx,
        effects: {
          enqueue: [
            {
              reason: "preserve_after_prepend",
              target: { kind: "index", index: ctx.loadingOlderAnchor.index },
              behavior: "instant",
              sourceEvent: "LOAD_OLDER_DONE",
            },
          ],
          badgeDelta: 0,
        },
      };
    }

    case "MEDIA_RESIZED": {
      // Hard rule: media resize NEVER triggers scroll when detached or while
      // user is scrolling. When pinned, the virtualizer keeps us pinned —
      // no explicit scroll command needed.
      if (
        state === "detached" ||
        state === "user_scrolling" ||
        state === "loading_older" ||
        state === "preserving_anchor"
      ) {
        return {
          next: state,
          context: ctx,
          effects: { ...noEffects(), debug: { ignoredReason: state } },
        };
      }
      // following_bottom or any active state: enter media_settling briefly so
      // tests can observe it; the hook will resolve back via subsequent
      // USER_SCROLL or VIRTUALIZER_MEASURED events.
      return {
        next: "media_settling",
        context: ctx,
        effects: noEffects(),
      };
    }

    case "JUMP_TO_LATEST": {
      return {
        next: "jumping_to_latest",
        context: {
          ...ctx,
          isPinnedToBottom: true,
          pendingNewMessages: 0,
        },
        effects: {
          enqueue: [
            {
              reason: "click_new_message_badge",
              target: { kind: "bottom" },
              behavior: "smooth",
              sourceEvent: "JUMP_TO_LATEST",
            },
          ],
          badgeDelta: -ctx.pendingNewMessages,
        },
      };
    }

    case "JUMP_TO_MESSAGE": {
      return {
        next: "jumping_to_message",
        context: ctx,
        effects: {
          enqueue: [
            {
              reason: "manual_jump_to_message",
              // Index resolved by hook before enqueue.
              target: { kind: "offset", value: 0 },
              behavior: "smooth",
              sourceEvent: "JUMP_TO_MESSAGE",
            },
          ],
          badgeDelta: 0,
        },
      };
    }

    case "BOTTOM_REACHED": {
      // Settle into following_bottom regardless of how we got here.
      return {
        next: "following_bottom",
        context: {
          ...ctx,
          isPinnedToBottom: true,
          pendingNewMessages: 0,
        },
        effects: { enqueue: [], badgeDelta: -ctx.pendingNewMessages },
      };
    }

    case "PROGRAMMATIC_SCROLL_END": {
      // No state change here; the hook uses this only to release the
      // programmatic-scroll TTL flag.
      return { next: state, context: ctx, effects: noEffects() };
    }

    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = event;
      void _exhaustive;
      return { next: state, context: ctx, effects: noEffects() };
    }
  }
}
