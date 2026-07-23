import type { Message } from "../../../types";

export type MessageIdentity = Pick<
  Message,
  "id" | "localId" | "stableId" | "clientMessageId"
>;

export const isTempMessageId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith("temp-");

export const getStableMessageId = (message: MessageIdentity): string =>
  message.stableId || message.clientMessageId || message.localId || message.id;

export const toMessageIdentityKeys = (
  message: Partial<MessageIdentity>,
): string[] => {
  const keys = new Set<string>();

  if (typeof message.stableId === "string" && message.stableId.length > 0) {
    keys.add(`stable:${message.stableId}`);
  }

  if (
    typeof message.clientMessageId === "string" &&
    message.clientMessageId.length > 0
  ) {
    keys.add(`client:${message.clientMessageId}`);
    keys.add(`stable:${message.clientMessageId}`);
  }

  if (typeof message.id === "string" && message.id.length > 0) {
    keys.add(`id:${message.id}`);
    keys.add(`local:${message.id}`);
  }

  if (typeof message.localId === "string" && message.localId.length > 0) {
    keys.add(`id:${message.localId}`);
    keys.add(`local:${message.localId}`);
    keys.add(`stable:${message.localId}`);
  }

  return Array.from(keys);
};

export const messagesShareIdentity = (
  left: Partial<MessageIdentity>,
  right: Partial<MessageIdentity>,
): boolean => {
  const rightKeys = new Set(toMessageIdentityKeys(right));
  return toMessageIdentityKeys(left).some((key) => rightKeys.has(key));
};

export const findMessageIdentityIndex = (
  messages: readonly Message[],
  incoming: Partial<MessageIdentity>,
): number => {
  const incomingKeys = new Set(toMessageIdentityKeys(incoming));
  if (incomingKeys.size === 0) {
    return -1;
  }

  for (let index = 0; index < messages.length; index += 1) {
    const existing = messages[index];
    if (
      toMessageIdentityKeys(existing).some((key) => incomingKeys.has(key))
    ) {
      return index;
    }
  }

  return -1;
};

