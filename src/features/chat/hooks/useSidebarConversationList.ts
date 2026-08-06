import { useMemo } from "react";
import type { Conversation, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import {
  getConversationDisplayName,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import type { SidebarConversationFilter } from "../state/chatSidebarStore";
import { useSidebarConversationSummaries } from "./useSidebarConversationSummaries";

const isPersonalCloudConversation = (conversation: Conversation): boolean =>
  String(conversation.type).toLowerCase() === "personal_cloud";

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
    return !isDirectConversation(conversation);
  }

  return true;
};

export const useSidebarConversationList = (
  currentUser: UserSummary,
  options: {
    filter: SidebarConversationFilter;
    query: string;
  },
): SidebarConversationListResult => {
  const { orderedConversations, counts } = useSidebarConversationSummaries();

  return useMemo(() => {
    const normalizedQuery = options.query.trim().toLowerCase();
    const conversationIds = orderedConversations
      // Personal Cloud has its own workspace at /cloud. Keeping it out of the
      // normal inbox prevents it from inheriting group/DM presentation and unread semantics.
      .filter((conversation) => !isPersonalCloudConversation(conversation))
      .filter((conversation) => matchesFilter(conversation, options.filter))
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
    options.filter,
    options.query,
    orderedConversations,
  ]);
};

export default useSidebarConversationList;
