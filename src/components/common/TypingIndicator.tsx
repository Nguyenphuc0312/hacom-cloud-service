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
        "flex items-center gap-2 text-xs text-text-muted animate-fade-in-fast",
        className,
      )}
    >
      {userName && (
        <span className="truncate max-w-[10rem]">
          {t("chat:typing.user", { name: userName })}
        </span>
      )}
      <div className="flex items-center gap-[3px]">
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot will-change-transform" />
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot-delay-1 will-change-transform" />
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot-delay-2 will-change-transform" />
      </div>
    </div>
  );
};

export default TypingIndicator;
