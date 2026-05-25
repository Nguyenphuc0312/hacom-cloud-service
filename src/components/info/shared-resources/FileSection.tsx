import React from "react";
import { formatFileSize } from "../../../utils/formatFileSize";
import { getFileIconType } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../message/FileTypeIcon";
import { formatRelativeDate } from "../../../utils/formatTime";
import type { ConversationResourcesFileItem } from "../../../features/api/chatApi";

interface FileSectionProps {
  items: ConversationResourcesFileItem[];
  total: number;
  onViewAll: () => void;
}

export const FileSection: React.FC<FileSectionProps> = ({ items, total, onViewAll }) => {
  if (items.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          File
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
          <FileRow key={`${item.messageId}-${item.fileId}`} item={item} />
        ))}
      </div>
    </div>
  );
};

const FileRow: React.FC<{ item: ConversationResourcesFileItem }> = ({ item }) => {
  const iconType = getFileIconType(item.mimeType, item.fileName);
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover">
      <div className="shrink-0">
        <FileTypeIcon type={iconType} className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.fileName}</p>
        <p className="text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {date}
        </p>
      </div>
    </div>
  );
};
