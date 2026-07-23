import type { Message } from "../types";

const generateEntropy = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const generateClientMessageId = (conversationId: string): string =>
  `client-${conversationId}-${generateEntropy()}`;

export const generateTempMessageId = (): string =>
  `temp-${generateEntropy()}`;

export const buildMessageCorrelationKey = (params: {
  conversationId?: string | null;
  clientMessageId?: string | null;
  tempId?: string | null;
  localId?: string | null;
}): string => {
  const conversationId = params.conversationId?.trim() || "unknown-conversation";
  const clientMessageId = params.clientMessageId?.trim() || "unknown-client";
  const localToken =
    params.tempId?.trim() || params.localId?.trim() || "unknown-local";

  return `${conversationId}:${clientMessageId}:${localToken}`;
};

export const getMessageIdentityKey = (
  message: Pick<Message, "stableId" | "localId" | "id">,
): string => message.stableId || message.localId || message.id;
