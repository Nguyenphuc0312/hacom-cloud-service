/**
 * Timeline V2 — message change classifier.
 *
 * Diffs two snapshots of a messages array and classifies the transition into
 * a single MessageChangeType. The classifier deliberately ignores in-place
 * `content_update` (e.g. edits) when the intent is to drive scroll decisions:
 * scroll handlers should bail out early on `content_update` and
 * `reconcile_update`.
 *
 * Rules (from spec, section D):
 *   - Stable key = `getMessageStableKey()` (clientMessageId aware).
 *   - Server ack of an existing optimistic message = `reconcile_update`,
 *     NOT a new append.
 *   - Pure reordering of the same set = `reorder`.
 *   - First non-empty array after empty = `initial`.
 *   - New keys at the tail = `append_remote` or `append_own`
 *     (distinguished by the message's senderId vs currentUserId).
 *   - New keys at the head = `prepend_older`.
 */

import type { Message } from "../../../types";
import { getMessageStableKey } from "../../../utils/messageTimeline";
import type {
  MessageChangeSummary,
  MessageChangeType,
} from "./scrollTypes";

const indexByKey = (messages: readonly Message[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    map.set(getMessageStableKey(messages[i]!), i);
  }
  return map;
};

export interface ClassifyOptions {
  currentUserId: string;
}

export function classifyMessageChange(
  previous: readonly Message[],
  next: readonly Message[],
  options: ClassifyOptions,
): MessageChangeSummary {
  // Empty-edge cases.
  if (previous.length === 0 && next.length === 0) {
    return emptySummary("noop");
  }
  if (previous.length === 0 && next.length > 0) {
    return {
      type: "initial",
      appendedKeys: next.map(getMessageStableKey),
      prependedKeys: [],
      reconciledKeys: [],
    };
  }
  if (previous.length > 0 && next.length === 0) {
    // Conversation cleared. Treat as initial; consumers will drop scroll
    // state via CONVERSATION_OPENED separately.
    return emptySummary("noop");
  }

  const prevByKey = indexByKey(previous);
  const nextByKey = indexByKey(next);

  // Detect new keys (appeared in next but not in previous).
  const appendedKeys: string[] = [];
  const prependedKeys: string[] = [];
  const prevFirstKey = getMessageStableKey(previous[0]!);
  const prevLastKey = getMessageStableKey(previous[previous.length - 1]!);
  const prevFirstIdxInNext = nextByKey.get(prevFirstKey);
  const prevLastIdxInNext = nextByKey.get(prevLastKey);

  for (const [key, idx] of nextByKey) {
    if (prevByKey.has(key)) continue;
    // A new key whose index is BEFORE prevFirstKey's new index → prepend.
    // After prevLastKey's new index → append.
    if (prevFirstIdxInNext !== undefined && idx < prevFirstIdxInNext) {
      prependedKeys.push(key);
    } else if (prevLastIdxInNext !== undefined && idx > prevLastIdxInNext) {
      appendedKeys.push(key);
    } else {
      // Inserted in the middle (rare; e.g. backfill of a hole). Treat as
      // reconcile-like content_update so we don't trigger append-follow.
      // We do NOT classify these as appends.
    }
  }

  // Detect reconciled keys: same key existed before AND after but underlying
  // message identity may have changed (e.g. id swap optimistic→server).
  const reconciledKeys: string[] = [];
  for (let i = 0; i < next.length; i++) {
    const m = next[i]!;
    const key = getMessageStableKey(m);
    const prevIdx = prevByKey.get(key);
    if (prevIdx === undefined) continue;
    const prev = previous[prevIdx]!;
    // If the server id was previously absent or temp-prefixed, this is a
    // reconcile.
    const wasOptimistic =
      prev.transportStatus === "optimistic" ||
      (typeof prev.id === "string" && prev.id.startsWith("temp-"));
    const isNowSent =
      m.sendState === "sent" ||
      m.transportStatus === "synced_stream" ||
      m.transportStatus === "acked_transport";
    if (wasOptimistic && isNowSent) {
      reconciledKeys.push(key);
    }
  }

  // Decide the dominant change type. Order matters — the first match wins.
  if (prependedKeys.length > 0 && appendedKeys.length === 0) {
    return { type: "prepend_older", appendedKeys, prependedKeys, reconciledKeys };
  }
  if (appendedKeys.length > 0 && prependedKeys.length === 0) {
    const lastNew = next[next.length - 1]!;
    const isOwn = lastNew.senderId === options.currentUserId;
    return {
      type: isOwn ? "append_own" : "append_remote",
      appendedKeys,
      prependedKeys,
      reconciledKeys,
    };
  }
  if (appendedKeys.length > 0 && prependedKeys.length > 0) {
    // Both occurred in the same diff (e.g. WS arrived during load older).
    // We still report both arrays so the hook can dispatch two events in
    // order (prepend first, then append). The "type" field reflects the
    // append because it's the one that may need to follow bottom.
    const lastNew = next[next.length - 1]!;
    const isOwn = lastNew.senderId === options.currentUserId;
    return {
      type: isOwn ? "append_own" : "append_remote",
      appendedKeys,
      prependedKeys,
      reconciledKeys,
    };
  }
  if (reconciledKeys.length > 0) {
    return {
      type: "reconcile_update",
      appendedKeys: [],
      prependedKeys: [],
      reconciledKeys,
    };
  }

  // Same set of keys. Could be reorder or content_update.
  if (previous.length === next.length) {
    let reordered = false;
    for (let i = 0; i < next.length; i++) {
      if (getMessageStableKey(next[i]!) !== getMessageStableKey(previous[i]!)) {
        reordered = true;
        break;
      }
    }
    if (reordered) {
      return {
        type: "reorder",
        appendedKeys: [],
        prependedKeys: [],
        reconciledKeys: [],
      };
    }
    // Same keys, same order → check for content delta.
    let contentChanged = false;
    for (let i = 0; i < next.length; i++) {
      const a = next[i]!;
      const b = previous[i]!;
      if (
        a.content !== b.content ||
        a.isEdited !== b.isEdited ||
        a.isDeleted !== b.isDeleted ||
        a.sendState !== b.sendState ||
        a.transportStatus !== b.transportStatus
      ) {
        contentChanged = true;
        break;
      }
    }
    return contentChanged
      ? emptySummary("content_update")
      : emptySummary("noop");
  }

  return emptySummary("noop");
}

function emptySummary(type: MessageChangeType): MessageChangeSummary {
  return { type, appendedKeys: [], prependedKeys: [], reconciledKeys: [] };
}
