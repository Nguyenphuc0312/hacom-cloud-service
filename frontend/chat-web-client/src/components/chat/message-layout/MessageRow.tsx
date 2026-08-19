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
          "chat-message-row flex items-end gap-1",
          isOwn ? "flex-row-reverse justify-start" : "justify-start",
          className,
        )}
      >
        <div className="hidden shrink-0 items-center sm:flex">
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
