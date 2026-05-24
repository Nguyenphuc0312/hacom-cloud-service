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
        "chat-composer-send inline-flex h-10 w-10 items-center justify-center rounded-full border transition-micro",
        resolvedState === "disabled" &&
          "cursor-not-allowed border-border/60 bg-[hsl(var(--color-chat-pill))] text-text-disabled shadow-none opacity-72",
        resolvedState === "idle" &&
          "border-border/55 bg-[hsl(var(--color-chat-pill))] text-text-muted shadow-none hover:bg-surface-hover/80 hover:text-text-primary",
        resolvedState === "ready-to-send" &&
          "border-transparent bg-gradient-to-br from-[hsl(214_100%_50%)] to-[hsl(221_83%_40%)] text-white shadow-[0_0_14px_hsl(214_100%_60%/0.4)] hover:shadow-[0_0_20px_hsl(214_100%_60%/0.55)] hover:from-[hsl(214_100%_54%)] hover:to-[hsl(221_83%_44%)]",
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
          "h-[18px] w-[18px] transition-transform duration-150",
          resolvedState === "ready-to-send" && "translate-x-px -translate-y-px",
          isBusy && "opacity-85",
        )}
      />
    </button>
  );
};

export default SendButton;
