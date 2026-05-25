import React, { useState } from "react";
import { Modal, Input } from "../ui";
import { DocumentIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Skeleton } from "../ui";
import { formatFileSize, getFileIconType } from "../../utils/formatFileSize";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { formatRelativeDate } from "../../utils/formatTime";
import { fileApi } from "../../services/api";
import { useGetConversationFilesQuery } from "../../features/api/chatApi";
import type { ConversationResourcesFileItem } from "../../features/api/chatApi";
import { useDebounce } from "../../hooks/useDebounce";
import { unwrapApiSuccess } from "../../lib/apiContract";

interface FileListModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  initialTotal: number;
}

const PAGE_SIZE = 20;

export const FileListModal: React.FC<FileListModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  initialTotal,
}) => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data, isLoading, isFetching } = useGetConversationFilesQuery(
    { conversationId, page, limit: PAGE_SIZE, q: debouncedSearch || undefined },
    { skip: !isOpen },
  );

  const total = data?.pagination.total ?? initialTotal;
  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setPage(1);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`File (${total})`}
      size="lg"
    >
      <div className="px-4 pt-2 pb-3">
        <Input
          type="text"
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Tìm kiếm file..."
          leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
        />
      </div>

      {isLoading || isFetching ? (
        <div className="space-y-1 px-4 pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
          <DocumentIcon className="h-10 w-10" />
          <p className="text-sm">
            {debouncedSearch ? "Không tìm thấy file phù hợp" : "Chưa có file nào"}
          </p>
        </div>
      ) : (
        <div className="px-2 pb-4">
          <div className="space-y-1">
            {items.map((item) => (
              <FileRow
                key={`${item.messageId}-${item.fileId}`}
                item={item}
                conversationId={conversationId}
              />
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

const FileRow: React.FC<{
  item: ConversationResourcesFileItem;
  conversationId: string;
}> = ({ item, conversationId }) => {
  const iconType = getFileIconType(item.mimeType, item.fileName);
  const date = formatRelativeDate(new Date(item.createdAt));
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fileApi.getDownloadUrl({
        conversationId,
        attachmentId: item.fileId,
      });
      const payload = unwrapApiSuccess(res);
      if (payload.url) {
        const a = document.createElement("a");
        a.href = payload.url;
        a.download = item.fileName;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover disabled:opacity-60"
    >
      <div className="shrink-0">
        <FileTypeIcon type={iconType} className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.fileName}</p>
        <p className="text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {item.senderName} · {date}
        </p>
      </div>
    </button>
  );
};
