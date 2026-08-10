import React from "react";
import {
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  type GetMessagesArgs,
} from "../../api/chatApi";
import { getMessageSeq } from "../domain/messageMerge";
import type { Message } from "../../../types";
import { markChatPerformance } from "../../../utils/chatPerformance";
import { logScrollTrace } from "../../../utils/scrollTrace";
import { markImagePerformanceMilestone } from "../../../utils/imagePerformanceTelemetry";

const INITIAL_MESSAGES_LIMIT = 50;
const OLDER_MESSAGES_LIMIT = 50;
const EMPTY_MESSAGES: Message[] = [];

const resolveErrorMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
};

export interface UseConversationMessagesRTKResult {
  messages: Message[];
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  isInitialLoading: boolean;
  isFetching: boolean;
  isLoadingOlder: boolean;
  hasLoaded: boolean;
  errorMessage: string | null;
  loadOlder: () => Promise<void>;
  retryInitial: () => Promise<void>;
}

export const useConversationMessagesRTK = (
  conversationId: string,
): UseConversationMessagesRTKResult => {
  const skip = conversationId.length === 0;
  const fetchTraceActiveRef = React.useRef(false);
  const initialArg = React.useMemo<GetMessagesArgs>(
    () => ({
      conversationId,
      limit: INITIAL_MESSAGES_LIMIT,
    }),
    [conversationId],
  );

  const query = useGetMessagesQuery(initialArg, {
    skip,
    // Phase 1 optimization: Disable eager refetch on mount.
    // Cache is kept across conversation switches (RTK Query deduplicates by arg).
    // New messages arrive via WebSocket + optimistic update — no full refetch needed.
    // Reconnect still triggers refetch via refetchOnReconnect to sync state.
    refetchOnMountOrArgChange: false,
    refetchOnReconnect: true,
    selectFromResult: ({
      data,
      error,
      isError,
      isFetching,
      isLoading,
      isUninitialized,
    }) => ({
      messages: data?.messages ?? EMPTY_MESSAGES,
      hasMoreOlder: data?.hasMoreOlder ?? false,
      hasMoreNewer: data?.hasMoreNewer ?? false,
      oldestLoadedMessageId: data?.oldestLoadedMessageId ?? null,
      oldestLoadedSeq: data?.oldestLoadedSeq ?? null,
      error,
      isError,
      isFetching,
      isLoading,
      isUninitialized,
    }),
  });
  const [triggerGetMessages, loadOlderResult] = useLazyGetMessagesQuery();

  React.useEffect(() => {
    const latestMessage = query.messages[query.messages.length - 1];
    const details = {
      conversationId,
      messageCount: query.messages.length,
      lastMessageId: latestMessage?.id ?? null,
      lastSeq: getMessageSeq(latestMessage),
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      distanceToBottom: null,
      virtualItemsCount: 0,
      reason: "rtkq-getMessages",
      hasMoreOlder: query.hasMoreOlder,
      hasMoreNewer: query.hasMoreNewer,
    };

    if (!skip && query.isFetching && !fetchTraceActiveRef.current) {
      fetchTraceActiveRef.current = true;
      logScrollTrace("messages_fetch_start", details);
      return;
    }

    if (fetchTraceActiveRef.current && (!query.isFetching || skip)) {
      fetchTraceActiveRef.current = false;
      logScrollTrace("messages_fetch_end", {
        ...details,
        isError: query.isError,
      });
    }
  }, [
    conversationId,
    query.hasMoreNewer,
    query.hasMoreOlder,
    query.isError,
    query.isFetching,
    query.messages,
    skip,
  ]);

  const loadOlder = React.useCallback(async () => {
    if (
      skip ||
      query.messages.length === 0 ||
      !query.hasMoreOlder ||
      loadOlderResult.isFetching
    ) {
      return;
    }

    const cursor =
      typeof query.oldestLoadedSeq === "number"
        ? { beforeSeq: query.oldestLoadedSeq }
        : query.oldestLoadedMessageId
          ? { beforeId: query.oldestLoadedMessageId }
          : null;

    if (!cursor) {
      return;
    }

    markChatPerformance("load-older-start", conversationId, {
      source: "rtkq",
      oldestLoadedMessageId: query.oldestLoadedMessageId,
      oldestLoadedSeq: query.oldestLoadedSeq,
    });

    await triggerGetMessages(
      {
        conversationId,
        limit: OLDER_MESSAGES_LIMIT,
        ...cursor,
      },
      false,
    ).unwrap();
  }, [
    conversationId,
    loadOlderResult.isFetching,
    query.hasMoreOlder,
    query.messages.length,
    query.oldestLoadedMessageId,
    query.oldestLoadedSeq,
    skip,
    triggerGetMessages,
  ]);

  const retryInitial = React.useCallback(async () => {
    if (skip) return;
    await triggerGetMessages(initialArg, false).unwrap();
  }, [initialArg, skip, triggerGetMessages]);

  const isInitialLoading = Boolean(
    !skip &&
      query.messages.length === 0 &&
      (query.isUninitialized || query.isLoading || query.isFetching),
  );
  const hasLoaded = Boolean(
    !skip &&
      !query.isUninitialized &&
      !query.isLoading &&
      !query.isError,
  );

  React.useLayoutEffect(() => {
    if (hasLoaded) {
      markImagePerformanceMilestone(conversationId, "T1", {
        outcome: "success",
      });
    }
  }, [conversationId, hasLoaded]);

  return {
    messages: query.messages,
    hasMoreOlder: query.hasMoreOlder,
    hasMoreNewer: query.hasMoreNewer,
    isInitialLoading,
    isFetching: query.isFetching,
    isLoadingOlder: loadOlderResult.isFetching,
    hasLoaded,
    errorMessage:
      resolveErrorMessage(query.error) ??
      resolveErrorMessage(loadOlderResult.error),
    loadOlder,
    retryInitial,
  };
};

export default useConversationMessagesRTK;
