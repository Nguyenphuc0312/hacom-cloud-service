import React from "react";
import { useStore } from "react-redux";
import {
  chatApi,
  useLazyGetMessageByIdQuery,
  useLazyGetMessagesQuery,
} from "../../api/chatApi";
import {
  buildConversationMessagesCache,
  getMessageSeq,
  upsertMessageInCache,
} from "../domain/messageMerge";
import { messagesShareIdentity } from "../domain/messageIdentity";
import type { RootState } from "../../../store";
import { useAppDispatch } from "../../../store/hooks";
import type { Message } from "../../../types";
import { logScrollTrace } from "../../../utils/scrollTrace";

const JUMP_CONTEXT_PAGE_LIMIT = 24;

export type JumpTargetLoadStatus = "cached" | "loaded" | "stale";

export interface JumpTargetLoadResult {
  message: Message | null;
  status: JumpTargetLoadStatus;
  stale: boolean;
}

const getMessageCursor = (
  message: Message,
  direction: "before" | "after",
): { beforeSeq: number } | { afterSeq: number } | { beforeId: string } | { afterId: string } => {
  const serverSeq = getMessageSeq(message);

  if (serverSeq !== null) {
    return direction === "before"
      ? { beforeSeq: serverSeq }
      : { afterSeq: serverSeq };
  }

  return direction === "before"
    ? { beforeId: message.id }
    : { afterId: message.id };
};

const findCachedMessage = (
  state: RootState,
  conversationId: string,
  messageId: string,
): Message | null =>
  chatApi.endpoints.getMessages
    .select({ conversationId })(state)
    .data?.messages.find((message) =>
      messagesShareIdentity(message, {
        id: messageId,
        localId: messageId,
        stableId: messageId,
        clientMessageId: messageId,
      }),
    ) ?? null;

export const useMessageJumpTargetRTK = (
  conversationId: string,
): {
  ensureMessageLoaded: (
    messageId: string,
    fallbackMessage?: Message,
  ) => Promise<JumpTargetLoadResult>;
} => {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const [triggerGetMessageById] = useLazyGetMessageByIdQuery();
  const [triggerGetMessages] = useLazyGetMessagesQuery();
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    generationRef.current += 1;
    return () => {
      generationRef.current += 1;
    };
  }, [conversationId]);

  const ensureMessageLoaded = React.useCallback(
    async (
      messageId: string,
      fallbackMessage?: Message,
    ): Promise<JumpTargetLoadResult> => {
      const requestConversationId = conversationId;
      const requestGeneration = generationRef.current;
      const isStale = () => generationRef.current !== requestGeneration;

      const cachedMessage = findCachedMessage(
        reduxStore.getState(),
        requestConversationId,
        messageId,
      );
      if (cachedMessage) {
        logScrollTrace("jump_target_cache_hit", {
          conversationId: requestConversationId,
          messageId,
        });
        return { message: cachedMessage, status: "cached", stale: false };
      }

      let targetMessage = fallbackMessage ?? null;
      if (!targetMessage) {
        targetMessage = await triggerGetMessageById(messageId, false).unwrap();
      }

      if (isStale()) {
        logScrollTrace("jump_target_load_stale", {
          conversationId: requestConversationId,
          messageId,
          stage: "target_loaded",
        });
        return { message: targetMessage, status: "stale", stale: true };
      }

      const queryArg = { conversationId: requestConversationId };
      const patch = dispatch(
        chatApi.util.updateQueryData("getMessages", queryArg, (draft) => {
          upsertMessageInCache(draft, targetMessage);
        }),
      );
      if (patch.patches.length === 0) {
        dispatch(
          chatApi.util.upsertQueryData(
            "getMessages",
            queryArg,
            buildConversationMessagesCache(requestConversationId, [
              targetMessage,
            ]),
          ),
        );
      }

      logScrollTrace("jump_target_inserted_rtkq", {
        conversationId: requestConversationId,
        messageId,
        targetMessageId: targetMessage.id,
        targetSeq: getMessageSeq(targetMessage),
      });

      await triggerGetMessages(
        {
          conversationId: requestConversationId,
          limit: JUMP_CONTEXT_PAGE_LIMIT,
          ...getMessageCursor(targetMessage, "before"),
        },
        false,
      ).unwrap();

      if (isStale()) {
        logScrollTrace("jump_target_load_stale", {
          conversationId: requestConversationId,
          messageId,
          stage: "before_context_loaded",
        });
        return { message: targetMessage, status: "stale", stale: true };
      }

      await triggerGetMessages(
        {
          conversationId: requestConversationId,
          limit: JUMP_CONTEXT_PAGE_LIMIT,
          ...getMessageCursor(targetMessage, "after"),
        },
        false,
      ).unwrap();

      if (isStale()) {
        logScrollTrace("jump_target_load_stale", {
          conversationId: requestConversationId,
          messageId,
          stage: "context_loaded",
        });
        return { message: targetMessage, status: "stale", stale: true };
      }

      return { message: targetMessage, status: "loaded", stale: false };
    },
    [
      conversationId,
      dispatch,
      reduxStore,
      triggerGetMessageById,
      triggerGetMessages,
    ],
  );

  return { ensureMessageLoaded };
};

export default useMessageJumpTargetRTK;
