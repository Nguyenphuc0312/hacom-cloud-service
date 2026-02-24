import React from "react";
import clsx from "clsx";
import { isOnlyEmoji } from "../../utils/messageHelpers";

interface TextMessageProps {
  content: string;
  isOwn: boolean;
  className?: string;
}

export const TextMessage: React.FC<TextMessageProps> = ({
  content,
  isOwn,
  className,
}) => {
  const onlyEmoji = isOnlyEmoji(content);

  // Parse URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <p
      className={clsx(
        "max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
        onlyEmoji ? "text-3xl leading-tight" : "text-[15px] leading-6",
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
                "underline",
                isOwn
                  ? "text-white/90 hover:text-white"
                  : "text-telegram-primary hover:text-telegram-secondary",
              )}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </p>
  );
};

export default TextMessage;
