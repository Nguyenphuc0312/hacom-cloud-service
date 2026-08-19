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
      // Keep the TipTap editor focused when sending with the mouse. This is
      // the same composer behavior used by Hacom Chat: the caret remains in
      // the text field so the next message can be typed immediately.
      onMouseDown={(event) => event.preventDefault()}
      disabled={disabled}
      className={clsx(
        "chat-composer-send inline-flex h-10 w-10 items-center justify-center rounded-full border transition-micro",
        resolvedState === "disabled" &&
          "cursor-not-allowed border-border/60 bg-[hsl(var(--color-chat-pill))] text-text-disabled shadow-none opacity-72",
        resolvedState === "idle" &&
          "border-border/55 bg-[hsl(var(--color-chat-pill))] text-text-muted shadow-none hover:bg-surface-hover/80 hover:text-text-primary",
        resolvedState === "ready-to-send" &&
          "border-transparent bg-[#1565C0] text-white shadow-md shadow-[#1565C0]/15 hover:-translate-y-px hover:shadow-lg hover:shadow-[#1565C0]/25 hover:brightness-105 active:translate-y-0 active:scale-95",
        resolvedState === "uploading" &&
          "border-[#1976D2]/25 bg-[#DBEAFE]/12 text-[#1565C0] shadow-none",
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
          "h-[18px] w-[18px] transition-transform duration-150",
          resolvedState === "ready-to-send" && "translate-x-px -translate-y-px",
          isBusy && "opacity-85",
        )}
      />
    </button>
  );
};

export default SendButton;
