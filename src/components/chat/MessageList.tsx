import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import { MessageBubble } from "./MessageBubble";
import { DateDivider } from "./DateDivider";
import { SystemMessage } from "../message/SystemMessage";
import type { Message, Conversation } from "../../types";
import {
  shouldShowDateDivider,
  shouldShowAvatar,
} from "../../utils/messageHelpers";

interface MessageListProps {
  messages: Message[];
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  conversation,
  currentUserId,
  onReply,
  onReact,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onImageClick,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const nearBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prevFirstMessageIdRef = useRef<string | undefined>(undefined);
  const prevConversationIdRef = useRef<string | null>(null);
  const scrollSnapshotRef = useRef({ scrollTop: 0, scrollHeight: 0 });

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversation.id;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversation.id;
    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = messages[0]?.id;
    loadingOlderRef.current = false;
    nearBottomRef.current = true;

    requestAnimationFrame(() => {
      setShowScrollButton(false);
      scrollToBottom("auto");
    });
  }, [conversation.id, messages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const firstMessageId = messages[0]?.id;
    const messageCountDiff = messages.length - prevMessageCountRef.current;

    if (
      loadingOlderRef.current &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current
    ) {
      const scrollDelta =
        container.scrollHeight - scrollSnapshotRef.current.scrollHeight;
      container.scrollTop = scrollSnapshotRef.current.scrollTop + scrollDelta;
      loadingOlderRef.current = false;
    } else if (nearBottomRef.current && messageCountDiff > 0) {
      scrollToBottom(messageCountDiff === 1 ? "smooth" : "auto");
    }

    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [messages]);

  useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
    nearBottomRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom);

    if (
      onLoadMore &&
      hasMore &&
      !isLoadingMore &&
      !loadingOlderRef.current &&
      scrollTop < 120
    ) {
      loadingOlderRef.current = true;
      scrollSnapshotRef.current = {
        scrollTop,
        scrollHeight,
      };

      Promise.resolve(onLoadMore()).catch(() => {
        loadingOlderRef.current = false;
      });
    }
  };

  return (
    <div className={clsx("relative h-full min-h-0 flex-1", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-24"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          backgroundColor: "#e6ebee",
        }}
      >
        {isLoadingMore && (
          <div className="py-1 text-center text-xs text-gray-500">Dang tai...</div>
        )}

        {messages.map((message, index) => {
          const showDate = shouldShowDateDivider(messages, index);
          const showAvatarForMessage = shouldShowAvatar(
            messages,
            index,
            conversation.type,
          );
          const isOwn = message.senderId === currentUserId;

          return (
            <React.Fragment key={message.id}>
              {showDate && <DateDivider date={new Date(message.createdAt)} />}

              {message.type === "system" ? (
                <SystemMessage message={message} />
              ) : (
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatarForMessage}
                  conversationType={conversation.type}
                  onReply={onReply}
                  onReact={onReact}
                  onImageClick={onImageClick}
                />
              )}
            </React.Fragment>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {showScrollButton && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "h-10 w-10 rounded-full border border-gray-200 bg-white shadow-lg",
            "flex items-center justify-center transition-colors hover:bg-gray-50",
            "animate-bounce-in",
          )}
          aria-label="Cuon xuong cuoi"
        >
          <ChevronDownIcon className="h-5 w-5 text-gray-600" />
        </button>
      )}
    </div>
  );
};

export default MessageList;
