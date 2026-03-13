import React from "react";
import clsx from "clsx";
import { PaperAirplaneIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface SendButtonProps {
  disabled: boolean;
  isBusy?: boolean;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  disabled,
  isBusy = false,
  onClick,
  ariaLabel,
  className,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-12 w-12 items-center justify-center rounded-full shadow-elev1 transition-colors",
        disabled
          ? "cursor-not-allowed bg-[hsl(var(--color-chat-pill))] text-text-disabled shadow-none"
          : "bg-primary text-text-inverse hover:bg-primary-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        className,
      )}
      aria-label={ariaLabel}
    >
      {isBusy ? (
        <ArrowPathIcon className="h-5 w-5 animate-spin" />
      ) : (
        <PaperAirplaneIcon className="h-5 w-5" />
      )}
    </button>
  );
};

export default SendButton;
