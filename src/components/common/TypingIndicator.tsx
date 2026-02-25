import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface TypingIndicatorProps {
  userName?: string;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  userName,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-xs text-chat-text-secondary",
        className,
      )}
    >
      {userName && <span>{t("chat:typing.user", { name: userName })}</span>}
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing" />
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing-delay-1" />
        <span className="w-1.5 h-1.5 bg-chat-text-secondary rounded-full animate-typing-delay-2" />
      </div>
    </div>
  );
};

export default TypingIndicator;

