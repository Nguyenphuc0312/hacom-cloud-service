import React from "react";
import clsx from "clsx";

interface ConversationLaneProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export const ConversationLane: React.FC<ConversationLaneProps> = ({
  children,
  className,
  innerClassName,
}) => {
  return (
    <div className={clsx("px-[var(--chat-lane-padding)]", className)}>
      <div
        className={clsx(
          "mx-auto w-full max-w-[var(--chat-content-lane)]",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default ConversationLane;
