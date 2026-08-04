import React from "react";
import clsx from "clsx";
import { Cloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "../../../utils/formatTime";
import type { CloudItem } from "../types";
import {
  getCloudItemPreview,
  getCloudItemTitle,
} from "../utils/cloudFormat";

interface CloudConversationEntryProps {
  items?: CloudItem[];
  isActive?: boolean;
  onSelect: () => void;
}

export const CloudConversationAvatar: React.FC<{
  size?: "sm" | "md";
}> = ({ size = "md" }) => (
  <span
    className={clsx(
      "inline-flex shrink-0 items-center justify-center rounded-full border border-[#1976D2]/20 bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] text-[#1565C0] shadow-sm",
      size === "sm" ? "h-[34px] w-[34px]" : "h-10 w-10",
    )}
    aria-hidden
  >
    <Cloud className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
  </span>
);

export const CloudConversationEntry: React.FC<
  CloudConversationEntryProps
> = ({ items = [], isActive = false, onSelect }) => {
  const { t } = useTranslation("cloud");
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

  return (
    <div className="shrink-0 pb-0.5">
      <button
        type="button"
        role="option"
        aria-selected={isActive}
        onClick={onSelect}
        className={clsx(
          "group relative mx-1 flex h-[var(--size-room-item)] w-[calc(100%-0.5rem)] items-center rounded-lg px-2.5 text-left",
          "transition-micro active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          isActive
            ? "bg-[#1565C0]/20 ring-1 ring-inset ring-[#1976D2]/40"
            : "hover:bg-surface-hover/70",
        )}
        aria-label={t("workspace.title")}
      >
        <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-2.5">
          <CloudConversationAvatar />
          <div className="min-w-0">
            <p
              className={clsx(
                "truncate text-[14px] font-medium leading-[1.1rem]",
                isActive ? "font-bold text-[#0D3F7A]" : "text-text-primary",
              )}
            >
              {t("workspace.title")}
            </p>
            <p
              className={clsx(
                "mt-0.5 truncate pr-1 text-[12px] leading-[1rem]",
                isActive
                  ? "font-medium text-text-primary"
                  : "text-text-muted",
              )}
              title={preview}
            >
              {preview}
            </p>
          </div>
          <span className="min-w-room-meta text-right text-[11px] font-medium text-text-muted">
            {timeLabel}
          </span>
        </div>
      </button>
      <div className="mx-3 h-px bg-border/45" aria-hidden />
    </div>
  );
};

export default CloudConversationEntry;
