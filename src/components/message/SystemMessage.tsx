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
    <div className={clsx("flex justify-center my-4", className)}>
      <span className="px-3 py-1.5 rounded-full bg-black/5 text-gray-600 text-xs">
        {message.content}
      </span>
    </div>
  );
};

export default SystemMessage;
