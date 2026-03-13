import React from "react";
import clsx from "clsx";

interface MessageRowProps {
  isOwn: boolean;
  actionRail?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const MessageRow: React.FC<MessageRowProps> = ({
  isOwn,
  actionRail,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex items-start gap-2",
        isOwn ? "flex-row-reverse justify-start" : "justify-start",
        className,
      )}
    >
      <div
        className={clsx(
          "hidden min-h-9 min-w-10 items-start pt-1 md:flex",
          isOwn ? "justify-start" : "justify-end",
        )}
      >
        {actionRail}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

export default MessageRow;
