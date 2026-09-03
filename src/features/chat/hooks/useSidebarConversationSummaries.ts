import { useMemo } from "react";
import { useChatStore } from "../../../stores";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import {
  createConversationActivityComparator,
  getConversationPinnedTimestamp,
} from "../../../utils/conversationRanking";
import type { Conversation } from "../../../types";
import { isPersonalCloudConversation } from "../../cloud/personalCloudPolicy";

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
      const conversations = orderedConversationIds
        .map((conversationId) => conversationById[conversationId])
        .filter((conversation): conversation is Conversation =>
          Boolean(conversation),
        );
      const pinnedAtById = new Map(
        conversations
          .map((conversation) => [
            conversation.id,
            getConversationPinnedTimestamp(conversation),
          ] as const)
          .filter(([, pinnedAt]) => pinnedAt > 0),
      );
      const comparator = createConversationActivityComparator(
        new Set(pinnedAtById.keys()),
        pinnedAtById,
      );
      const orderedConversations = conversations.sort(comparator);

      const counts = orderedConversations.reduce(
        (accumulator, conversation) => {
          accumulator.all += 1;
          if (
            !isPersonalCloudConversation(conversation) &&
            (conversation.unreadCount ?? 0) > 0
          ) {
            accumulator.unread += 1;
          }
          if (
            !isDirectConversation(conversation) &&
            !isPersonalCloudConversation(conversation)
          ) {
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
