import type { NormalizedMessageRealtimeEvent } from "./realtimeEventTypes";

export const hasMessageSequenceGap = (input: {
  event: NormalizedMessageRealtimeEvent;
  latestKnownSeq: number | null;
}): boolean =>
  input.event.socketEvent === "message:new" &&
  input.latestKnownSeq !== null &&
  input.event.incomingSeq !== null &&
  input.event.incomingSeq > input.latestKnownSeq + 1;

export const needsSelfMessageIdentityResync = (input: {
  event: NormalizedMessageRealtimeEvent;
  currentUserId?: string | null;
}): boolean =>
  input.event.socketEvent === "message:new" &&
  Boolean(
    input.event.senderId &&
      input.currentUserId &&
      input.event.senderId === input.currentUserId &&
      !input.event.clientMessageId &&
      !input.event.localId,
  );
