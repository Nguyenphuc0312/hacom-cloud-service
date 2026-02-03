import React, { useRef, useEffect, useState } from "react";
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
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  conversation,
  currentUserId,
  onReply,
  onReact,
  onImageClick,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      setShowScrollButton(!isNearBottom);
    }
  };

  return (
    <div className={clsx("relative h-full", className)}>
      {/* Messages container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 space-y-2"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          backgroundColor: "#e6ebee",
        }}
      >
        {messages.map((message, index) => {
          const showDate = shouldShowDateDivider(messages, index);
          const showAvatarForMsg = shouldShowAvatar(
            messages,
            index,
            conversation.type,
          );
          const isOwn = message.senderId === currentUserId;

          return (
            <React.Fragment key={message.id}>
              {/* Date divider */}
              {showDate && <DateDivider date={new Date(message.createdAt)} />}

              {/* System message */}
              {message.type === "system" ? (
                <SystemMessage message={message} />
              ) : (
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatarForMsg}
                  conversationType={conversation.type}
                  onReply={onReply}
                  onReact={onReact}
                  onImageClick={onImageClick}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Bottom anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "w-10 h-10 rounded-full",
            "bg-white shadow-lg border border-gray-200",
            "flex items-center justify-center",
            "hover:bg-gray-50 transition-colors",
            "animate-bounce-in",
          )}
          aria-label="Cuộn xuống cuối"
        >
          <ChevronDownIcon className="w-5 h-5 text-gray-600" />
        </button>
      )}
    </div>
  );
};

export default MessageList;
