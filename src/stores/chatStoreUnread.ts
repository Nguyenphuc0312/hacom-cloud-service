import { unwrapApiSuccess } from "../lib/apiContract";
import type { Conversation, Message } from "../types";
import { logger } from "../utils/logger";

type UnreadSummary = {
  totalUnreadCount: number;
  conversations: Array<{
    conversationId: string;
    unreadCount: number;
    lastReadSeq?: number | null;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
  }>;
};

export type MarkAsReadInput = {
  lastVisibleMessageId?: string;
  lastReadSeq?: number;
  messageId?: string;
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
  partial: Partial<TState> | ((state: TState) => Partial<TState>),
) => void;

type GetState<TState extends UnreadStateSlice> = () => TState;

type MarkAsReadRequest = {
  promise: Promise<void>;
  input: MarkAsReadInput;
  queuedInput?: MarkAsReadInput;
};

type MarkReadResponseData = {
  conversationId?: string;
  userId?: string;
  previousLastReadSeq?: number | null;
  lastReadSeq?: number | null;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  unreadCount?: number | null;
};

const toPositiveSeq = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  // BIGINT từ PG được serialize thành string ("233"). Phải coerce để optimistic
  // update advance lastReadSeq đúng và stale-read guard không bị bypass.
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const normalizeMarkAsReadInput = (
  input?: string | MarkAsReadInput,
): MarkAsReadInput | null => {
  if (typeof input === "string") {
    return input.trim().length > 0 ? { lastVisibleMessageId: input } : null;
  }
  if (!input || typeof input !== "object") {
    return null;
  }
  const lastVisibleMessageId =
    typeof input.lastVisibleMessageId === "string" &&
    input.lastVisibleMessageId.trim().length > 0
      ? input.lastVisibleMessageId
      : undefined;
  const messageId =
    typeof input.messageId === "string" && input.messageId.trim().length > 0
      ? input.messageId
      : undefined;
  const lastReadSeq = toPositiveSeq(input.lastReadSeq) ?? undefined;

  return lastVisibleMessageId || messageId || lastReadSeq
    ? {
        ...(lastVisibleMessageId ? { lastVisibleMessageId } : {}),
        ...(messageId ? { messageId } : {}),
        ...(lastReadSeq ? { lastReadSeq } : {}),
      }
    : null;
};

const getInputAnchorId = (input: MarkAsReadInput): string | undefined =>
  input.lastVisibleMessageId ?? input.messageId;

const DEFAULT_MARK_READ_DEBOUNCE_MS = 200;
const DEFAULT_UNREAD_SUMMARY_DEBOUNCE_MS = 500;
const LOCAL_STORAGE_KEY = "chat:unread:local_seq";

interface PersistedSeqState {
  byConversation: Record<string, number>;
  updatedAt: number;
}

const loadPersistedSeq = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedSeqState;
      if (parsed && typeof parsed.byConversation === "object") {
        return parsed.byConversation;
      }
    }
  } catch {
    // localStorage unavailable or corrupted — ignore
  }
  return {};
};

const persistSeq = (byConversation: Record<string, number>): void => {
  try {
    const state: PersistedSeqState = {
      byConversation,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage write failed (quota, private browsing) — ignore
  }
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
  markReadDebounceMs = DEFAULT_MARK_READ_DEBOUNCE_MS,
  unreadSummaryDebounceMs = DEFAULT_UNREAD_SUMMARY_DEBOUNCE_MS,
}: {
  set: SetState<TState>;
  get: GetState<TState>;
  emptyMessages: Message[];
  markConversationAsRead: (
    conversationId: string,
    input: MarkAsReadInput,
  ) => Promise<unknown>;
  getUnreadSummary: () => Promise<unknown>;
  compareAnchorIdsInConversation: (
    messages: Message[],
    leftAnchorId: string,
    rightAnchorId: string,
  ) => number;
  normalizeConversation: (
    conversation: Partial<Conversation>,
  ) => Conversation | null;
  buildConversationCollectionState: (
    conversations: Conversation[],
  ) => Partial<TState>;
  getConversationCursorTimestamp: (conversation: Conversation) => number;
  updateConversationReadProgress: (
    conversation: Conversation,
    lastReadMessageId?: string | null,
    readAt?: Date | string | null,
    lastReadSeq?: number | null,
  ) => Conversation;
  markReadDebounceMs?: number;
  unreadSummaryDebounceMs?: number;
}) => {
  const markAsReadInFlight = new Map<string, MarkAsReadRequest>();
  // localMarkedReadSeq: seq cuối cùng mà FE đã chủ động mark-read trong session
  // hiện tại. Dùng để chống stale-overwrite: nếu server snapshot trả về
  // unreadCount > 0 hoặc lastReadSeq < localMarkedReadSeq (do projection chưa
  // kịp catch up), FE phải giữ trạng thái local. Tránh badge nhảy lại đỏ ngay
  // sau khi user vừa đọc. Persisted to localStorage so crash/reload retains state.
  const persistedSeq = loadPersistedSeq();
  const localMarkedReadSeq = new Map<string, number>(Object.entries(persistedSeq));
  // Snapshot map: stores the conversation state BEFORE an optimistic mark-read
  // so it can be restored if the API call fails.
  const pendingRollbackSnapshot = new Map<string, Conversation>();

  // Mark-read debounce: coalesce rapid scroll-triggered mark-read calls.
  const markReadDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingMarkReadInputs = new Map<string, MarkAsReadInput>();

  // Unread summary debounce: coalesce rapid snapshot refresh calls.
  let unreadSummaryTimer: ReturnType<typeof setTimeout> | null = null;
  let unreadSummaryInFlight: Promise<void> | null = null;

  const recordLocalMarkedSeq = (conversationId: string, seq: number): void => {
    if (!conversationId || !Number.isInteger(seq) || seq <= 0) return;
    const previous = localMarkedReadSeq.get(conversationId) ?? 0;
    if (seq > previous) {
      localMarkedReadSeq.set(conversationId, seq);
      // Persist so crash/reload retains the mark-read position.
      const serialized: Record<string, number> = {};
      localMarkedReadSeq.forEach((v, k) => { serialized[k] = v; });
      persistSeq(serialized);
    }
  };
  const getLocalMarkedSeq = (conversationId: string): number =>
    localMarkedReadSeq.get(conversationId) ?? 0;
  const clearLocalMarkedSeq = (conversationId: string): void => {
    localMarkedReadSeq.delete(conversationId);
    const serialized: Record<string, number> = {};
    localMarkedReadSeq.forEach((v, k) => { serialized[k] = v; });
    persistSeq(serialized);
  };

  const applyOptimisticConversationRead = (
    conversationId: string,
    input: MarkAsReadInput,
    options?: {
      readAt?: Date | string | null;
    },
  ) => {
    if (!conversationId) return;
    const lastReadMessageId = getInputAnchorId(input);
    const lastReadSeq = toPositiveSeq(input.lastReadSeq);
    if (!lastReadMessageId && lastReadSeq === null) return;

    set((state) => {
      const currentMessages = state.messages[conversationId] || emptyMessages;
      const conversations = (
        Array.isArray(state.conversations) ? state.conversations : []
      ).map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        if (
          lastReadSeq !== null &&
          (conversation.lastReadSeq ?? 0) >= lastReadSeq
        ) {
          return conversation;
        }

        if (
          lastReadMessageId &&
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
          lastReadSeq,
        );
      });

      return {
        conversations,
        ...buildConversationCollectionState(conversations),
      };
    });
  };

  const applyServerConversationRead = (response: MarkReadResponseData) => {
    if (!response.conversationId) return;

    set((state) => {
      const conversations = (
        Array.isArray(state.conversations) ? state.conversations : []
      ).map((conversation) => {
        if (conversation.id !== response.conversationId) {
          return conversation;
        }

        const nextConversation = updateConversationReadProgress(
          conversation,
          response.lastReadMessageId,
          response.lastReadAt,
          response.lastReadSeq,
        );

        return normalizeConversation({
          ...nextConversation,
          unreadCount:
            typeof response.unreadCount === "number"
              ? response.unreadCount
              : nextConversation.unreadCount,
          ...(typeof response.unreadCount === "number" &&
          response.unreadCount <= 0
            ? {
                firstUnreadMessageId: null,
                firstUnreadMessageAt: null,
              }
            : {}),
        }) as Conversation;
      });

      return {
        conversations,
        ...buildConversationCollectionState(conversations),
      };
    });
  };

  // Debounced markAsRead entry: coalesce rapid scroll-triggered calls into one.
  // The in-flight queue below still handles the case where a debounced call
  // arrives while an existing request is pending.
  const debouncedMarkRead = (
    conversationId: string,
    input: MarkAsReadInput,
  ): Promise<void> => {
    // Cancel any pending debounced call for this conversation.
    const existingTimer = markReadDebounceTimers.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    pendingMarkReadInputs.set(conversationId, input);
    const timer = setTimeout(() => {
      markReadDebounceTimers.delete(conversationId);
      const pendingInput = pendingMarkReadInputs.get(conversationId);
      pendingMarkReadInputs.delete(conversationId);
      if (pendingInput) {
        void flushMarkAsRead(conversationId, pendingInput);
      }
    }, markReadDebounceMs);
    markReadDebounceTimers.set(conversationId, timer);
    return Promise.resolve();
  };

  const flushMarkAsRead = async (
    conversationId: string,
    normalizedInput: MarkAsReadInput,
  ): Promise<void> => {
    const anchorId = getInputAnchorId(normalizedInput);
    const lastReadSeq = toPositiveSeq(normalizedInput.lastReadSeq);

    if (anchorId?.startsWith("temp-") && lastReadSeq === null) {
      return Promise.resolve();
    }

    const currentConversation = get().conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    const currentSeq = Math.max(
      currentConversation?.lastReadSeq ?? 0,
      getLocalMarkedSeq(conversationId),
    );
    // Seq là authoritative khi được cung cấp. Nếu seq đã >= incoming, skip.
    if (lastReadSeq !== null && currentSeq >= lastReadSeq) {
      logger.debug("chat-unread", "markRead.skipped", {
        conversationId,
        reason: "seq-already-advanced",
        currentSeq,
        incomingSeq: lastReadSeq,
      });
      return Promise.resolve();
    }
    // Anchor-id comparator chỉ được dùng khi KHÔNG có seq explicit. Seq là
    // truth duy nhất — comparator dựa trên messages list local hay rơi vào
    // localeCompare khi anchor mới chưa load, gây false-positive skip và làm
    // POST mark-read không bao giờ được gọi (lỗi production: GET messages
    // tới seq 243 nhưng FE không POST /messages/read 243 vì comparator
    // báo current >= next).
    if (
      lastReadSeq === null &&
      anchorId &&
      currentConversation?.lastReadMessageId &&
      compareAnchorIdsInConversation(
        get().messages[conversationId] || emptyMessages,
        currentConversation.lastReadMessageId,
        anchorId,
      ) >= 0
    ) {
      logger.debug("chat-unread", "markRead.skipped", {
        conversationId,
        reason: "anchor-already-advanced",
        currentAnchor: currentConversation.lastReadMessageId,
        incomingAnchor: anchorId,
      });
      return Promise.resolve();
    }

    const existingRequest = markAsReadInFlight.get(conversationId);
    if (existingRequest) {
      const queuedInput = existingRequest.queuedInput ?? existingRequest.input;
      const queuedSeq = toPositiveSeq(queuedInput.lastReadSeq);
      const incomingSeq = toPositiveSeq(normalizedInput.lastReadSeq);
      const queuedAnchorId = getInputAnchorId(queuedInput);

      const shouldQueueBySeq =
        incomingSeq !== null && (queuedSeq === null || incomingSeq > queuedSeq);
      const shouldQueueByAnchor =
        !shouldQueueBySeq &&
        anchorId &&
        queuedAnchorId &&
        compareAnchorIdsInConversation(
          get().messages[conversationId] || emptyMessages,
          queuedAnchorId,
          anchorId,
        ) < 0;

      if (
        shouldQueueBySeq ||
        shouldQueueByAnchor ||
        (!queuedAnchorId && anchorId)
      ) {
        existingRequest.queuedInput = normalizedInput;
      }
      return existingRequest.promise;
    }

    const runMarkAsRead = async (
      requestInput: MarkAsReadInput,
    ): Promise<void> => {
      // Capture snapshot BEFORE applying optimistic update so we can restore
      // exactly the authoritative server state if the API call fails.
      const snapshotConversation = get().conversations.find(
        (c) => c.id === conversationId,
      ) ?? null;
      if (snapshotConversation) {
        pendingRollbackSnapshot.set(conversationId, { ...snapshotConversation });
      }

      applyOptimisticConversationRead(conversationId, requestInput);
      const optimisticSeq = toPositiveSeq(requestInput.lastReadSeq);
      if (optimisticSeq !== null) {
        recordLocalMarkedSeq(conversationId, optimisticSeq);
      }
      logger.debug("chat-unread", "markRead.request", {
        conversationId,
        lastReadSeq: optimisticSeq,
        anchorId: getInputAnchorId(requestInput) ?? null,
      });
      const request = markConversationAsRead(conversationId, requestInput).then(
        (response) => {
          if (response && typeof response === "object") {
            const data = response as MarkReadResponseData;
            const ackSeq = toPositiveSeq(data.lastReadSeq);
            if (ackSeq !== null) {
              recordLocalMarkedSeq(conversationId, ackSeq);
            }
            logger.debug("chat-unread", "markRead.success", {
              conversationId,
              lastReadSeq: ackSeq,
              unreadCount: data.unreadCount ?? null,
            });
            applyServerConversationRead(data);
          }
          return undefined;
        },
        (error: unknown) => {
          logger.debug("chat-unread", "markRead.failed", {
            conversationId,
            lastReadSeq: optimisticSeq,
            error: error instanceof Error ? error.message : String(error),
          });
          // Rollback: restore the pre-optimistic conversation state.
          // This ensures the UI shows the authoritative server state rather than
          // a false "read" that never persisted. After rollback, a refetch of
          // the unread summary will correct any remaining drift.
          clearLocalMarkedSeq(conversationId);
          const snapshot = pendingRollbackSnapshot.get(conversationId);
          if (snapshot) {
            set((state) => {
              const conversations = state.conversations.map((c) =>
                c.id === conversationId
                  ? (normalizeConversation(snapshot) ?? c)
                  : c,
              );
              return {
                conversations,
                ...buildConversationCollectionState(conversations),
              };
            });
            pendingRollbackSnapshot.delete(conversationId);
          }
          throw error;
        },
      );
      markAsReadInFlight.set(conversationId, {
        promise: request,
        input: requestInput,
      });

      try {
        await request;
      } finally {
        const pending = markAsReadInFlight.get(conversationId);
        const queuedInput = pending?.queuedInput;
        markAsReadInFlight.delete(conversationId);

        if (queuedInput && queuedInput !== requestInput) {
          await runMarkAsRead(queuedInput);
        }
      }
    };

    return runMarkAsRead(normalizedInput);
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
      const conversations = (
        Array.isArray(state.conversations) ? state.conversations : []
      ).map((conversation) => {
        const unreadSnapshot = summaryByConversationId.get(conversation.id);
        const summaryWasUpdatedAfterRequest =
          requestedAtMs > 0 &&
          getConversationCursorTimestamp(conversation) > requestedAtMs;
        if (summaryWasUpdatedAfterRequest) {
          return conversation;
        }

        // Stale-overwrite guard: nếu FE đã chủ động mark-read tới seq X mà
        // snapshot trả về unreadCount > 0 hoặc lastReadSeq < X, projection
        // backend chưa kịp catch up — không cho phép ghi đè badge về đỏ.
        const localSeq = getLocalMarkedSeq(conversation.id);
        const snapshotSeq =
          typeof unreadSnapshot?.lastReadSeq === "number"
            ? unreadSnapshot.lastReadSeq
            : 0;
        if (localSeq > 0 && snapshotSeq < localSeq) {
          logger.debug("chat-unread", "conversationList.preventStaleUnread", {
            conversationId: conversation.id,
            localSeq,
            snapshotSeq,
            snapshotUnread: unreadSnapshot?.unreadCount ?? null,
          });
          return normalizeConversation({
            ...conversation,
            unreadCount: 0,
            lastReadSeq: localSeq,
            firstUnreadMessageId: null,
            firstUnreadMessageAt: null,
          }) as Conversation;
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
          ...(typeof unreadSnapshot.lastReadSeq === "number"
            ? { lastReadSeq: unreadSnapshot.lastReadSeq }
            : {}),
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

  // Debounced entry point that coalesces rapid scroll-triggered mark-read calls.
  const markAsRead = (conversationId: string, input?: string | MarkAsReadInput): Promise<void> => {
    const normalizedInput = normalizeMarkAsReadInput(input);
    if (!normalizedInput) {
      return Promise.resolve();
    }
    return debouncedMarkRead(conversationId, normalizedInput);
  };

  // Debounced unread summary refresh. Coalesces concurrent callers into one API call
  // within the debounce window.
  let unreadSummaryTimer: ReturnType<typeof setTimeout> | null = null;
  let unreadSummaryInFlight: Promise<void> | null = null;
  const refreshUnreadSummarySnapshot = (): Promise<void> => {
    if (unreadSummaryInFlight) {
      return unreadSummaryInFlight;
    }
    if (unreadSummaryTimer) {
      return Promise.resolve();
    }
    unreadSummaryTimer = setTimeout(() => {
      unreadSummaryTimer = null;
      const p = (async () => {
        const requestedAtMs = Date.now();
        const response = await getUnreadSummary();
        applyUnreadSummary(unwrapApiSuccess(response as never) as UnreadSummary, {
          requestedAtMs,
          appliedAtMs: Date.now(),
          source: "snapshot",
        });
      })().finally(() => {
        if (unreadSummaryInFlight === p) {
          unreadSummaryInFlight = null;
        }
      });
      unreadSummaryInFlight = p;
    }, unreadSummaryDebounceMs);
    return Promise.resolve();
  };

  return {
    markAsRead,
    applyUnreadSummary,
    refreshUnreadSummarySnapshot,
    applyOptimisticConversationRead,
    reset() {
      markAsReadInFlight.clear();
      pendingRollbackSnapshot.clear();
      markReadDebounceTimers.forEach((t) => clearTimeout(t));
      markReadDebounceTimers.clear();
      pendingMarkReadInputs.clear();
      if (unreadSummaryTimer) {
        clearTimeout(unreadSummaryTimer);
        unreadSummaryTimer = null;
      }
      unreadSummaryInFlight = null;
    },
  };
};
