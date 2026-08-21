import React from "react";
import clsx from "clsx";
import { CloudIcon as Cloud } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../../../utils/formatTime";
import type { CloudItem } from "../types";
import { getCloudItemPreview, getCloudItemTitle } from "../utils/cloudFormat";
import { ConversationItemMenu } from "../../../components/layout/sidebar/RoomItem";
import { useUIStore } from "../../../stores/uiStore";
import { CLOUD_CONVERSATION_ID } from "../constants";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface CloudConversationEntryProps {
  items?: CloudItem[];
  isActive?: boolean;
  layoutState?: ChatLayoutState;
  onSelect: () => void;
}

export const CloudConversationAvatar: React.FC<{
  size?: "sm" | "md" | "lg";
}> = ({ size = "md" }) => (
  <span
    className={clsx(
      "inline-flex shrink-0 items-center justify-center rounded-full border border-[#1976D2]/20 bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] text-[#1565C0] shadow-sm",
      size === "sm"
        ? "h-[34px] w-[34px]"
        : size === "lg"
          ? "h-16 w-16"
          : "h-10 w-10",
    )}
    aria-hidden
  >
    <Cloud
      className={
        size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5"
      }
    />
  </span>
);

export const CloudConversationEntry: React.FC<CloudConversationEntryProps> = ({
  items = [],
  isActive = false,
  layoutState = "normal",
  onSelect,
}) => {
  const { t } = useTranslation("cloud");
  const isPinned = useUIStore((state) =>
    state.pinnedConversationIds.includes(CLOUD_CONVERSATION_ID),
  );
  const togglePinnedConversation = useUIStore(
    (state) => state.togglePinnedConversation,
  );
  const latestItem = items[0];
  const preview = latestItem
    ? getCloudItemPreview(latestItem) ||
      getCloudItemTitle(latestItem, {
        text: t("item.untitledText"),
        link: t("item.untitledLink"),
        file: t("item.untitledFile"),
      })
    : t("workspace.sidebarPreview");
  const timeLabel = latestItem
    ? formatRelativeTime(new Date(latestItem.createdAt))
    : "";
  const isDense = layoutState !== "normal";

  return (
      <button
        type="button"
        role="option"
        aria-selected={isActive}
        onClick={onSelect}
        className={clsx(
          "group relative mx-1 flex h-[var(--size-room-item)] w-[calc(100%-0.5rem)] shrink-0 items-center text-left",
          "transition-micro active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          isDense ? "rounded-md px-2" : "rounded-lg px-2.5",
          isActive
            ? "bg-[#1565C0]/20 ring-1 ring-inset ring-[#1976D2]/40"
            : "hover:bg-surface-hover/70",
        )}
        aria-label={t("workspace.title")}
      >
        <div
          className={clsx(
            "grid w-full grid-cols-[auto,1fr,auto] items-center",
            isDense ? "gap-2" : "gap-2.5",
          )}
        >
          <CloudConversationAvatar />
          <div className="min-w-0">
            <p
              className={clsx(
                "truncate font-medium",
                isDense
                  ? "text-[13px] leading-[1.05rem]"
                  : "text-[14px] leading-[1.1rem]",
                isActive ? "font-bold text-[#0D3F7A]" : "text-text-primary",
              )}
            >
              {t("workspace.title")}
            </p>
            <p
              className={clsx(
                "mt-0.5 truncate pr-1",
                isDense
                  ? "text-[11px] leading-[0.95rem]"
                  : "text-[12px] leading-[1rem]",
                isActive ? "font-medium text-text-primary" : "text-text-muted",
              )}
              title={preview}
            >
              {preview}
            </p>
          </div>
          <div
            className={clsx(
              "flex h-full min-w-room-meta flex-col items-end justify-center",
              isDense ? "gap-1" : "gap-1.5",
            )}
          >
            <ConversationItemMenu
              isPinned={isPinned}
              onTogglePin={() =>
                togglePinnedConversation(CLOUD_CONVERSATION_ID)
              }
            />
            <span className="text-right text-[11px] font-medium text-text-muted">
              {timeLabel}
            </span>
          </div>
        </div>
      </button>
  );
};

export default CloudConversationEntry;
