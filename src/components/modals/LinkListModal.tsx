import React, { useState } from "react";
import { Modal } from "../ui";
import { LinkIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "../ui";
import { formatRelativeDate } from "../../utils/formatTime";
import { useGetConversationLinksQuery } from "../../features/api/chatApi";
import type { ConversationResourcesLinkItem } from "../../features/api/chatApi";

interface LinkListModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  initialTotal: number;
}

const PAGE_SIZE = 20;

export const LinkListModal: React.FC<LinkListModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  initialTotal,
}) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useGetConversationLinksQuery(
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
      title={`Link (${total})`}
      size="lg"
    >
      {isLoading || isFetching ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
          <LinkIcon className="h-10 w-10" />
          <p className="text-sm">Chưa có link nào được chia sẻ</p>
        </div>
      ) : (
        <div className="px-2 pb-4">
          <div className="space-y-1">
            {items.map((item) => (
              <LinkRow key={item.messageId} item={item} />
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

const LinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({ item }) => {
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover"
    >
      <div className="shrink-0 rounded-md bg-primary/10 p-2">
        <LinkIcon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.domain}</p>
        <p className="truncate text-xs text-primary">{item.url}</p>
        <p className="text-xs text-text-muted">
          {item.senderName} · {date}
        </p>
      </div>
    </a>
  );
};
