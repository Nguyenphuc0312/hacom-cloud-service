import type { Message } from "../../../types";

export type ChatRealtimeEventName =
  | "message:new"
  | "message:created"
  | "message:updated"
  | "message:deleted"
  | "message:revoked"
  | "message:read"
  | "conversation:updated"
  | "conversation:user_state_updated"
  | "conversation:membership_updated"
  | "typing:started"
  | "typing:stopped"
  | "presence:updated"
  | "reconnect:resync";

export interface NormalizedMessageRealtimeEvent {
  kind: "message.created" | "message.updated";
  socketEvent: "message:new" | "message:updated";
  conversationId: string;
  messageId: string;
  eventId: string;
  messagePayload: Record<string, unknown>;
  payload: Record<string, unknown>;
  clientMessageId?: string;
  localId?: string;
  tempId?: string;
  stableId?: string;
  senderId?: string;
  incomingSeq: number | null;
  correlationKey: string;
}

export interface MessagePatchDependencies<TSenderProfile = unknown> {
  ingestConversationMessageEvent: (
    conversationId: string,
    message: Message | Message[],
    options?: {
      incrementUnread?: boolean;
      hydrated?: boolean;
      source?: string;
      senderProfiles?: Record<string, TSenderProfile>;
    },
  ) => {
    status: "new" | "merged" | "ignored";
    canonicalMessage: Message | null;
    mergedMessage: Message | null;
    unreadDelta: number;
  };
}

export interface RealtimePatchResult {
  applied: boolean;
  status?: "new" | "merged" | "ignored";
  reason?: string;
}
