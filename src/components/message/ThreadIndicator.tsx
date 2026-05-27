import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

interface ThreadIndicatorProps {
  threadCount: number;
  onClick?: () => void;
  isOwn?: boolean;
  className?: string;
}

/**
 * Subtle thread indicator shown below a message bubble when it has replies
 * in a thread. Minimal, click-to-expand style.
 */
const ThreadIndicatorComponent: React.FC<ThreadIndicatorProps> = ({
  threadCount,
  onClick,
  isOwn = false,
  className,
}) => {
  const { t } = useTranslation();

  if (threadCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "mt-0.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        "text-[#C41E3A]/80 hover:bg-[#FFC857]/8 active:bg-[#FFC857]/12",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isOwn ? "ml-auto" : "mr-auto",
        className,
      )}
      aria-label={t("chat:message.threadReplies", {
        count: threadCount,
        defaultValue: "{{count}} replies",
      })}
    >
      <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
      <span>
        {t("chat:message.threadReplies", {
          count: threadCount,
          defaultValue: "{{count}} replies",
        })}
      </span>
    </button>
  );
};

export const ThreadIndicator = React.memo(ThreadIndicatorComponent);

export default ThreadIndicator;
