import React from "react";
import clsx from "clsx";
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
  // Filter conversations
  let filtered = filterConversations(
    Array.isArray(conversations) ? conversations : [],
    searchQuery,
  );

  // Apply tab filter
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
      // 'all' - no additional filter
      break;
  }

  // Sort conversations
  const sorted = sortConversations(filtered);

  // Separate pinned and unpinned
  const pinned = sorted.filter((c) => c.isPinned);
  const unpinned = sorted.filter((c) => !c.isPinned);

  if (sorted.length === 0) {
    return (
      <div
        className={clsx(
          "flex flex-col items-center justify-center py-12 text-gray-500",
          className,
        )}
      >
        <svg
          className="w-16 h-16 mb-4 text-gray-300"
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
          {searchQuery
            ? "Không tìm thấy cuộc trò chuyện"
            : "Chưa có cuộc trò chuyện"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx("overflow-y-auto", className)}
      role="listbox"
      aria-label="Danh sách cuộc trò chuyện"
    >
      {/* Pinned conversations */}
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

          {/* Divider between pinned and unpinned */}
          {unpinned.length > 0 && <div className="h-px bg-gray-200 my-1" />}
        </>
      )}

      {/* Unpinned conversations */}
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
