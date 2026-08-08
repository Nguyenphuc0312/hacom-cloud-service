import { useMemo } from "react";
import { useUIStore } from "../../../stores/uiStore";
import type { Conversation, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import type { SidebarConversationFilter } from "../state/chatSidebarStore";
import { useSidebarConversationSummaries } from "./useSidebarConversationSummaries";
import { isPersonalCloudConversation, personalCloudPresentation } from "../../cloud/personalCloudPolicy";

interface SidebarConversationListResult {
  conversationIds: string[];
  counts: {
    all: number;
    unread: number;
    groups: number;
  };
}

const includesQuery = (
  conversation: Conversation,
  normalizedQuery: string,
  currentUserId: string,
): boolean => {
  if (!normalizedQuery) return true;

  if (isPersonalCloudConversation(conversation)) {
    return personalCloudPresentation.title.toLowerCase().includes(normalizedQuery);
  }

  const resolvedConversationName = getConversationDisplayName(
    conversation,
    currentUserId,
  ).toLowerCase();
  if (resolvedConversationName.includes(normalizedQuery)) {
    return true;
  }

  if ((conversation.displayName || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if ((conversation.name || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if (
    (conversation.otherUser?.displayName || "")
      .toLowerCase()
      .includes(normalizedQuery) ||
    (conversation.otherUser?.username || "")
      .toLowerCase()
      .includes(normalizedQuery)
  ) {
    return true;
  }

  const participantMatch = (conversation.participants || []).some(
    (participant) => {
      const displayName = getUserDisplayName(participant, {
        allowTechnicalFallback: true,
      }).toLowerCase();
      const username = (participant.username || "").toLowerCase();
      return (
        displayName.includes(normalizedQuery) ||
        username.includes(normalizedQuery)
      );
    },
  );

  if (participantMatch) return true;

  return (conversation.lastMessage?.content || "")
    .toLowerCase()
    .includes(normalizedQuery);
};

const matchesFilter = (
  conversation: Conversation,
  filter: SidebarConversationFilter,
): boolean => {
  if (filter === "unread") {
    return (conversation.unreadCount ?? 0) > 0;
  }

  if (filter === "groups") {
    return !isDirectConversation(conversation) && !isPersonalCloudConversation(conversation);
  }

  return true;
};

const matchesLabels = (
  conversationId: string,
  selectedLabelIds: string[],
  labelsByConversationId: Record<string, string[]>,
): boolean => {
  if (selectedLabelIds.length === 0) return true;

  const labelIds = labelsByConversationId[conversationId] ?? [];
  return selectedLabelIds.some((labelId) => labelIds.includes(labelId));
};

export const useSidebarConversationList = (
  currentUser: UserSummary,
  options: {
    filter: SidebarConversationFilter;
    query: string;
  },
): SidebarConversationListResult => {
  const { orderedConversations, counts } = useSidebarConversationSummaries();
  const selectedLabelIds = useUIStore(
    (state) => state.selectedConversationLabelIds,
  );
  const labelsByConversationId = useUIStore(
    (state) => state.conversationLabelsByConversationId,
  );

  return useMemo(() => {
    const normalizedQuery = options.query.trim().toLowerCase();
    const conversationIds = orderedConversations
      .filter((conversation) => matchesFilter(conversation, options.filter))
      .filter((conversation) =>
        matchesLabels(conversation.id, selectedLabelIds, labelsByConversationId),
      )
      .filter((conversation) =>
        includesQuery(conversation, normalizedQuery, currentUser.id),
      )
      .map((conversation) => conversation.id);

    return { conversationIds, counts };
    // Chỉ phụ thuộc currentUser.id: dùng cả object sẽ tính lại toàn bộ filter
    // mỗi khi object đổi identity dù id không đổi.
  }, [
    counts,
    currentUser.id,
    labelsByConversationId,
    options.filter,
    options.query,
    orderedConversations,
    selectedLabelIds,
  ]);
};

export default useSidebarConversationList;
