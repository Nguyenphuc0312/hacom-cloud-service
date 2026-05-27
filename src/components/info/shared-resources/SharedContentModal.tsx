import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Modal, Skeleton } from "../../ui";
import {
  useGetConversationMediaQuery,
  useGetConversationFilesQuery,
  useGetConversationLinksQuery,
  useBatchThumbnailUrlsMutation,
} from "../../../features/api/chatApi";
import type {
  ConversationResourcesMediaItem,
  ConversationResourcesFileItem,
  ConversationResourcesLinkItem,
} from "../../../features/api/chatApi";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../message/FileTypeIcon";
import { formatRelativeDate } from "../../../utils/formatTime";
import { fileApi } from "../../../services/api";
import { useDebounce } from "../../../hooks/useDebounce";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { ImagePreviewModal } from "../../modals/ImagePreviewModal";

export type SharedContentTab = "media" | "files" | "links";

interface SharedContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  defaultTab?: SharedContentTab;
}

const MODAL_MEDIA_PAGE_SIZE = 18;
const MODAL_FILES_PAGE_SIZE = 15;
const MODAL_LINKS_PAGE_SIZE = 15;

function truncateFilename(name: string, maxLength = 32): string {
  if (name.length <= maxLength) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return name.slice(0, maxLength - 3) + "...";
  const ext = name.slice(dotIdx + 1);
  const base = name.slice(0, dotIdx);
  const keepBase = maxLength - ext.length - 4;
  if (keepBase <= 2) return name.slice(0, maxLength - 3) + "...";
  return `${base.slice(0, keepBase)}...${ext}`;
}

export const SharedContentModal: React.FC<SharedContentModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  defaultTab = "media",
}) => {
  const [activeTab, setActiveTab] = useState<SharedContentTab>(defaultTab);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setActiveTab(defaultTab);
  }, [isOpen, defaultTab]);

  const tabs: { key: SharedContentTab; label: string; icon: React.ReactNode }[] = [
    { key: "media", label: "Ảnh/Video", icon: <PhotoIcon className="h-4 w-4" /> },
    { key: "files", label: "File", icon: <DocumentIcon className="h-4 w-4" /> },
    { key: "links", label: "Link", icon: <LinkIcon className="h-4 w-4" /> },
  ];

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Kho lưu trữ" size="xl">
        {/* Tab Bar */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {activeTab === "media" && (
            <ModalMediaTab
              conversationId={conversationId}
              onImageClick={(url, alt) => { setLightboxUrl(url); setLightboxAlt(alt); }}
            />
          )}
          {activeTab === "files" && (
            <ModalFilesTab conversationId={conversationId} />
          )}
          {activeTab === "links" && (
            <ModalLinksTab conversationId={conversationId} />
          )}
        </div>
      </Modal>

      <ImagePreviewModal
        isOpen={lightboxUrl !== null}
        onClose={() => setLightboxUrl(null)}
        imageUrl={lightboxUrl ?? ""}
        alt={lightboxAlt}
      />
    </>
  );
};

// ─── Modal Media Tab ──────────────────────────────────────────────────────────

const ModalMediaTab: React.FC<{
  conversationId: string;
  onImageClick: (url: string, alt: string) => void;
}> = ({ conversationId, onImageClick }) => {
  const [page, setPage] = useState(1);
  const [urlCache, setUrlCache] = useState<{
    forConversationId: string;
    urls: Record<string, string>;
  }>({ forConversationId: conversationId, urls: {} });
  const [batchThumbnailUrls] = useBatchThumbnailUrlsMutation();
  const batchAbortRef = useRef<AbortController | null>(null);

  const { data, isLoading, isFetching } = useGetConversationMediaQuery(
    { conversationId, page, limit: MODAL_MEDIA_PAGE_SIZE },
    { skip: !conversationId },
  );

  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];
  const thumbnailUrls =
    urlCache.forConversationId === conversationId ? urlCache.urls : {};

  useEffect(() => {
    const needingFallback = items.filter(
      (item) => !item.thumbnailUrl && !thumbnailUrls[item.fileId],
    );
    if (needingFallback.length === 0) return;

    const controller = new AbortController();
    batchAbortRef.current = controller;

    batchThumbnailUrls({
      conversationId,
      fileIds: needingFallback.map((i) => i.fileId),
    })
      .unwrap()
      .then((result) => {
        if (controller.signal.aborted) return;
        const newUrls: Record<string, string> = {};
        for (const item of result.items) {
          if (item.status === "ok" && item.url) newUrls[item.fileId] = item.url;
        }
        if (Object.keys(newUrls).length > 0) {
          setUrlCache((prev) => ({
            forConversationId: conversationId,
            urls:
              prev.forConversationId === conversationId
                ? { ...prev.urls, ...newUrls }
                : newUrls,
          }));
        }
      })
      .catch(() => {});

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, conversationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setUrlCache({ forConversationId: conversationId, urls: {} });
    return () => { batchAbortRef.current?.abort(); };
  }, [conversationId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
        <PhotoIcon className="h-12 w-12" />
        <p className="text-sm">Chưa có ảnh hoặc video nào được chia sẻ</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {items.map((item) => (
          <ModalMediaThumb
            key={`${item.messageId}-${item.fileId}`}
            item={item}
            fallbackUrl={thumbnailUrls[item.fileId] ?? null}
            onImageClick={onImageClick}
          />
        ))}
      </div>
      {isFetching && (
        <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      )}
      {(hasNext || page > 1) && !isFetching && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-sm text-text-muted">Trang {page}</span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
};

const ModalMediaThumb: React.FC<{
  item: ConversationResourcesMediaItem;
  fallbackUrl: string | null;
  onImageClick: (url: string, alt: string) => void;
}> = ({ item, fallbackUrl, onImageClick }) => {
  const isVideo =
    item.mimeType.startsWith("video/") || item.messageType === "video";
  const src = item.thumbnailUrl ?? fallbackUrl ?? null;

  return (
    <button
      type="button"
      disabled={!src}
      onClick={() => { if (src) onImageClick(src, item.fileName); }}
      className={clsx(
        "group relative aspect-square overflow-hidden rounded-md bg-surface-overlay",
        src && "cursor-pointer hover:ring-2 hover:ring-primary/50",
      )}
      aria-label={item.fileName}
    >
      {src ? (
        <img
          src={src}
          alt={item.fileName}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PhotoIcon className="h-6 w-6 text-text-muted" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80">
            <span className="ml-0.5 border-y-[5px] border-l-[9px] border-y-transparent border-l-text-primary" />
          </div>
        </div>
      )}
    </button>
  );
};

// ─── Modal Files Tab ──────────────────────────────────────────────────────────

const ModalFilesTab: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); setSearchInput(""); }, [conversationId]);

  const { data, isLoading, isFetching } = useGetConversationFilesQuery(
    {
      conversationId,
      page,
      limit: MODAL_FILES_PAGE_SIZE,
      q: debouncedSearch || undefined,
    },
    { skip: !conversationId },
  );

  const hasNext = data?.pagination.hasNext ?? false;
  const rawItems = data?.data ?? [];
  const items = rawItems.filter(
    (f) =>
      !f.mimeType.startsWith("image/") &&
      !f.mimeType.startsWith("video/") &&
      !f.mimeType.startsWith("audio/"),
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Tìm kiếm file..."
          className="w-full rounded-xl border border-border bg-surface-overlay py-2 pl-10 pr-3 text-sm placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Content */}
      {isLoading || isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
          <DocumentIcon className="h-12 w-12" />
          <p className="text-sm">
            {debouncedSearch
              ? "Không tìm thấy file phù hợp"
              : "Chưa có file nào được chia sẻ"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-0.5">
            {items.map((item) => (
              <ModalFileRow
                key={`${item.messageId}-${item.fileId}`}
                item={item}
                conversationId={conversationId}
              />
            ))}
          </div>
          {(hasNext || page > 1) && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page === 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
              >
                Trước
              </button>
              <span className="text-sm text-text-muted">Trang {page}</span>
              <button
                type="button"
                disabled={!hasNext || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ModalFileRow: React.FC<{
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
      // silent
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      title={item.fileName}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
    >
      <FileTypeIcon type={iconType} className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {truncateFilename(item.fileName)}
        </p>
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {item.senderName} · {date}
        </p>
      </div>
    </button>
  );
};

// ─── Modal Links Tab ──────────────────────────────────────────────────────────

const ModalLinksTab: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [page, setPage] = useState(1);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [conversationId]);

  const { data, isLoading, isFetching } = useGetConversationLinksQuery(
    { conversationId, page, limit: MODAL_LINKS_PAGE_SIZE },
    { skip: !conversationId },
  );

  const hasNext = data?.pagination.hasNext ?? false;
  const items = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
        <LinkIcon className="h-12 w-12" />
        <p className="text-sm">Chưa có liên kết nào được chia sẻ</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="space-y-0.5">
        {items.map((item) => (
          <ModalLinkRow key={item.messageId} item={item} />
        ))}
      </div>
      {(hasNext || page > 1) && !isFetching && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-sm text-text-muted">Trang {page}</span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
};

const ModalLinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({
  item,
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-hover"
    >
      <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
        <LinkIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {item.domain}
        </p>
        <p className="truncate text-xs text-primary">{item.url}</p>
        <p className="truncate text-xs text-text-muted">
          {item.senderName} · {date}
        </p>
      </div>
    </a>
  );
};
