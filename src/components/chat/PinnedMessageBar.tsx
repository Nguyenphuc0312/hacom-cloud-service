/**
 * @fileoverview PinnedMessageBar
 * Slim bar shown above the chat timeline that previews the latest pinned
 * message. Click to jump to it; when several messages are pinned, a counter
 * button opens the full pinned messages panel.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { PinIcon } from "@hugeicons/core-free-icons";
import { ConversationLane } from "../layout/ConversationLane";
import { getMessagePreview } from "../../utils/messageHelpers";
import type { Message } from "../../types";

interface PinnedMessageBarProps {
  pinnedMessages: Message[];
  currentUserId: string;
  onJumpToMessage?: (message: Message) => void;
  onOpenList?: () => void;
  className?: string;
}

export const PinnedMessageBar: React.FC<PinnedMessageBarProps> = ({
  pinnedMessages,
  currentUserId,
  onJumpToMessage,
  onOpenList,
  className,
}) => {
  const { t } = useTranslation();

  const latest = pinnedMessages[0];
  if (!latest) return null;

  const count = pinnedMessages.length;
  const preview = getMessagePreview(latest, currentUserId, 120);

  return (
    <div
      className={clsx(
        "pinned-message-bar border-b border-border/70 bg-surface",
        className,
      )}
    >
      <ConversationLane>
        <div className="flex min-h-[44px] items-center gap-2 py-1.5">
          <button
            type="button"
            onClick={() => onJumpToMessage?.(latest)}
            className={clsx(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left",
              "transition-micro hover:bg-surface-hover/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:pinned.jumpTo", {
              defaultValue: "Đi tới tin nhắn",
            })}
          >
            <span
              aria-hidden="true"
              className="h-7 w-0.5 shrink-0 rounded-full"
              style={{ background: "linear-gradient(180deg, #1976D2 0%, #1565C0 100%)" }}
            />
            <HugeiconsIcon
              icon={PinIcon}
              className="h-[18px] w-[18px] shrink-0 text-[#1565C0]"
              strokeWidth={1.5}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium leading-4 text-[#1565C0]">
                {t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
              </span>
              <span className="truncate text-xs leading-4 text-text-secondary">
                {latest.senderName ? (
                  <span className="font-medium text-text-primary">
                    {latest.senderName}:{" "}
                  </span>
                ) : null}
                {preview}
              </span>
            </span>
          </button>

          {count > 1 && onOpenList && (
            <button
              type="button"
              onClick={onOpenList}
              style={{ background: "linear-gradient(135deg, #1976D2 0%, #1565C0 100%)" }}
              className={clsx(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white",
                "transition-micro hover:brightness-105 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/40",
              )}
              aria-label={t("chat:pinned.title", {
                defaultValue: "Tin nhắn ghim",
              })}
            >
              {count}
            </button>
          )}
        </div>
      </ConversationLane>
    </div>
  );
};

export default PinnedMessageBar;
