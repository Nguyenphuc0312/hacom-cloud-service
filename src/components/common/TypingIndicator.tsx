import React from "react";
import clsx from "clsx";

interface TypingIndicatorProps {
  userName?: string;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  userName,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-chat-text-secondary text-sm",
        className,
      )}
    >
      {userName && <span>{userName} đang nhập...</span>}
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing" />
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing-delay-1" />
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing-delay-2" />
      </div>
    </div>
  );
};

export default TypingIndicator;
