import React from "react";
import clsx from "clsx";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface SendButtonProps {
  disabled: boolean;
  isBusy?: boolean;
  state?: "idle" | "ready" | "sending" | "disabled";
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  disabled,
  isBusy = false,
  state,
  onClick,
  ariaLabel,
  className,
}) => {
  const resolvedState = disabled
    ? "disabled"
    : isBusy
      ? "sending"
      : state || "idle";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-12 w-12 items-center justify-center rounded-[1.1rem] border transition-micro",
        resolvedState === "disabled" &&
          "cursor-not-allowed border-transparent bg-[hsl(var(--color-chat-pill))] text-text-disabled shadow-none",
        resolvedState === "idle" &&
          "border-border/70 bg-[hsl(var(--color-chat-pill))] text-text-muted shadow-xs",
        resolvedState === "ready" &&
          "border-primary/15 bg-primary text-text-inverse shadow-elev2 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-elev3",
        resolvedState === "sending" &&
          "border-primary/15 bg-primary/12 text-primary shadow-elev1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        className,
      )}
      aria-label={ariaLabel}
    >
      <PaperAirplaneIcon
        className={clsx(
          "h-5 w-5 transition-transform duration-150",
          resolvedState === "ready" && "translate-x-px -translate-y-px",
          isBusy && "opacity-85",
        )}
      />
    </button>
  );
};

export default SendButton;
