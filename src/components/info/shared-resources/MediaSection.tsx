import React from "react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import type { ConversationResourcesMediaItem } from "../../../features/api/chatApi";

interface MediaSectionProps {
  items: ConversationResourcesMediaItem[];
  total: number;
  onViewAll: () => void;
}

export const MediaSection: React.FC<MediaSectionProps> = ({ items, total, onViewAll }) => {
  if (items.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Ảnh &amp; Video
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
      <div className="grid grid-cols-3 gap-1">
        {items.map((item) => (
          <MediaThumb key={`${item.messageId}-${item.fileId}`} item={item} />
        ))}
      </div>
    </div>
  );
};

const MediaThumb: React.FC<{ item: ConversationResourcesMediaItem }> = ({ item }) => {
  const src = item.thumbnailUrl ?? undefined;
  const isVideo = item.messageType === "video";

  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-surface-overlay">
      {src ? (
        <img
          src={src}
          alt={item.fileName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PhotoIcon className="h-6 w-6 text-text-muted" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-6 w-6 rounded-full bg-white/80 flex items-center justify-center">
            <span className="ml-0.5 border-y-[5px] border-l-[8px] border-r-0 border-y-transparent border-l-text-primary" />
          </div>
        </div>
      )}
    </div>
  );
};
