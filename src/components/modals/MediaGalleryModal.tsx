import React, { useState } from "react";
import { Modal } from "../ui";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "../ui";
import { useGetConversationMediaQuery } from "../../features/api/chatApi";
import type { ConversationResourcesMediaItem } from "../../features/api/chatApi";

interface MediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  initialTotal: number;
}

const PAGE_SIZE = 18;

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  initialTotal,
}) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useGetConversationMediaQuery(
    { conversationId, page, limit: PAGE_SIZE },
    { skip: !isOpen },
  );

  const total = data?.pagination.total ?? initialTotal;
  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ảnh & Video (${total})`}
      size="xl"
    >
      {isLoading ? (
        <div className="grid grid-cols-3 gap-1 p-2">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
          <PhotoIcon className="h-10 w-10" />
          <p className="text-sm">Chưa có ảnh hoặc video nào</p>
        </div>
      ) : (
        <div className="p-2">
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
            {items.map((item) => (
              <GalleryThumb key={`${item.messageId}-${item.fileId}`} item={item} />
            ))}
          </div>
          {(hasNext || page > 1) && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page === 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-hover"
              >
                Trước
              </button>
              <span className="text-sm text-text-muted">Trang {page}</span>
              <button
                type="button"
                disabled={!hasNext || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-hover"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const GalleryThumb: React.FC<{ item: ConversationResourcesMediaItem }> = ({ item }) => {
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
          <div className="h-7 w-7 rounded-full bg-white/80 flex items-center justify-center">
            <span className="ml-0.5 border-y-[5px] border-l-[9px] border-r-0 border-y-transparent border-l-text-primary" />
          </div>
        </div>
      )}
    </div>
  );
};
