export interface ContactProfileViewDetail {
  userId?: string;
}

export interface StartDirectMessageDetail {
  userId: string;
}

export interface MentionProfileViewDetail {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface NotificationClickDetail {
  conversationId?: string;
  messageId?: string;
}

export interface OpenConversationDetail {
  conversationId: string;
  messageId?: string;
}

export type FileSourceInvalidationReason =
  | "message-deleted"
  | "message-recalled"
  | "membership-lost";

export interface FileSourceInvalidatedDetail {
  conversationId: string;
  reason: FileSourceInvalidationReason;
}

export type ChatRouteIntent =
  | ({ type: "open-conversation" } & OpenConversationDetail)
  | ({ type: "start-direct-message" } & StartDirectMessageDetail);

export interface ChatRouteState {
  chatIntent: ChatRouteIntent & { requestId: string };
}

const CONTACT_PROFILE_VIEW_EVENT = "chat:contact:view-profile";
const NOTIFICATION_CLICK_EVENT = "chat:notification:clicked";
const OPEN_CONVERSATION_EVENT = "chat:open-conversation";
const START_DIRECT_MESSAGE_EVENT = "chat:start-direct-message";
const MENTION_PROFILE_VIEW_EVENT = "chat:mention:view-profile";
const FILE_SOURCE_INVALIDATED_EVENT = "chat:file-source:invalidated";

let routeIntentSequence = 0;

export const createChatRouteState = (
  intent: ChatRouteIntent,
): ChatRouteState => ({
  chatIntent: {
    ...intent,
    requestId: `${Date.now()}:${++routeIntentSequence}`,
  },
});

export const readChatRouteIntent = (
  state: unknown,
): ChatRouteState["chatIntent"] | null => {
  if (!state || typeof state !== "object") return null;
  const intent = (state as { chatIntent?: unknown }).chatIntent;
  if (!intent || typeof intent !== "object") return null;

  const candidate = intent as Partial<ChatRouteState["chatIntent"]>;
  if (!candidate.requestId || !candidate.type) return null;
  if (candidate.type === "open-conversation") {
    return typeof candidate.conversationId === "string" &&
      candidate.conversationId.length > 0
      ? (candidate as ChatRouteState["chatIntent"])
      : null;
  }
  if (candidate.type === "start-direct-message") {
    return typeof candidate.userId === "string" && candidate.userId.length > 0
      ? (candidate as ChatRouteState["chatIntent"])
      : null;
  }
  return null;
};

const dispatchWindowEvent = <TDetail>(name: string, detail: TDetail): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<TDetail>(name, { detail }));
};

const listenWindowEvent = <TDetail>(
  name: string,
  handler: (detail: TDetail) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener: EventListener = (event) => {
    const customEvent = event as CustomEvent<TDetail>;
    handler(customEvent.detail);
  };

  window.addEventListener(name, listener);
  return () => {
    window.removeEventListener(name, listener);
  };
};

export const dispatchContactProfileView = (
  detail: ContactProfileViewDetail,
): void => {
  dispatchWindowEvent(CONTACT_PROFILE_VIEW_EVENT, detail);
};

export const listenForContactProfileView = (
  handler: (detail: ContactProfileViewDetail) => void,
): (() => void) => listenWindowEvent(CONTACT_PROFILE_VIEW_EVENT, handler);

export const dispatchNotificationClick = (
  detail: NotificationClickDetail,
): void => {
  dispatchWindowEvent(NOTIFICATION_CLICK_EVENT, detail);
};

export const listenForNotificationClick = (
  handler: (detail: NotificationClickDetail) => void,
): (() => void) => listenWindowEvent(NOTIFICATION_CLICK_EVENT, handler);

export const dispatchOpenConversation = (
  detail: OpenConversationDetail,
): void => {
  dispatchWindowEvent(OPEN_CONVERSATION_EVENT, detail);
};

export const listenForOpenConversation = (
  handler: (detail: OpenConversationDetail) => void,
): (() => void) => listenWindowEvent(OPEN_CONVERSATION_EVENT, handler);

export const dispatchStartDirectMessage = (
  detail: StartDirectMessageDetail,
): void => {
  dispatchWindowEvent(START_DIRECT_MESSAGE_EVENT, detail);
};

export const listenForStartDirectMessage = (
  handler: (detail: StartDirectMessageDetail) => void,
): (() => void) => listenWindowEvent(START_DIRECT_MESSAGE_EVENT, handler);

export const dispatchMentionProfileView = (
  detail: MentionProfileViewDetail,
): void => {
  dispatchWindowEvent(MENTION_PROFILE_VIEW_EVENT, detail);
};

export const listenForMentionProfileView = (
  handler: (detail: MentionProfileViewDetail) => void,
): (() => void) => listenWindowEvent(MENTION_PROFILE_VIEW_EVENT, handler);

export const dispatchFileSourceInvalidated = (
  detail: FileSourceInvalidatedDetail,
): void => {
  dispatchWindowEvent(FILE_SOURCE_INVALIDATED_EVENT, detail);
};

export const listenForFileSourceInvalidated = (
  handler: (detail: FileSourceInvalidatedDetail) => void,
): (() => void) => listenWindowEvent(FILE_SOURCE_INVALIDATED_EVENT, handler);
