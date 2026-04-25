import { unwrapApiSuccess } from "../lib/apiContract";
import type { Conversation, Message } from "../types";

type UnreadSummary = {
  totalUnreadCount: number;
  conversations: Array<{
    conversationId: string;
    unreadCount: number;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
  }>;
};

type ApplyUnreadSummaryOptions = {
  requestedAtMs?: number;
  appliedAtMs?: number;
  source?: "snapshot" | "cross_tab";
};

type UnreadStateSlice = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  lastUnreadSummaryAppliedAt: number | null;
};

type SetState<TState extends UnreadStateSlice> = (
  partial:
    | Partial<TState>
    | ((state: TState) => Partial<TState>),
) => void;

type GetState<TState extends UnreadStateSlice> = () => TState;

type MarkAsReadRequest = {
  promise: Promise<void>;
  anchorId: string;
  queuedAnchorId?: string;
};

export const createChatUnreadController = <TState extends UnreadStateSlice>({
  set,
  get,
  emptyMessages,
  markConversationAsRead,
  getUnreadSummary,
  compareAnchorIdsInConversation,
  normalizeConversation,
  buildConversationCollectionState,
  getConversationCursorTimestamp,
  updateConversationReadProgress,
}: {
  set: SetState<TState>;
  get: GetState<TState>;
  emptyMessages: Message[];
  markConversationAsRead: (
    conversationId: string,
    anchorId: string,
  ) => Promise<unknown>;
  getUnreadSummary: () => Promise<unknown>;
  compareAnchorIdsInConversation: (
    messages: Message[],
    leftAnchorId: string,
    rightAnchorId: string,
  ) => number;
  normalizeConversation: (conversation: Partial<Conversation>) => Conversation | null;
  buildConversationCollectionState: (
    conversations: Conversation[],
  ) => Partial<TState>;
  getConversationCursorTimestamp: (conversation: Conversation) => number;
  updateConversationReadProgress: (
    conversation: Conversation,
    lastReadMessageId: string,
    readAt?: Date | string | null,
  ) => Conversation;
}) => {
  const markAsReadInFlight = new Map<string, MarkAsReadRequest>();

  const applyOptimisticConversationRead = (
    conversationId: string,
    lastReadMessageId: string,
    options?: {
      readAt?: Date | string | null;
    },
  ) => {
    if (!conversationId || !lastReadMessageId) return;

    set((state) => {
      const currentMessages = state.messages[conversationId] || emptyMessages;
      const conversations = (Array.isArray(state.conversations)
        ? state.conversations
        : []
      ).map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        if (
          conversation.lastReadMessageId &&
          compareAnchorIdsInConversation(
            currentMessages,
            conversation.lastReadMessageId,
            lastReadMessageId,
          ) >= 0
        ) {
          return conversation;
        }

        return updateConversationReadProgress(
          conversation,
          lastReadMessageId,
          options?.readAt,
        );
      });

      return {
        conversations,
        ...buildConversationCollectionState(conversations),
      };
    });
  };

  const markAsRead = async (
    conversationId: string,
    lastVisibleMessageId?: string,
  ): Promise<void> => {
    if (!lastVisibleMessageId || lastVisibleMessageId.startsWith("temp-")) {
      return Promise.resolve();
    }

    const currentConversation = get().conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    if (
      currentConversation?.lastReadMessageId &&
      compareAnchorIdsInConversation(
        get().messages[conversationId] || emptyMessages,
        currentConversation.lastReadMessageId,
        lastVisibleMessageId,
      ) >= 0
    ) {
      return Promise.resolve();
    }

    const existingRequest = markAsReadInFlight.get(conversationId);
    if (existingRequest) {
      const compareQueuedAnchor = compareAnchorIdsInConversation(
        get().messages[conversationId] || emptyMessages,
        existingRequest.queuedAnchorId ?? existingRequest.anchorId,
        lastVisibleMessageId,
      );
      if (compareQueuedAnchor < 0) {
        existingRequest.queuedAnchorId = lastVisibleMessageId;
      }
      return existingRequest.promise;
    }

    const runMarkAsRead = async (anchorId: string): Promise<void> => {
      applyOptimisticConversationRead(conversationId, anchorId);
      const request = markConversationAsRead(conversationId, anchorId).then(
        () => undefined,
      );
      markAsReadInFlight.set(conversationId, {
        promise: request,
        anchorId,
      });

      try {
        await request;
      } finally {
        const pending = markAsReadInFlight.get(conversationId);
        const queuedAnchorId = pending?.queuedAnchorId;
        markAsReadInFlight.delete(conversationId);

        if (queuedAnchorId && queuedAnchorId !== anchorId) {
          await runMarkAsRead(queuedAnchorId);
        }
      }
    };

    return runMarkAsRead(lastVisibleMessageId);
  };

  const applyUnreadSummary = (
    summary: UnreadSummary,
    options?: ApplyUnreadSummaryOptions,
  ) => {
    const summaryByConversationId = new Map(
      (summary.conversations || []).map((item) => [item.conversationId, item]),
    );
    const requestedAtMs =
      typeof options?.requestedAtMs === "number" &&
      Number.isFinite(options.requestedAtMs)
        ? options.requestedAtMs
        : 0;
    const appliedAtMs =
      typeof options?.appliedAtMs === "number" &&
      Number.isFinite(options.appliedAtMs)
        ? options.appliedAtMs
        : Date.now();

    set((state) => {
      const conversations = (Array.isArray(state.conversations)
        ? state.conversations
        : []
      ).map((conversation) => {
        const unreadSnapshot = summaryByConversationId.get(conversation.id);
        const summaryWasUpdatedAfterRequest =
          requestedAtMs > 0 &&
          getConversationCursorTimestamp(conversation) > requestedAtMs;
        if (summaryWasUpdatedAfterRequest) {
          return conversation;
        }

        if (!unreadSnapshot) {
          return normalizeConversation({
            ...conversation,
            unreadCount: 0,
            firstUnreadMessageId: null,
            firstUnreadMessageAt: null,
          }) as Conversation;
        }

        return normalizeConversation({
          ...conversation,
          unreadCount: unreadSnapshot.unreadCount,
          lastReadMessageId: unreadSnapshot.lastReadMessageId,
          lastReadAt: unreadSnapshot.lastReadAt,
          ...(unreadSnapshot.unreadCount > 0
            ? {}
            : {
                firstUnreadMessageId: null,
                firstUnreadMessageAt: null,
              }),
        }) as Conversation;
      });

      return {
        conversations,
        lastUnreadSummaryAppliedAt: appliedAtMs,
        ...buildConversationCollectionState(conversations),
      };
    });
  };

  const refreshUnreadSummarySnapshot = async (): Promise<void> => {
    const requestedAtMs = Date.now();
    const response = await getUnreadSummary();
    applyUnreadSummary(unwrapApiSuccess(response as never) as UnreadSummary, {
      requestedAtMs,
      appliedAtMs: Date.now(),
      source: "snapshot",
    });
  };

  return {
    markAsRead,
    applyUnreadSummary,
    refreshUnreadSummarySnapshot,
    applyOptimisticConversationRead,
    reset() {
      markAsReadInFlight.clear();
    },
  };
};
