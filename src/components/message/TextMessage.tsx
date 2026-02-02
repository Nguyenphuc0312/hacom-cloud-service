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
        "break-words whitespace-pre-wrap max-w-full overflow-wrap-anywhere",
        onlyEmoji ? "text-4xl leading-normal" : "text-sm leading-relaxed",
        className,
      )}
    >
      {parts.map((part, index) => {
        if (urlRegex.test(part)) {
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
