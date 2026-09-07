import React from "react";
import clsx from "clsx";
import { PaperAirplaneIcon, TrashIcon } from "@heroicons/react/24/outline";

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
  cloudDeleteDropActive?: boolean;
  cloudDeleteDropOver?: boolean;
  onCloudDeleteDragEnter?: React.DragEventHandler<HTMLButtonElement>;
  onCloudDeleteDragOver?: React.DragEventHandler<HTMLButtonElement>;
  onCloudDeleteDragLeave?: React.DragEventHandler<HTMLButtonElement>;
  onCloudDeleteDrop?: React.DragEventHandler<HTMLButtonElement>;
  cloudDeleteDropLabel?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  disabled,
  isBusy = false,
  state,
  onClick,
  ariaLabel,
  "data-testid": dataTestId,
  className,
  cloudDeleteDropActive = false,
  cloudDeleteDropOver = false,
  onCloudDeleteDragEnter,
  onCloudDeleteDragOver,
  onCloudDeleteDragLeave,
  onCloudDeleteDrop,
  cloudDeleteDropLabel = "Thả để đưa vào thùng rác",
}) => {
  const resolvedState = cloudDeleteDropActive
    ? "idle"
    : disabled
    ? "disabled"
    : isBusy
      ? "uploading"
      : state || "idle";

  return (
    <button
      type="button"
      onClick={cloudDeleteDropActive ? undefined : onClick}
      // Keep the TipTap editor focused when sending with the mouse. This is
      // the same composer behavior used by Hacom Chat: the caret remains in
      // the text field so the next message can be typed immediately.
      onMouseDown={(event) => event.preventDefault()}
      disabled={cloudDeleteDropActive ? false : disabled}
      onDragEnter={cloudDeleteDropActive ? onCloudDeleteDragEnter : undefined}
      onDragOver={cloudDeleteDropActive ? onCloudDeleteDragOver : undefined}
      onDragLeave={cloudDeleteDropActive ? onCloudDeleteDragLeave : undefined}
      onDrop={cloudDeleteDropActive ? onCloudDeleteDrop : undefined}
      className={clsx(
        "chat-composer-send inline-flex h-10 w-10 items-center justify-center rounded-full border transition-micro",
        cloudDeleteDropActive &&
          "relative z-20 border-danger/60 bg-danger/10 text-danger shadow-lg shadow-danger/15 transition-[transform,background-color,border-color,box-shadow] duration-200 scale-[1.65]",
        cloudDeleteDropOver &&
          "scale-[2.05] border-danger bg-danger text-white shadow-xl shadow-danger/30",
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
      aria-label={cloudDeleteDropActive ? cloudDeleteDropLabel : ariaLabel}
      data-testid={dataTestId}
      >
      {cloudDeleteDropActive ? (
        <TrashIcon
          className={clsx(
            "h-[18px] w-[18px] transition-transform duration-150",
            cloudDeleteDropOver && "scale-110",
          )}
        />
      ) : (
        <PaperAirplaneIcon
          className={clsx(
            "h-[18px] w-[18px] transition-transform duration-150",
            resolvedState === "ready-to-send" && "translate-x-px -translate-y-px",
            isBusy && "opacity-85",
          )}
        />
      )}
    </button>
  );
};

export default SendButton;
