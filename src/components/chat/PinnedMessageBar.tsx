/**
 * @fileoverview PinnedMessageBar
 * Slim bar shown above the chat timeline that previews the latest pinned
 * message. Click to jump to it; when several messages are pinned, a counter
 * button opens the full pinned messages panel.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Pin } from "lucide-react";
import { getMessagePreview } from "../../utils/messageHelpers";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
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
  const senderAlias = useEnrichedProfileStore((s) =>
    pinnedMessages[0] ? s.nameByUserId[pinnedMessages[0].senderId] : undefined,
  );

  const latest = pinnedMessages[0];
  if (!latest) return null;

  const count = pinnedMessages.length;
  const preview = getMessagePreview(latest, currentUserId, 120);
  const senderName = senderAlias ?? latest.senderName;

  return (
    <div
      className={clsx("pinned-message-bar border-b border-border/70 bg-surface", className)}
    >
      <div className="flex min-h-[64px] items-center gap-3 px-5 py-2">
          <button
            type="button"
            onClick={() => onJumpToMessage?.(latest)}
            className={clsx(
              "flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left",
              "transition-micro hover:bg-surface-hover/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:pinned.jumpTo", {
              defaultValue: "Đi tới tin nhắn",
            })}
          >
            <Pin className="h-5 w-5 shrink-0 text-brand-solid" strokeWidth={1.8} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] font-semibold leading-5 text-brand-solid">
                {t("chat:pinned.title", { defaultValue: "Tin nhắn ghim" })}
              </span>
              <span className="truncate text-[13px] leading-5 text-text-secondary">
                {senderName ? (
                  <span className="font-medium text-text-primary">
                    {senderName}:{" "}
                  </span>
                ) : null}
                {preview}
              </span>
            </span>
          </button>

          {onOpenList && (
            <button
              type="button"
              onClick={onOpenList}
              className={clsx(
                "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold text-white",
                "bg-brand-solid transition-micro hover:brightness-105 active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/40",
              )}
              aria-label={t("chat:pinned.title", {
                defaultValue: "Tin nhắn ghim",
              })}
            >
              {count}
            </button>
          )}
        </div>
    </div>
  );
};

export default PinnedMessageBar;
