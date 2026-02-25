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

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <p
      className={clsx(
        "max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
        onlyEmoji ? "leading-tight text-3xl" : "text-sm leading-6",
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
        return part;
      })}
    </p>
  );
};

export default TextMessage;
