import React, { useState, useEffect, useMemo, useCallback } from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { Modal, Skeleton } from "../../ui";
import {
  useGetConversationMediaQuery,
  useGetConversationFilesQuery,
  useGetConversationLinksQuery,
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
import { downloadResourceWithName } from "../../../utils/downloadFile";
import { resolvePublicResourceUrl } from "../../../config";
import { fetchThumbnailUrlsShared } from "../../../hooks/useBatchThumbnailUrl";
import { ImagePreviewModal } from "../../modals/ImagePreviewModal";
import { VideoPlayerModal } from "./VideoPlayerModal";
import { FileName } from "../../common/FileName";
import { MediaThumbnail } from "../../common/MediaThumbnail";
import { useResolvedName } from "../../../stores/enrichedProfileStore";

export type SharedContentTab = "media" | "files" | "links";

interface SharedContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  defaultTab?: SharedContentTab;
}

interface SharedContentPanelProps {
  conversationId: string;
  defaultTab?: SharedContentTab;
  onBack: () => void;
}

const MODAL_MEDIA_PAGE_SIZE = 18;
const MODAL_FILES_PAGE_SIZE = 15;
const MODAL_LINKS_PAGE_SIZE = 15;

export const SharedContentModal: React.FC<SharedContentModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  defaultTab = "media",
}) => {
  const [activeTab, setActiveTab] = useState<SharedContentTab>(defaultTab);
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; alt?: string }>;
    index: number;
  } | null>(null);
  const [video, setVideo] = useState<{ url: string; fileName?: string } | null>(
    null,
  );

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
              onImageOpen={(index, images) => setLightbox({ images, index })}
              onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
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
        isOpen={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={lightbox?.images}
        initialIndex={lightbox?.index ?? 0}
      />

      <VideoPlayerModal
        isOpen={video !== null}
        onClose={() => setVideo(null)}
        url={video?.url ?? null}
        fileName={video?.fileName}
      />
    </>
  );
};

export const SharedContentPanel: React.FC<SharedContentPanelProps> = ({
  conversationId,
  defaultTab = "media",
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<SharedContentTab>(defaultTab);
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; alt?: string }>;
    index: number;
  } | null>(null);
  const [video, setVideo] = useState<{ url: string; fileName?: string } | null>(
    null,
  );

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, conversationId]);

  const tabs: { key: SharedContentTab; label: string }[] = [
    { key: "media", label: "Ảnh/Video" },
    { key: "files", label: "Files" },
    { key: "links", label: "Links" },
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="app-page-header sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="icon-button-surface h-9 w-9"
          aria-label="Quay lại"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h3 className="text-title-sm text-text-primary">Kho lưu trữ</h3>
        <button
          type="button"
          className="h-9 px-2 text-sm font-semibold text-text-primary"
        >
          Chọn
        </button>
      </div>

      <div className="flex shrink-0 border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              "flex h-14 flex-1 items-center justify-center border-b-2 text-[15px] font-semibold transition-colors",
              activeTab === tab.key
                ? "border-[#0068ff] text-[#005ae0]"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "media" && (
          <ModalMediaTab
            conversationId={conversationId}
            onImageOpen={(index, images) => setLightbox({ images, index })}
            onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
          />
        )}
        {activeTab === "files" && (
          <ModalFilesTab conversationId={conversationId} />
        )}
        {activeTab === "links" && (
          <ModalLinksTab conversationId={conversationId} />
        )}
      </div>

      <ImagePreviewModal
        isOpen={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={lightbox?.images}
        initialIndex={lightbox?.index ?? 0}
      />

      <VideoPlayerModal
        isOpen={video !== null}
        onClose={() => setVideo(null)}
        url={video?.url ?? null}
        fileName={video?.fileName}
      />
    </div>
  );
};

// ─── Modal Media Tab ──────────────────────────────────────────────────────────

const ModalMediaTab: React.FC<{
  conversationId: string;
  onImageOpen: (index: number, images: Array<{ url: string; alt?: string }>) => void;
  onVideoOpen: (url: string, fileName?: string) => void;
}> = ({ conversationId, onImageOpen, onVideoOpen }) => {
  const [page, setPage] = useState(1);
  const [urlCache, setUrlCache] = useState<{
    forConversationId: string;
    urls: Record<string, string>;
  }>({ forConversationId: conversationId, urls: {} });

  const { data, isLoading, isFetching } = useGetConversationMediaQuery(
    { conversationId, page, limit: MODAL_MEDIA_PAGE_SIZE },
    { skip: !conversationId },
  );

  const hasNext = data?.pagination.hasNext ?? false;

  // Memoize items to create stable reference
  const items = useMemo(() => {
    return data?.data ?? [];
  }, [data?.data]);

  // Memoize thumbnailUrls to ensure stable reference
  const thumbnailUrls = useMemo(() => {
    return urlCache.forConversationId === conversationId ? urlCache.urls : {};
  }, [urlCache.forConversationId, conversationId, urlCache.urls]);

  // Create stable request key from items
  const itemsKey = useMemo(() => {
    if (items.length === 0) return null;
    return `${conversationId}:page${page}:${items.map((i) => i.fileId).sort().join("|")}`;
  }, [conversationId, page, items]);

  // Reset page and cache when conversation changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setUrlCache({ forConversationId: conversationId, urls: {} });
  }, [conversationId]);

  // Batch thumbnail loading — delegates to the SHARED thumbnail cache/dedupe so
  // files already resolved in the timeline (or the drawer preview) are reused
  // instead of minting a fresh presigned URL here.
  useEffect(() => {
    if (!itemsKey) return;

    const needingFallback = items.filter(
      (item) => !item.thumbnailUrl && !thumbnailUrls[item.fileId],
    );
    if (needingFallback.length === 0) return;

    let cancelled = false;
    void fetchThumbnailUrlsShared(
      conversationId,
      needingFallback.map((i) => i.fileId),
    )
      .then((resolved) => {
        if (cancelled) return;
        const newUrls: Record<string, string> = {};
        for (const [fileId, item] of Object.entries(resolved)) {
          // item.url is already resolved against FILE_BASE_URL by the shared layer.
          if (item.url) newUrls[fileId] = item.url;
        }
        if (Object.keys(newUrls).length === 0) return;

        setUrlCache((prev) => ({
          forConversationId: conversationId,
          urls:
            prev.forConversationId === conversationId
              ? { ...prev.urls, ...newUrls }
              : newUrls,
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, conversationId]);

  // Pre-resolve all URLs for gallery navigation — include all items (even those without a
  // resolved URL yet) so that indices stay stable as thumbnails arrive asynchronously.
  const gallery = useMemo(
    () =>
      items.map((item) => {
        const raw = item.thumbnailUrl ?? thumbnailUrls[item.fileId] ?? null;
        const url = raw ? (resolvePublicResourceUrl(raw, { context: "image" }) ?? "") : "";
        return { url, alt: item.fileName, fileId: item.fileId };
      }),
    [items, thumbnailUrls],
  );

  const handleThumbClick = useCallback(
    (clickedFileId: string, clickedUrl: string) => {
      // Match by fileId first (stable); fall back to URL comparison
      let idx = gallery.findIndex((img) => img.fileId === clickedFileId);
      if (idx < 0) idx = gallery.findIndex((img) => img.url === clickedUrl);
      const galleryForModal = gallery.map(({ url, alt }) => ({ url, alt }));
      onImageOpen(idx >= 0 ? idx : 0, galleryForModal);
    },
    [gallery, onImageOpen],
  );

  if (isLoading) {
    return (
      <div className="p-4">
        <ResourceFilterBar />
        <div className="mt-6 grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4">
        <ResourceFilterBar />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
          <PhotoIcon className="h-12 w-12" />
          <p className="text-sm">Chưa có ảnh hoặc video nào được chia sẻ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ResourceFilterBar />
      <h4 className="mt-6 text-base font-semibold text-text-primary">
        Ngày {new Date(items[0]?.createdAt ?? Date.now()).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "long",
        })}
      </h4>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map((item) => (
          <ModalMediaThumb
            key={`${item.messageId}-${item.fileId}`}
            conversationId={conversationId}
            item={item}
            fallbackUrl={thumbnailUrls[item.fileId] ?? null}
            onImageClick={(url) => handleThumbClick(item.fileId, url)}
            onVideoOpen={onVideoOpen}
          />
        ))}
      </div>
      {isFetching && (
        <div className="mt-2 grid grid-cols-3 gap-2">
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

const ResourceFilterBar: React.FC = () => (
  <div className="flex items-center gap-3">
    {["Người gửi", "Ngày gửi"].map((label) => (
      <button
        key={label}
        type="button"
        className="inline-flex h-8 min-w-[132px] items-center justify-between gap-2 rounded-full bg-[#e8eaee] px-4 text-sm font-medium text-text-secondary"
      >
        <span>{label}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </button>
    ))}
  </div>
);

const ModalMediaThumb: React.FC<{
  conversationId: string;
  item: ConversationResourcesMediaItem;
  fallbackUrl: string | null;
  onImageClick: (url: string) => void;
  onVideoOpen: (url: string, fileName?: string) => void;
}> = React.memo(({ conversationId, item, fallbackUrl, onImageClick, onVideoOpen }) => {
  const isVideo =
    item.mimeType.startsWith("video/") || item.messageType === "video";
  const rawSrc = item.thumbnailUrl ?? fallbackUrl ?? null;
  const src = rawSrc ? (resolvePublicResourceUrl(rawSrc, { context: "image" }) ?? null) : null;
  const canOpen = true;

  const handleClick = async () => {
    // Videos must be played from their resolved source — the thumbnail (src) is
    // only a still image, so routing it to the image lightbox shows a frozen
    // frame that can't be played.
    if (isVideo) {
      try {
        const res = await fileApi.getDownloadUrl({
          conversationId,
          attachmentId: item.fileId,
        });
        const payload = unwrapApiSuccess(res);
        if (payload.url) onVideoOpen(payload.url, item.fileName);
      } catch {
        // Stable fallback stays visible; user can retry by clicking the tile.
      }
      return;
    }
    if (src) onImageClick(src);
  };

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => void handleClick()}
      className={clsx(
        "group relative aspect-square overflow-hidden rounded-md bg-surface-overlay",
        canOpen && "cursor-pointer hover:ring-2 hover:ring-primary/50",
      )}
      aria-label={item.fileName}
    >
      <MediaThumbnail
        attachment={item}
        src={src}
        variant="grid"
        imageClassName="transition-transform duration-200 group-hover:scale-105"
      />
    </button>
  );
});

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
  const senderName = useResolvedName(item.senderId, item.senderName);
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
        await downloadResourceWithName(payload.url, item.fileName);
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
      <FileTypeIcon
        type={iconType}
        fileName={item.fileName}
        variant="tile"
        className="h-10 w-10 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <FileName
          name={item.fileName}
          className="text-sm font-medium text-text-primary"
        />
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {senderName} · {date}
        </p>
      </div>
    </button>
  );
};

// ─── Modal Links Tab ──────────────────────────────────────────────────────────

const ModalLinksTab: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 200);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [conversationId, debouncedSearch]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSearchInput(""); }, [conversationId]);

  const { data, isLoading, isFetching } = useGetConversationLinksQuery(
    { conversationId, page, limit: MODAL_LINKS_PAGE_SIZE },
    { skip: !conversationId },
  );

  const hasNext = data?.pagination.hasNext ?? false;
  const items = (data?.data ?? []).filter((item) => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return true;
    return item.domain.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <LinkSearchBar value={searchInput} onChange={setSearchInput} />
        <ResourceFilterBar />
        <div className="mt-6 space-y-2">
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
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4">
        <LinkSearchBar value={searchInput} onChange={setSearchInput} />
        <ResourceFilterBar />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
          <LinkIcon className="h-12 w-12" />
          <p className="text-sm">
            {debouncedSearch ? "Không tìm thấy link phù hợp" : "Chưa có liên kết nào được chia sẻ"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <LinkSearchBar value={searchInput} onChange={setSearchInput} />
      <ResourceFilterBar />
      <h4 className="mt-4 text-base font-semibold text-text-primary">
        Ngày {new Date(items[0]?.createdAt ?? Date.now()).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "long",
        })}
      </h4>
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

const LinkSearchBar: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <div className="relative mb-4">
    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Tìm kiếm link"
      className="h-9 w-full rounded-full border border-border bg-surface pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-[#0068ff] focus:outline-none focus:ring-2 focus:ring-[#0068ff]/15"
    />
  </div>
);

const ModalLinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({
  item,
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));
  const senderName = useResolvedName(item.senderId, item.senderName);

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
          {senderName} · {date}
        </p>
      </div>
    </a>
  );
};
