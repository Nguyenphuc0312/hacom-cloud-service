import React from "react";
import clsx from "clsx";

interface MessageRowProps {
  isOwn: boolean;
  actionRail?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const MessageRow: React.FC<MessageRowProps> = React.memo(
  ({
    isOwn,
    actionRail,
    children,
    className,
  }) => {
    return (
      <div
        className={clsx(
          "chat-message-row flex items-start gap-1.5",
          isOwn ? "flex-row-reverse justify-start" : "justify-start",
          className,
        )}
      >
        <div
          className={clsx(
            "hidden min-h-9 min-w-[2.25rem] items-start pt-1 sm:flex",
            isOwn ? "justify-start" : "justify-end",
          )}
        >
          {actionRail}
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  },
  (prev, next) =>
    prev.isOwn === next.isOwn &&
    prev.actionRail === next.actionRail &&
    prev.children === next.children &&
    prev.className === next.className,
);

export default MessageRow;
