import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ConversationItem } from "./ConversationItem";
import type { Conversation, ConversationFilter } from "../../types";
import {
  sortConversations,
  filterConversations,
} from "../../utils/messageHelpers";

interface ConversationListProps {
  conversations: Conversation[];
  currentUserId: string;
  selectedId: string | null;
  searchQuery: string;
  activeFilter: ConversationFilter;
  onSelect: (conversationId: string) => void;
  className?: string;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentUserId,
  selectedId,
  searchQuery,
  activeFilter,
  onSelect,
  className,
}) => {
  const { t } = useTranslation();

  let filtered = filterConversations(
    Array.isArray(conversations) ? conversations : [],
    searchQuery,
  );

  switch (activeFilter) {
    case "unread":
      filtered = filtered.filter((c) => c.unreadCount > 0);
      break;
    case "groups":
      filtered = filtered.filter((c) => c.type === "group");
      break;
    case "channels":
      filtered = filtered.filter((c) => c.type === "channel");
      break;
    default:
      break;
  }

  const sorted = sortConversations(filtered, {
    currentUserId,
    activeConversationId: selectedId,
  });

  const pinned = sorted.filter((c) => c.isPinned);
  const unpinned = sorted.filter((c) => !c.isPinned);

  if (sorted.length === 0) {
    return (
      <div
        className={clsx(
          "flex flex-col items-center justify-center py-12 text-text-muted",
          className,
        )}
      >
        <svg
          className="w-16 h-16 mb-4 text-border-strong"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <p className="text-sm">
          {searchQuery ? t("sidebar:room.emptyBySearch") : t("sidebar:room.empty")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx("overflow-y-auto", className)}
      role="listbox"
      aria-label={t("sidebar:room.listAria")}
    >
      {pinned.length > 0 && (
        <>
          {pinned.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              currentUserId={currentUserId}
              isActive={selectedId === conversation.id}
              onClick={() => onSelect(conversation.id)}
            />
          ))}

          {unpinned.length > 0 && <div className="h-px bg-border my-1" />}
        </>
      )}

      {unpinned.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          currentUserId={currentUserId}
          isActive={selectedId === conversation.id}
          onClick={() => onSelect(conversation.id)}
        />
      ))}
    </div>
  );
};

export default ConversationList;
