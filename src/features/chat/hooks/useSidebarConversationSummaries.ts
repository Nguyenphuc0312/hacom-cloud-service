import { useMemo } from "react";
import { useChatStore } from "../../../stores";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import type { Conversation } from "../../../types";

interface SidebarConversationSummariesResult {
  orderedConversations: Conversation[];
  orderedConversationIds: string[];
  counts: {
    all: number;
    unread: number;
    groups: number;
  };
}

export const useSidebarConversationSummaries =
  (): SidebarConversationSummariesResult => {
    const orderedConversationIds = useChatStore(
      (state) => state.orderedConversationIds,
    );
    const conversationById = useChatStore((state) => state.conversationById);

    return useMemo(() => {
      const orderedConversations = orderedConversationIds
        .map((conversationId) => conversationById[conversationId])
        .filter((conversation): conversation is Conversation =>
          Boolean(conversation),
        );

      const counts = orderedConversations.reduce(
        (accumulator, conversation) => {
          accumulator.all += 1;
          if ((conversation.unreadCount ?? 0) > 0) {
            accumulator.unread += 1;
          }
          if (!isDirectConversation(conversation)) {
            accumulator.groups += 1;
          }
          return accumulator;
        },
        { all: 0, unread: 0, groups: 0 },
      );

      return {
        orderedConversations,
        orderedConversationIds: orderedConversations.map(
          (conversation) => conversation.id,
        ),
        counts,
      };
    }, [conversationById, orderedConversationIds]);
  };

export default useSidebarConversationSummaries;
