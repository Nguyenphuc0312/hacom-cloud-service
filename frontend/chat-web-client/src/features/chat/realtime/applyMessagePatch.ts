import type {
  MessagePatchDependencies,
  NormalizedMessageRealtimeEvent,
  RealtimePatchResult,
} from "./realtimeEventTypes";
import type { Message } from "../../../types";

export const applyMessagePatch = <TSenderProfile = unknown>(
  dependencies: MessagePatchDependencies<TSenderProfile>,
  event: NormalizedMessageRealtimeEvent,
  options: {
    incrementUnread?: boolean;
    senderProfiles?: Record<string, TSenderProfile>;
  } = {},
): RealtimePatchResult => {
  const result = dependencies.ingestConversationMessageEvent(
    event.conversationId,
    {
      ...(event.messagePayload as unknown as Message),
      ...(event.stableId ? { stableId: event.stableId } : {}),
      ...(event.clientMessageId
        ? { clientMessageId: event.clientMessageId }
        : {}),
      ...(event.localId ? { localId: event.localId } : {}),
    },
    {
      incrementUnread: options.incrementUnread,
      source: event.socketEvent,
      ...(options.senderProfiles
        ? { senderProfiles: options.senderProfiles }
        : {}),
    },
  );

  return {
    applied: result.status !== "ignored",
    status: result.status,
  };
};
