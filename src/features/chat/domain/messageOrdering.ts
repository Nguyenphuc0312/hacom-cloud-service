import type { Message } from "../../../types";
import { getStableMessageId } from "./messageIdentityMatching";

type MessageWithSequence = Message & {
  messageSeq?: number | null;
};

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toDateValue = (value: unknown): number => {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }

  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  return 0;
};

export const getMessageSequence = (message: Message): number | null => {
  const withSequence = message as MessageWithSequence;
  return (
    toFiniteNumber(withSequence.serverSeq) ??
    toFiniteNumber(withSequence.messageSeq)
  );
};

export const compareMessages = (left: Message, right: Message): number => {
  const leftSeq = getMessageSequence(left);
  const rightSeq = getMessageSequence(right);
  if (leftSeq !== null && rightSeq !== null && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }
  if (leftSeq !== null && rightSeq === null) return -1;
  if (leftSeq === null && rightSeq !== null) return 1;

  const serverTimeDiff =
    toDateValue(left.serverTs) - toDateValue(right.serverTs);
  if (serverTimeDiff !== 0) return serverTimeDiff;

  const localOrderDiff =
    (toFiniteNumber(left.localOrder) ?? Number.MAX_SAFE_INTEGER) -
    (toFiniteNumber(right.localOrder) ?? Number.MAX_SAFE_INTEGER);
  if (localOrderDiff !== 0) return localOrderDiff;

  const createdAtDiff =
    toDateValue(left.createdAt) - toDateValue(right.createdAt);
  if (createdAtDiff !== 0) return createdAtDiff;

  const stableDiff = getStableMessageId(left).localeCompare(
    getStableMessageId(right),
  );
  if (stableDiff !== 0) return stableDiff;

  return left.id.localeCompare(right.id);
};

export const sortMessagesByCanonicalOrder = (
  messages: readonly Message[],
): Message[] => [...messages].sort(compareMessages);

export const findSortedInsertIndex = (
  messages: readonly Message[],
  incoming: Message,
): number => {
  let low = 0;
  let high = messages.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compareMessages(messages[mid], incoming) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

