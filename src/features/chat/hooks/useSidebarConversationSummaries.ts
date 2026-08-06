import { useMemo } from "react";
import { useChatStore } from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import { createConversationActivityComparator } from "../../../utils/conversationRanking";
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
    const pinnedConversationIds = useUIStore((state) => state.pinnedConversationIds);

    return useMemo(() => {
      // Dựng Set một lần cho cả lần sort, thay vì tra mảng ghim trong mỗi phép so sánh.
      const comparator = createConversationActivityComparator(
        new Set(pinnedConversationIds),
      );
      const orderedConversations = orderedConversationIds
        .map((conversationId) => conversationById[conversationId])
        .filter((conversation): conversation is Conversation =>
          Boolean(conversation),
        )
        .sort(comparator);

      const counts = orderedConversations.reduce(
        (accumulator, conversation) => {
          accumulator.all += 1;
          if (!isPersonalCloudConversation(conversation) && (conversation.unreadCount ?? 0) > 0) {
            accumulator.unread += 1;
          }
          if (!isDirectConversation(conversation) && !isPersonalCloudConversation(conversation)) {
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
    }, [conversationById, orderedConversationIds, pinnedConversationIds]);
  };

export default useSidebarConversationSummaries;
