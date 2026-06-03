import { chatApi } from "../api/chatApi";
import {
  applyDeliveredReceiptMutation,
  applyReactionMutation,
  applyReadCursorMutations,
  refreshCacheIndex,
} from "../chat/domain/messageMerge";
import {
  isChatPerformanceEnabled,
  markChatPerformance,
} from "../../utils/chatPerformance";
import type {
  RealtimeMessageDeliveredPayload,
  RealtimeMessageReactionPayload,
  RealtimeReadCursorPayload,
} from "./realtimeMiddleware";

/**
 * Realtime batch coordinator.
 *
 * High-frequency metadata events (delivered receipts, read cursors, reactions)
 * arrive in bursts — in a group of N members, one message can produce up to N
 * delivered + N read receipts. Applying each event synchronously means N RTK
 * Query `updateQueryData` calls → N Immer produces → N new `messages` arrays →
 * N timeline re-derivations on the main thread → long tasks.
 *
 * This coordinator coalesces those events per conversation and flushes once per
 * animation frame: a single `updateQueryData` per conversation applies every
 * buffered mutation inside one Immer produce and rebuilds the cache index a
 * single time. `message:new` (append) is intentionally NOT routed here — it is
 * applied immediately so new messages feel instant.
 *
 * Ordering & dedupe:
 *  - delivered: keyed by messageId, last write wins (idempotent terminal-ish).
 *  - reactions: ordered replay (add/remove must net out — cannot key-collapse).
 *  - readCursors: ordered replay; read state only advances toward READ, so
 *    applying multiple monotonic cursors converges to the most-advanced one.
 *  - dedupe of duplicate transport events (reconnect echo) happens upstream in
 *    chatRealtimeAdapter via eventId, before events reach this coordinator.
 */

// Type the dispatch precisely from updateQueryData so the thunk overload and
// the returned PatchCollection (.patches) resolve without `any`.
type RealtimeUpdateThunk = ReturnType<typeof chatApi.util.updateQueryData>;
type RealtimePatchCollection = ReturnType<RealtimeUpdateThunk>;
type RealtimeBatchDispatch = (thunk: RealtimeUpdateThunk) => RealtimePatchCollection;

interface ConversationRealtimeBatch {
  conversationId: string;
  delivered: Map<string, RealtimeMessageDeliveredPayload>;
  reactions: RealtimeMessageReactionPayload[];
  readCursors: RealtimeReadCursorPayload[];
  eventCount: number;
}

export interface RealtimeBatchDebugStats {
  eventsEnqueued: number;
  flushes: number;
  updateQueryDataCalls: number;
  patchesApplied: number;
  maxFlushDurationMs: number;
}

export interface RealtimeBatchCoordinatorOptions {
  /**
   * Test seam: schedule a flush and return a cancel function. Defaults to
   * requestAnimationFrame with a setTimeout(0) fallback for non-DOM contexts.
   */
  schedule?: (flush: () => void) => () => void;
}

export interface RealtimeBatchCoordinator {
  enqueueDelivered: (payload: RealtimeMessageDeliveredPayload) => void;
  enqueueReaction: (payload: RealtimeMessageReactionPayload) => void;
  enqueueReadCursor: (payload: RealtimeReadCursorPayload) => void;
  /** Flush all pending batches synchronously now (cancels any scheduled flush). */
  flush: () => void;
  /** Cancel scheduled flush and drop pending batches without applying them. */
  dispose: () => void;
  /** Dev-only counters (only updated while chat performance debug is enabled). */
  readonly stats: RealtimeBatchDebugStats;
}

const defaultSchedule = (flush: () => void): (() => void) => {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(() => flush());
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(flush, 0);
  return () => clearTimeout(id);
};

const perfNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const createRealtimeBatchCoordinator = (
  dispatch: RealtimeBatchDispatch,
  options: RealtimeBatchCoordinatorOptions = {},
): RealtimeBatchCoordinator => {
  const schedule = options.schedule ?? defaultSchedule;
  const pending = new Map<string, ConversationRealtimeBatch>();
  let cancelScheduled: (() => void) | null = null;

  const stats: RealtimeBatchDebugStats = {
    eventsEnqueued: 0,
    flushes: 0,
    updateQueryDataCalls: 0,
    patchesApplied: 0,
    maxFlushDurationMs: 0,
  };

  const getOrCreateBatch = (
    conversationId: string,
  ): ConversationRealtimeBatch => {
    let batch = pending.get(conversationId);
    if (!batch) {
      batch = {
        conversationId,
        delivered: new Map(),
        reactions: [],
        readCursors: [],
        eventCount: 0,
      };
      pending.set(conversationId, batch);
    }
    return batch;
  };

  const ensureScheduled = (): void => {
    if (cancelScheduled) return;
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      flushInternal();
    });
  };

  const applyBatch = (batch: ConversationRealtimeBatch): void => {
    const startedAt = perfNow();
    const patch = dispatch(
      chatApi.util.updateQueryData(
        "getMessages",
        { conversationId: batch.conversationId },
        (draft) => {
          let changed = false;
          // delivered → read → reactions: read supersedes delivered when both
          // target the same message in one frame.
          for (const delivered of batch.delivered.values()) {
            changed = applyDeliveredReceiptMutation(draft, delivered) || changed;
          }
          for (const cursor of batch.readCursors) {
            changed = applyReadCursorMutations(draft, cursor) || changed;
          }
          for (const reaction of batch.reactions) {
            changed =
              applyReactionMutation(
                draft,
                {
                  messageId: reaction.messageId,
                  emoji: reaction.emoji,
                  userId: reaction.userId,
                },
                reaction.action,
              ) || changed;
          }
          // Rebuild the cache index exactly once for the whole batch.
          if (changed) {
            refreshCacheIndex(draft);
          }
        },
      ),
    );

    if (isChatPerformanceEnabled()) {
      const durationMs = perfNow() - startedAt;
      stats.updateQueryDataCalls += 1;
      stats.patchesApplied += patch.patches.length;
      stats.maxFlushDurationMs = Math.max(stats.maxFlushDurationMs, durationMs);
      markChatPerformance("fe.realtime.batch.flush", batch.conversationId, {
        eventCount: batch.eventCount,
        deliveredCount: batch.delivered.size,
        readCount: batch.readCursors.length,
        reactionCount: batch.reactions.length,
        patchCount: patch.patches.length,
        durationMs,
      });
    }
  };

  const flushInternal = (): void => {
    if (pending.size === 0) return;
    const batches = Array.from(pending.values());
    pending.clear();
    if (isChatPerformanceEnabled()) {
      stats.flushes += 1;
    }
    for (const batch of batches) {
      applyBatch(batch);
    }
  };

  return {
    enqueueDelivered(payload) {
      if (!payload.conversationId) return;
      const batch = getOrCreateBatch(payload.conversationId);
      batch.delivered.set(payload.messageId, payload);
      batch.eventCount += 1;
      if (isChatPerformanceEnabled()) stats.eventsEnqueued += 1;
      ensureScheduled();
    },
    enqueueReaction(payload) {
      if (!payload.conversationId) return;
      const batch = getOrCreateBatch(payload.conversationId);
      batch.reactions.push(payload);
      batch.eventCount += 1;
      if (isChatPerformanceEnabled()) stats.eventsEnqueued += 1;
      ensureScheduled();
    },
    enqueueReadCursor(payload) {
      if (!payload.conversationId) return;
      const batch = getOrCreateBatch(payload.conversationId);
      batch.readCursors.push(payload);
      batch.eventCount += 1;
      if (isChatPerformanceEnabled()) stats.eventsEnqueued += 1;
      ensureScheduled();
    },
    flush() {
      if (cancelScheduled) {
        cancelScheduled();
        cancelScheduled = null;
      }
      flushInternal();
    },
    dispose() {
      if (cancelScheduled) {
        cancelScheduled();
        cancelScheduled = null;
      }
      pending.clear();
    },
    stats,
  };
};
