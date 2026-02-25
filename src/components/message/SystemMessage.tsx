import React from "react";
import clsx from "clsx";
import type { Message } from "../../types";

interface SystemMessageProps {
  message: Message;
  className?: string;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({
  message,
  className,
}) => {
  return (
    <div className={clsx("my-4 flex justify-center", className)}>
      <span className="rounded-full bg-surface-overlay px-3 py-1.5 text-xs text-text-secondary">
        {message.content}
      </span>
    </div>
  );
};

export default SystemMessage;
