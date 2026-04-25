export type PendingConversationSyncStrategy =
  | "skip"
  | "initial-sync"
  | "reconnect";

export type DrainedPendingConversationSync = {
  conversationId: string;
  strategy: PendingConversationSyncStrategy;
};

export type ConversationSyncCoordinatorState = {
  joinedConversationIds: Set<string>;
  subscribedConversationIds: Set<string>;
  pendingConversationSync: Map<string, PendingConversationSyncStrategy>;
  joinRetryAttempts: Map<string, number>;
};

export const createConversationSyncCoordinatorState =
  (): ConversationSyncCoordinatorState => ({
    joinedConversationIds: new Set(),
    subscribedConversationIds: new Set(),
    pendingConversationSync: new Map(),
    joinRetryAttempts: new Map(),
  });

export const registerConversationJoinIntent = (
  state: ConversationSyncCoordinatorState,
  conversationId: string,
  options?: { skipInitialDeltaSync?: boolean },
): PendingConversationSyncStrategy => {
  const strategy = options?.skipInitialDeltaSync ? "skip" : "initial-sync";
  state.joinedConversationIds.add(conversationId);
  state.subscribedConversationIds.delete(conversationId);
  state.joinRetryAttempts.set(conversationId, 0);
  state.pendingConversationSync.set(conversationId, strategy);
  return strategy;
};

export const registerReconnectConversationJoins = (
  state: ConversationSyncCoordinatorState,
  shouldResync: boolean,
): string[] => {
  const strategy: PendingConversationSyncStrategy = shouldResync
    ? "reconnect"
    : "skip";

  return Array.from(state.joinedConversationIds).map((conversationId) => {
    state.subscribedConversationIds.delete(conversationId);
    state.joinRetryAttempts.set(conversationId, 0);
    state.pendingConversationSync.set(conversationId, strategy);
    return conversationId;
  });
};

export const acknowledgeConversationJoined = (
  state: ConversationSyncCoordinatorState,
  conversationId: string,
): PendingConversationSyncStrategy | null => {
  state.subscribedConversationIds.add(conversationId);
  state.joinRetryAttempts.delete(conversationId);
  return state.pendingConversationSync.get(conversationId) ?? null;
};

export const acknowledgeConversationLeft = (
  state: ConversationSyncCoordinatorState,
  conversationId: string,
) => {
  state.subscribedConversationIds.delete(conversationId);
  state.joinRetryAttempts.delete(conversationId);
};

export const removeConversationSyncTracking = (
  state: ConversationSyncCoordinatorState,
  conversationId: string,
) => {
  state.joinedConversationIds.delete(conversationId);
  state.subscribedConversationIds.delete(conversationId);
  state.pendingConversationSync.delete(conversationId);
  state.joinRetryAttempts.delete(conversationId);
};

export const drainPendingConversationSync = (
  pendingMap: Map<string, PendingConversationSyncStrategy>,
  joinedConversationIds: Set<string>,
  targetRoomIds: string[],
): DrainedPendingConversationSync[] => {
  const conversationIdsToDrain =
    targetRoomIds.length > 0
      ? targetRoomIds.filter((conversationId) =>
          joinedConversationIds.has(conversationId),
        )
      : Array.from(pendingMap.keys());

  const drained: DrainedPendingConversationSync[] = [];
  conversationIdsToDrain.forEach((conversationId) => {
    const strategy = pendingMap.get(conversationId) ?? "initial-sync";
    pendingMap.delete(conversationId);
    drained.push({ conversationId, strategy });
  });

  return drained;
};

export const drainPendingConversationSyncForResyncRequired = (
  pendingMap: Map<string, PendingConversationSyncStrategy>,
  joinedConversationIds: Set<string>,
): DrainedPendingConversationSync[] =>
  Array.from(joinedConversationIds).map((conversationId) => {
    const pending = pendingMap.get(conversationId);
    pendingMap.delete(conversationId);

    return {
      conversationId,
      strategy:
        pending === "initial-sync" || pending === "reconnect"
          ? pending
          : "reconnect",
    };
  });
