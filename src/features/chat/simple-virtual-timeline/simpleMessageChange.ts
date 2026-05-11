import type { Message } from "../../../types";
import { getMessageStableKey } from "../../../utils/messageTimeline";

/**
 * Classify how the `messages` array changed between two renders.
 *
 * Pure function, no DOM, no React. Drives the scroll hook's reaction —
 * append (own / remote) → scroll-bottom or badge; prepend → preserve
 * scrollTop; everything else → no scroll.
 *
 * Comparison is by stable key (clientMessageId / stableId / id / localId),
 * not array identity, because RTK Query may produce a new array reference
 * for the same content; reacting to that as a "change" was a root cause of
 * the V2 stutter incident.
 */
export type SimpleMessageChange =
  | { type: "initial" }
  | {
      type: "append";
      appended: Message[];
      ownMessage: boolean;
      remoteCount: number;
    }
  | { type: "prepend"; prepended: Message[] }
  | { type: "update" }
  | { type: "noop" };

const buildKeyMap = (messages: readonly Message[]): Map<string, Message> => {
  const map = new Map<string, Message>();
  for (const m of messages) map.set(getMessageStableKey(m), m);
  return map;
};

export function classifySimpleMessageChange(
  prev: readonly Message[],
  next: readonly Message[],
  currentUserId: string,
): SimpleMessageChange {
  if (prev.length === 0 && next.length === 0) return { type: "noop" };
  if (prev.length === 0 && next.length > 0) return { type: "initial" };

  if (prev === next) return { type: "noop" };

  // Pure-append: prev is a strict prefix of next.
  if (next.length > prev.length) {
    const prevTailKey = getMessageStableKey(prev[prev.length - 1]!);
    const nextSameTailKey = getMessageStableKey(next[prev.length - 1]!);
    if (prevTailKey === nextSameTailKey) {
      const appended = next.slice(prev.length);
      const ownMessage = appended.some((m) => m.senderId === currentUserId);
      const remoteCount = appended.filter(
        (m) => m.senderId !== currentUserId,
      ).length;
      return { type: "append", appended, ownMessage, remoteCount };
    }

    // Pure-prepend: prev tail equals next tail at the same offset from end.
    const prevHeadKey = getMessageStableKey(prev[0]!);
    const offset = next.length - prev.length;
    const nextAtOffsetKey = getMessageStableKey(next[offset]!);
    if (prevHeadKey === nextAtOffsetKey) {
      return { type: "prepend", prepended: next.slice(0, offset) };
    }
  }

  // Same length OR reorder OR reconcile: detect any in-place key change
  // (reconcile sets new id on an optimistic message → key changes).
  const prevKeys = buildKeyMap(prev);
  const nextKeys = buildKeyMap(next);

  // If all next keys exist in prev (and vice versa), it's a content update.
  if (prevKeys.size === nextKeys.size) {
    let identical = true;
    for (const k of nextKeys.keys()) {
      if (!prevKeys.has(k)) {
        identical = false;
        break;
      }
    }
    if (identical) return { type: "update" };
  }

  // Fallback: treat as update (no scroll). Better to under-scroll than to
  // jump unpredictably — that was the prod symptom we're fixing.
  return { type: "update" };
}
