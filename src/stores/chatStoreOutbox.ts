import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { logMessageDebug } from "../utils/messageDebug";
import i18n from "../i18n";
import type { Attachment, Message, SendMessageResult, SendRestriction } from "../types";
import { MessageStatus } from "../types";

type OutboxStateSlice = {
  outboxByConversation: Record<string, string[]>;
  sendRestrictionsByConversation: Record<string, SendRestriction | undefined>;
  messages: Record<string, Message[]>;
};

type SetState<TState extends OutboxStateSlice> = (
  partial:
    | Partial<TState>
    | ((state: TState) => Partial<TState>),
) => void;

type GetState<TState extends OutboxStateSlice> = () => TState;

type OutboxConversationStatePatch<TState extends OutboxStateSlice> = Pick<
  TState,
  "outboxByConversation" | "sendRestrictionsByConversation"
>;

type AttachmentPayload = {
  id: string;
  type: string;
  objectKey?: string;
  url?: string;
  downloadUrl?: string;
  expiresAt?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
};

const MESSAGE_SEND_TIMEOUT_MS = 25_000;

export const createChatOutboxController = <TState extends OutboxStateSlice>({
  set,
  get,
  emptyMessages,
  sendMessageRequest,
  normalizeMessage,
  resolveSendFailureDescriptor,
  getMessageQueueKey,
  getCorrelationKeyForMessage,
  getReplyToId,
  toAttachmentPayload,
  resolveSenderIdentity,
  resolveConnectionSendMode,
  updateMessage,
  ackOutgoingMessage,
  failOutgoingMessage,
}: {
  set: SetState<TState>;
  get: GetState<TState>;
  emptyMessages: Message[];
  sendMessageRequest: (
    conversationId: string,
    payload: {
      content: string;
      type?: Message["type"];
      senderName?: string;
      clientMessageId?: string;
      tempId?: string;
      localId?: string;
      senderAvatar?: string;
      replyToId?: string;
      attachments?: AttachmentPayload[];
    },
  ) => Promise<unknown>;
  normalizeMessage: (message: unknown, conversationId: string) => Message | null;
  resolveSendFailureDescriptor: (
    error: unknown,
    apiError: ReturnType<typeof extractApiError>,
  ) => {
    failureReason: NonNullable<Message["failureReason"]>;
    errorCode: string;
    errorMessage: string;
  };
  getMessageQueueKey: (
    conversationId: string,
    message: Pick<Message, "id" | "localId" | "clientMessageId" | "stableId">,
  ) => string;
  getCorrelationKeyForMessage: (message: Message) => string;
  getReplyToId: (replyTo: Message["replyTo"]) => string | undefined;
  toAttachmentPayload: (attachments?: Attachment[]) => AttachmentPayload[] | undefined;
  resolveSenderIdentity: () => {
    id: string | null;
    senderName: string;
    senderAvatar?: string;
  };
  resolveConnectionSendMode: () => "online" | "reconnecting" | "offline";
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  ackOutgoingMessage: (
    conversationId: string,
    clientMessageId: string,
    serverMessage: Message,
  ) => void;
  failOutgoingMessage: (
    conversationId: string,
    clientMessageId: string,
    updates: Partial<Message>,
  ) => void;
}) => {
  const pendingMessageSendTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  const clearMessageSendTimeout = (queueKey: string): void => {
    const timer = pendingMessageSendTimeouts.get(queueKey);
    if (!timer) return;
    clearTimeout(timer);
    pendingMessageSendTimeouts.delete(queueKey);
  };

  const clearAllMessageSendTimeouts = (): void => {
    pendingMessageSendTimeouts.forEach((timer) => clearTimeout(timer));
    pendingMessageSendTimeouts.clear();
  };

  const findMessageByQueueKey = (
    messages: Message[],
    queueKey: string,
  ): Message | undefined =>
    messages.find(
      (message) =>
        getMessageQueueKey(message.conversationId, message) === queueKey,
    );

  const setSendRestriction = (
    conversationId: string,
    restriction: SendRestriction,
  ): void => {
    if (!conversationId) return;
    set((state) => ({
      sendRestrictionsByConversation: {
        ...state.sendRestrictionsByConversation,
        [conversationId]: restriction,
      },
    }) as Partial<TState>);
  };

  const clearSendRestriction = (conversationId: string): void => {
    if (!conversationId) return;
    set((state) => {
      if (!(conversationId in state.sendRestrictionsByConversation)) {
        return state;
      }

      const nextRestrictions = { ...state.sendRestrictionsByConversation };
      delete nextRestrictions[conversationId];
      return {
        sendRestrictionsByConversation: nextRestrictions,
      } as Partial<TState>;
    });
  };

  const dequeueOutboxMessage = (
    conversationId: string,
    queueKey: string,
  ): void => {
    if (!conversationId || !queueKey) return;
    set((state) => {
      const current = state.outboxByConversation[conversationId] || [];
      if (current.length === 0 || !current.includes(queueKey)) {
        return state;
      }

      const nextMessages = current.filter((item) => item !== queueKey);
      const nextOutbox = { ...state.outboxByConversation };
      if (nextMessages.length > 0) {
        nextOutbox[conversationId] = nextMessages;
      } else {
        delete nextOutbox[conversationId];
      }

      return {
        outboxByConversation: nextOutbox,
      } as Partial<TState>;
    });
  };

  const scheduleSendTimeout = (
    conversationId: string,
    queueKey: string,
  ): void => {
    clearMessageSendTimeout(queueKey);
    pendingMessageSendTimeouts.set(
      queueKey,
      setTimeout(() => {
        pendingMessageSendTimeouts.delete(queueKey);
        const currentMessage = findMessageByQueueKey(
          get().messages[conversationId] || emptyMessages,
          queueKey,
        );
        if (
          !currentMessage ||
          (currentMessage.sendState !== "sending" &&
            currentMessage.sendState !== "retrying")
        ) {
          return;
        }

        failOutgoingMessage(
          conversationId,
          currentMessage.clientMessageId ||
            currentMessage.stableId ||
            currentMessage.localId ||
            currentMessage.id,
          {
            sendState: "failed",
            status: MessageStatus.FAILED,
            queuedReason: undefined,
            failureReason: "timeout",
            errorCode: "REQUEST_TIMEOUT",
            errorMessage: i18n.t("chat:message.status.timeoutError", {
              defaultValue: "Message timed out. Please retry.",
            }),
          },
        );
      }, MESSAGE_SEND_TIMEOUT_MS),
    );
  };

  const queueExistingMessage = (
    conversationId: string,
    message: Message,
    queuedReason: NonNullable<Message["queuedReason"]>,
  ): SendMessageResult => {
    const queueKey = getMessageQueueKey(conversationId, message);

    clearMessageSendTimeout(queueKey);
    set((state) => {
      const current = state.outboxByConversation[conversationId] || [];
      if (current.includes(queueKey)) {
        return state;
      }

      return {
        outboxByConversation: {
          ...state.outboxByConversation,
          [conversationId]: [...current, queueKey],
        },
      } as Partial<TState>;
    });
    updateMessage(conversationId, message.id, {
      sendState: "queued",
      status: MessageStatus.SENDING,
      queuedReason,
      failureReason: undefined,
      errorCode: undefined,
      errorMessage: undefined,
    });

    logMessageDebug("chatStore", "send_request_queued", {
      conversationId,
      queueKey,
      correlationKey: getCorrelationKeyForMessage(message),
      queuedReason,
      connectionMode: resolveConnectionSendMode(),
    });

    return {
      disposition: "queued",
      messageId:
        message.clientMessageId ||
        message.stableId ||
        message.localId ||
        message.id,
    };
  };

  const dispatchExistingMessage = async (
    conversationId: string,
    message: Message,
    attemptState: "sending" | "retrying",
  ): Promise<SendMessageResult> => {
    const replyToId = getReplyToId(message.replyTo);
    const attachments = toAttachmentPayload(message.attachments);
    const sender = resolveSenderIdentity();
    const senderName = message.senderName?.trim() || sender.senderName;
    const senderAvatar = message.senderAvatar || sender.senderAvatar;
    const queueKey = getMessageQueueKey(conversationId, message);
    const nextAttemptCount = (message.sendAttempts ?? 0) + 1;
    const attemptedAt = new Date();

    logMessageDebug("chatStore", "send_request_started", {
      conversationId,
      queueKey,
      correlationKey: getCorrelationKeyForMessage(message),
      attemptState,
      messageId: message.id,
      localId: message.localId,
      clientMessageId: message.clientMessageId,
      stableId: message.stableId,
      contentLength: message.content.length,
      contentPreview: message.content.slice(0, 120),
      type: message.type,
      attachmentCount: attachments?.length ?? 0,
      replyToId,
      connectionMode: resolveConnectionSendMode(),
    });

    dequeueOutboxMessage(conversationId, queueKey);
    updateMessage(conversationId, message.id, {
      sendState: attemptState,
      status: MessageStatus.SENDING,
      queuedReason: undefined,
      failureReason: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      sendAttempts: nextAttemptCount,
      lastSendAttemptAt: attemptedAt,
    });
    scheduleSendTimeout(conversationId, queueKey);

    try {
      const response = await sendMessageRequest(conversationId, {
        content: message.content,
        type: message.type,
        senderName,
        clientMessageId:
          message.clientMessageId || message.stableId || message.localId,
        tempId: message.localId || message.id,
        localId: message.localId || message.id,
        ...(senderAvatar ? { senderAvatar } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(attachments?.length ? { attachments } : {}),
      });
      clearMessageSendTimeout(queueKey);

      const sentMessage = normalizeMessage(
        unwrapApiSuccess(response as never),
        conversationId,
      );
      if (!sentMessage) {
        throw new Error(i18n.t("error:chat.invalidSendResponse"));
      }

      clearSendRestriction(conversationId);
      ackOutgoingMessage(conversationId, message.clientMessageId || "", {
        ...sentMessage,
        stableId:
          message.stableId ||
          message.clientMessageId ||
          message.localId ||
          message.id,
        clientMessageId:
          message.clientMessageId || message.localId || message.id,
        localId: message.localId || message.id,
        localOrder: message.localOrder,
        transportStatus:
          sentMessage.serverSeq !== undefined
            ? "synced_stream"
            : "acked_transport",
        sendState: "sent",
        sendAttempts: nextAttemptCount,
        lastSendAttemptAt: attemptedAt,
        queuedReason: undefined,
        failureReason: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        status: sentMessage.status || MessageStatus.SENT,
      });
      logMessageDebug("chatStore", "send_request_succeeded", {
        conversationId,
        queueKey,
        correlationKey: getCorrelationKeyForMessage(message),
        tempMessageId: message.id,
        sentMessageId: sentMessage.id,
        responseClientMessageId: sentMessage.clientMessageId,
        responseLocalId: sentMessage.localId,
        responseContentPreview: sentMessage.content.slice(0, 120),
        serverSeq: sentMessage.serverSeq,
      });

      return {
        disposition: "sent",
        messageId: sentMessage.id,
      };
    } catch (error) {
      clearMessageSendTimeout(queueKey);
      const apiError = extractApiError(error);
      const errorCode = String(apiError.code || "").toUpperCase();

      if (errorCode === "SLOW_MODE_ACTIVE") {
        failOutgoingMessage(
          conversationId,
          message.clientMessageId ||
            message.stableId ||
            message.localId ||
            message.id,
          {
            sendState: "failed",
            status: MessageStatus.FAILED,
            failureReason: "slow_mode",
            errorCode,
            errorMessage: i18n.t("chat:message.status.slowModeError", {
              defaultValue: "Slow mode is active. Please wait and retry.",
            }),
          },
        );
        logMessageDebug("chatStore", "send_request_failed", {
          conversationId,
          queueKey,
          correlationKey: getCorrelationKeyForMessage(message),
          messageId: message.id,
          errorCode,
          failureReason: "slow_mode",
          errorMessage: apiError.message || "slow_mode_active",
        });
        throw error;
      }

      if (
        errorCode === "FORBIDDEN" ||
        errorCode === "PERMISSION_DENIED" ||
        errorCode === "ROOM_INSUFFICIENT_PERMISSIONS" ||
        errorCode === "USER_BLOCKED" ||
        errorCode === "AUTH_FORBIDDEN"
      ) {
        setSendRestriction(conversationId, {
          code: errorCode,
          reason: apiError.message || i18n.t("chat:composer.permissionDenied"),
          kind: "permission",
        });
        failOutgoingMessage(
          conversationId,
          message.clientMessageId ||
            message.stableId ||
            message.localId ||
            message.id,
          {
            sendState: "failed",
            status: MessageStatus.FAILED,
            failureReason: "permission",
            errorCode,
            errorMessage: i18n.t("chat:composer.permissionDenied", {
              defaultValue:
                "You can no longer send messages in this conversation.",
            }),
          },
        );
        logMessageDebug("chatStore", "send_request_failed", {
          conversationId,
          queueKey,
          correlationKey: getCorrelationKeyForMessage(message),
          messageId: message.id,
          errorCode,
          failureReason: "permission",
          errorMessage: apiError.message || "permission_denied",
        });
        throw error;
      }

      const descriptor = resolveSendFailureDescriptor(error, apiError);
      failOutgoingMessage(
        conversationId,
        message.clientMessageId ||
          message.stableId ||
          message.localId ||
          message.id,
        {
          sendState: "failed",
          status: MessageStatus.FAILED,
          queuedReason: undefined,
          failureReason: descriptor.failureReason,
          errorCode: descriptor.errorCode,
          errorMessage: descriptor.errorMessage,
        },
      );
      logMessageDebug("chatStore", "send_request_failed", {
        conversationId,
        queueKey,
        correlationKey: getCorrelationKeyForMessage(message),
        messageId: message.id,
        errorCode,
        failureReason: descriptor.failureReason,
        userErrorCode: descriptor.errorCode,
        errorMessage: apiError.message || "send_failed",
      });
      throw error;
    }
  };

  const flushQueuedMessages = async (conversationId?: string): Promise<void> => {
    const conversationIds = conversationId
      ? [conversationId]
      : Object.keys(get().outboxByConversation);

    logMessageDebug("chatStore", "offline_queue_flush_started", {
      conversationIds,
      connectionMode: resolveConnectionSendMode(),
    });

    for (const currentConversationId of conversationIds) {
      const queueKeys = [...(get().outboxByConversation[currentConversationId] || [])];
      const queuedMessages = queueKeys
        .map((queueKey) =>
          findMessageByQueueKey(
            get().messages[currentConversationId] || emptyMessages,
            queueKey,
          ),
        )
        .filter((item): item is Message => item !== undefined)
        .filter((item) => item.sendState === "queued")
        .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0));

      logMessageDebug("chatStore", "offline_queue_flush_conversation", {
        conversationId: currentConversationId,
        queueKeyCount: queueKeys.length,
        queuedMessageCount: queuedMessages.length,
      });

      for (const queuedMessage of queuedMessages) {
        try {
          await dispatchExistingMessage(
            currentConversationId,
            queuedMessage,
            queuedMessage.sendAttempts && queuedMessage.sendAttempts > 0
              ? "retrying"
              : "sending",
          );
        } catch {
          // Best effort flush. Terminal errors are reflected on the message row.
        }
      }
    }

    logMessageDebug("chatStore", "offline_queue_flushed", {
      conversationIds,
      connectionMode: resolveConnectionSendMode(),
    });
  };

  const clearMessageTracking = (
    conversationId: string,
    message: Pick<Message, "conversationId" | "id" | "localId" | "clientMessageId" | "stableId"> | null | undefined,
  ): void => {
    if (!conversationId || !message) return;
    const queueKey = getMessageQueueKey(conversationId, message);
    clearMessageSendTimeout(queueKey);
    dequeueOutboxMessage(conversationId, queueKey);
  };

  const clearConversationTracking = (conversationId: string): void => {
    Array.from(pendingMessageSendTimeouts.keys())
      .filter((key) => key.startsWith(`${conversationId}:`))
      .forEach(clearMessageSendTimeout);
  };

  const buildConversationCleanupState = (
    state: TState,
    conversationId: string,
  ): OutboxConversationStatePatch<TState> => ({
    outboxByConversation: Object.fromEntries(
      Object.entries(state.outboxByConversation).filter(
        ([key]) => key !== conversationId,
      ),
    ) as TState["outboxByConversation"],
    sendRestrictionsByConversation: Object.fromEntries(
      Object.entries(state.sendRestrictionsByConversation).filter(
        ([key]) => key !== conversationId,
      ),
    ) as TState["sendRestrictionsByConversation"],
  });

  return {
    setSendRestriction,
    clearSendRestriction,
    clearMessageTracking,
    clearConversationTracking,
    buildConversationCleanupState,
    dispatchExistingMessage,
    flushQueuedMessages,
    queueExistingMessage,
    reset() {
      clearAllMessageSendTimeouts();
    },
  };
};
