import { useMemo } from "react";
import { useChatStore } from "../../../stores";
import type { Conversation, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import { formatRelativeTime } from "../../../utils/formatTime";
import { hasConversationMention, sortConversationsByActivity } from "../../../utils/conversationRanking";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getMessagePreview,
  getMessagePreviewState,
  getOtherParticipant,
  getUserDisplayName,
  truncateTextWithEllipsis,
} from "../../../utils/messageHelpers";
import type { MessagePreviewState } from "../../../utils/messageHelpers";
import type { SidebarConversationFilter } from "../state/chatSidebarStore";
import i18n from "../../../i18n";

export interface SidebarConversationItemViewModel {
  id: string;
  conversation: Conversation;
  displayName: string;
  previewText: string;
  previewState: MessagePreviewState;
  timeLabel: string;
  unreadCount: number;
  unreadLabel: string;
  hasUnreadMention: boolean;
  avatarSrc?: string;
  directPartnerId: string | null;
  isDirect: boolean;
}

interface SidebarConversationListResult {
  items: SidebarConversationItemViewModel[];
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

const buildPreviewText = (
  conversation: Conversation,
  currentUser: UserSummary,
): string => {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) return "";

  const messagePreview = getMessagePreview(lastMessage, currentUser.id, 240);
  if (!messagePreview) return "";

  if (lastMessage.type === "system" || isDirectConversation(conversation)) {
    return truncateTextWithEllipsis(messagePreview, 52);
  }

  const directPartner = getOtherParticipant(conversation, currentUser.id);
  const senderParticipant = (conversation.participants || []).find(
    (participant) => participant.id === lastMessage.senderId,
  );

  const senderLabel =
    lastMessage.senderId === currentUser.id
      ? i18n.t("chat:message.you")
      : getUserDisplayName(senderParticipant) ||
        getUserDisplayName(directPartner) ||
        lastMessage.senderName?.trim() ||
        i18n.t("common:labels.conversation");

  return truncateTextWithEllipsis(`${senderLabel}: ${messagePreview}`, 52);
};

export const useSidebarConversationList = (
  currentUser: UserSummary,
  options: {
    filter: SidebarConversationFilter;
    query: string;
  },
): SidebarConversationListResult => {
  const conversations = useChatStore((state) => state.conversations);

  return useMemo(() => {
    const normalizedQuery = options.query.trim().toLowerCase();
    const ordered = sortConversationsByActivity(
      Array.isArray(conversations) ? conversations : [],
    );

    const counts = ordered.reduce(
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

    const items = ordered
      .filter((conversation) => matchesFilter(conversation, options.filter))
      .filter((conversation) =>
        includesQuery(conversation, normalizedQuery, currentUser.id),
      )
      .map((conversation) => {
        const displayName =
          getConversationDisplayName(conversation, currentUser.id) ||
          i18n.t("common:labels.conversation");
        const previewState = getMessagePreviewState(
          conversation.lastMessage,
          currentUser.id,
        );
        const referenceTime =
          conversation.lastMessageSortAt ||
          conversation.lastMessageAt ||
          conversation.lastMessage?.createdAt;
        const directPartner = getOtherParticipant(conversation, currentUser.id);
        const unreadCount = Math.max(0, conversation.unreadCount || 0);

        return {
          id: conversation.id,
          conversation,
          displayName,
          previewText: buildPreviewText(conversation, currentUser),
          previewState,
          timeLabel: referenceTime
            ? formatRelativeTime(new Date(referenceTime))
            : "",
          unreadCount,
          unreadLabel: unreadCount > 99 ? "99+" : String(unreadCount),
          hasUnreadMention: hasConversationMention(conversation, currentUser),
          avatarSrc: getConversationAvatar(conversation, currentUser.id),
          directPartnerId: directPartner?.id ?? null,
          isDirect: isDirectConversation(conversation),
        } satisfies SidebarConversationItemViewModel;
      });

    return { items, counts };
  }, [conversations, currentUser, options.filter, options.query]);
};

export default useSidebarConversationList;
