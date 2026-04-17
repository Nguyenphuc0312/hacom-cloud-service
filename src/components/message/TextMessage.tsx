import React from "react";
import clsx from "clsx";
import { isOnlyEmoji } from "../../utils/messageHelpers";

interface TextMessageProps {
  content: string;
  isOwn: boolean;
  /** The current user's username, used to highlight when they are mentioned */
  currentUsername?: string;
  className?: string;
}

/**
 * Split a text fragment into mention-highlighted and plain segments.
 * Matches @username tokens (word-boundary safe).
 */
const renderWithMentions = (
  text: string,
  isOwn: boolean,
  currentUsername?: string,
): React.ReactNode[] => {
  if (!currentUsername) return [text];

  // Match @<word> patterns
  const mentionRegex = /(@\w+)/g;
  const segments = text.split(mentionRegex);

  return segments.map((segment, idx) => {
    const isMention = /^@\w+$/.test(segment);
    if (!isMention) return <React.Fragment key={idx}>{segment}</React.Fragment>;

    const mentionedName = segment.slice(1).toLowerCase();
    const isSelfMention = mentionedName === currentUsername.toLowerCase();

    return (
      <span
        key={idx}
        className={clsx(
          "inline rounded px-0.5 font-semibold",
          isSelfMention
            ? isOwn
              ? "bg-text-inverse/20 text-text-inverse"
              : "bg-primary/15 text-primary"
            : isOwn
              ? "text-text-inverse/95"
              : "text-primary/80",
        )}
      >
        {segment}
      </span>
    );
  });
};

export const TextMessage: React.FC<TextMessageProps> = ({
  content,
  isOwn,
  currentUsername,
  className,
}) => {
  const onlyEmoji = isOnlyEmoji(content);

  // Split by URLs first, then by mentions within non-URL segments
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <p
      className={clsx(
        "chat-message-text max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
        onlyEmoji ? "leading-tight text-3xl" : "text-[15px] leading-[1.4rem]",
        className,
      )}
    >
      {parts.map((part, index) => {
        const isLink = /^https?:\/\/[^\s]+$/i.test(part);
        if (isLink) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "underline transition-colors",
                isOwn
                  ? "text-text-inverse/90 hover:text-text-inverse"
                  : "text-primary hover:text-secondary",
              )}
            >
              {part}
            </a>
          );
        }
        return (
          <React.Fragment key={index}>
            {renderWithMentions(part, isOwn, currentUsername)}
          </React.Fragment>
        );
      })}
    </p>
  );
};

export default TextMessage;
