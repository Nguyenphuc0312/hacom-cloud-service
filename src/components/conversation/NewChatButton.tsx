import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "@heroicons/react/24/solid";

interface NewChatButtonProps {
  onClick: () => void;
  className?: string;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({
  onClick,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      className={clsx(
        "fixed bottom-6 right-6 z-sticky",
        "w-14 h-14 rounded-full",
        "bg-primary hover:bg-primary-hover",
        "text-text-inverse shadow-lg hover:shadow-xl",
        "flex items-center justify-center",
        "transition-all duration-200",
        "hover:scale-105 active:scale-95",
        className,
      )}
      aria-label={t("chat:empty.startNewChat")}
    >
      <PlusIcon className="w-6 h-6" />
    </button>
  );
};

export default NewChatButton;
