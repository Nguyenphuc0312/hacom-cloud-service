import React from "react";
import clsx from "clsx";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

export type SendButtonState =
  | "idle"
  | "ready-to-send"
  | "uploading"
  | "disabled"
  | "slow-mode"
  | "offline";

interface SendButtonProps {
  disabled: boolean;
  isBusy?: boolean;
  state?: SendButtonState;
  onClick: () => void;
  ariaLabel: string;
  "data-testid"?: string;
  className?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  disabled,
  isBusy = false,
  state,
  onClick,
  ariaLabel,
  "data-testid": dataTestId,
  className,
}) => {
  const resolvedState = disabled
    ? "disabled"
    : isBusy
      ? "uploading"
      : state || "idle";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "chat-composer-send inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border transition-micro",
        resolvedState === "disabled" &&
          "cursor-not-allowed border-border/70 bg-[hsl(var(--color-chat-pill))] text-text-disabled shadow-none opacity-72",
        resolvedState === "idle" &&
          "border-border/70 bg-[hsl(var(--color-chat-pill))] text-text-muted shadow-none",
        resolvedState === "ready-to-send" &&
          "border-primary/24 bg-[hsl(var(--chat-active-surface))] text-text-inverse shadow-none hover:bg-primary-hover",
        resolvedState === "uploading" &&
          "border-primary/18 bg-primary/12 text-primary shadow-none",
        resolvedState === "slow-mode" &&
          "border-warning/30 bg-warning/10 text-warning shadow-none",
        resolvedState === "offline" &&
          "border-danger/25 bg-danger/10 text-danger shadow-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        className,
      )}
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      <PaperAirplaneIcon
        className={clsx(
          "h-5 w-5 transition-transform duration-150",
          resolvedState === "ready-to-send" && "translate-x-px -translate-y-px",
          isBusy && "opacity-85",
        )}
      />
    </button>
  );
};

export default SendButton;
