import React from "react";
import { LinkIcon } from "@heroicons/react/24/outline";
import { formatRelativeDate } from "../../../utils/formatTime";
import type { ConversationResourcesLinkItem } from "../../../features/api/chatApi";

interface LinkSectionProps {
  items: ConversationResourcesLinkItem[];
  total: number;
  onViewAll: () => void;
}

export const LinkSection: React.FC<LinkSectionProps> = ({ items, total, onViewAll }) => {
  if (items.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Link
        </span>
        {total > items.length && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-primary hover:underline"
          >
            Xem tất cả ({total})
          </button>
        )}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <LinkRow key={item.messageId} item={item} />
        ))}
      </div>
    </div>
  );
};

const LinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({ item }) => {
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover"
    >
      <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
        <LinkIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.domain}</p>
        <p className="truncate text-xs text-text-muted">{item.url}</p>
        <p className="text-xs text-text-muted">{date}</p>
      </div>
    </a>
  );
};
