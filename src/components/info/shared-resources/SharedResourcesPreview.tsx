import React, { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { Skeleton } from "../../ui";
import {
  useGetConversationSidebarSummaryQuery,
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
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { ImagePreviewModal } from "../../modals/ImagePreviewModal";
import { SharedContentModal } from "./SharedContentModal";
import type { SharedContentTab } from "./SharedContentModal";

interface SharedResourcesPreviewProps {
  conversationId: string;
}

const DRAWER_MEDIA_PREVIEW = 6;
const DRAWER_FILES_PREVIEW = 4;
const DRAWER_LINKS_PREVIEW = 3;

function truncateFilename(name: string, maxLength = 24): string {
  if (name.length <= maxLength) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return name.slice(0, maxLength - 3) + "...";
  const ext = name.slice(dotIdx + 1);
  const base = name.slice(0, dotIdx);
  const keepBase = maxLength - ext.length - 4;
  if (keepBase <= 2) return name.slice(0, maxLength - 3) + "...";
  return `${base.slice(0, keepBase)}...${ext}`;
}

export const SharedResourcesPreview: React.FC<SharedResourcesPreviewProps> = ({
  conversationId,
}) => {
  const [activeTab, setActiveTab] = useState<SharedContentTab>("media");
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState("");

  const [urlCache, setUrlCache] = useState<{
    forConversationId: string;
    urls: Record<string, string>;
  }>({ forConversationId: conversationId, urls: {} });
  const [batchThumbnailUrls] = useBatchThumbnailUrlsMutation();
  const batchAbortRef = useRef<AbortController | null>(null);

  const { data, isLoading, isError } = useGetConversationSidebarSummaryQuery(
    conversationId,
    { skip: !conversationId },
  );

  const mediaTotal = data?.media.total ?? 0;
  const filesTotal = data?.files.total ?? 0;
  const linksTotal = data?.links.total ?? 0;
  const totalAll = mediaTotal + filesTotal + linksTotal;

  const mediaPreview = data?.media.preview.slice(0, DRAWER_MEDIA_PREVIEW) ?? [];
  const filesPreview = (data?.files.preview ?? [])
    .filter(
      (f) =>
        !f.mimeType.startsWith("image/") &&
        !f.mimeType.startsWith("video/") &&
        !f.mimeType.startsWith("audio/"),
    )
    .slice(0, DRAWER_FILES_PREVIEW);
  const linksPreview = data?.links.preview.slice(0, DRAWER_LINKS_PREVIEW) ?? [];

  const thumbnailUrls =
    urlCache.forConversationId === conversationId ? urlCache.urls : {};

  // Auto-select first non-empty tab once data arrives
  useEffect(() => {
    if (!data) return;
    const order: SharedContentTab[] = ["media", "files", "links"];
    const totals: Record<SharedContentTab, number> = {
      media: data.media.total,
      files: data.files.total,
      links: data.links.total,
    };
    if (totals[activeTab] === 0) {
      const fallback = order.find((t) => totals[t] > 0);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (fallback) setActiveTab(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Reset when conversation changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab("media");
    setUrlCache({ forConversationId: conversationId, urls: {} });
    return () => {
      batchAbortRef.current?.abort();
    };
  }, [conversationId]);

  // Batch thumbnail loading for drawer media preview (only when media tab is active)
  useEffect(() => {
    if (activeTab !== "media" || mediaPreview.length === 0) return;

    const needingFallback = mediaPreview.filter(
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
  }, [mediaPreview, conversationId, activeTab]);

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="border-t border-border px-3 py-3">
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">
        Không thể tải dữ liệu lưu trữ
      </div>
    );
  }

  if (!data || totalAll === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-8 text-text-muted">
        <PhotoIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có nội dung nào được chia sẻ</p>
      </div>
    );
  }

  const allTabs: { key: SharedContentTab; label: string; count: number }[] = [
    { key: "media", label: "Ảnh/Video", count: mediaTotal },
    { key: "files", label: "File", count: filesTotal },
    { key: "links", label: "Link", count: linksTotal },
  ];
  const tabs = allTabs.filter((t) => t.count > 0);

  const activeTabTotal =
    activeTab === "media"
      ? mediaTotal
      : activeTab === "files"
        ? filesTotal
        : linksTotal;

  const activeTabPreviewCount =
    activeTab === "media"
      ? DRAWER_MEDIA_PREVIEW
      : activeTab === "files"
        ? DRAWER_FILES_PREVIEW
        : DRAWER_LINKS_PREVIEW;

  const showViewAllFooter = activeTabTotal > activeTabPreviewCount;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Kho lưu trữ</h3>
        </div>

        {/* Tab Bar */}
        {tabs.length > 1 && (
          <div className="flex border-t border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-b-2 border-primary text-primary"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {tab.label}
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    activeTab === tab.key
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-overlay text-text-muted",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        <div className={clsx("p-3", tabs.length === 1 && "border-t border-border")}>
          {activeTab === "media" && (
            <DrawerMediaTab
              items={mediaPreview}
              total={mediaTotal}
              thumbnailUrls={thumbnailUrls}
              onImageClick={(url, alt) => {
                setLightboxUrl(url);
                setLightboxAlt(alt);
              }}
              onViewAll={() => {
                setActiveTab("media");
                setModalOpen(true);
              }}
            />
          )}
          {activeTab === "files" && (
            <DrawerFilesTab
              items={filesPreview}
              conversationId={conversationId}
            />
          )}
          {activeTab === "links" && (
            <DrawerLinksTab items={linksPreview} />
          )}
        </div>

        {/* View All Footer */}
        {showViewAllFooter && (
          <div className="border-t border-border">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full py-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            >
              Xem tất cả ({activeTabTotal})
            </button>
          </div>
        )}
      </div>

      <ImagePreviewModal
        isOpen={lightboxUrl !== null}
        onClose={() => setLightboxUrl(null)}
        imageUrl={lightboxUrl ?? ""}
        alt={lightboxAlt}
      />

      <SharedContentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        conversationId={conversationId}
        defaultTab={activeTab}
      />
    </>
  );
};

// ─── Drawer Media Tab ─────────────────────────────────────────────────────────

const DrawerMediaTab: React.FC<{
  items: ConversationResourcesMediaItem[];
  total: number;
  thumbnailUrls: Record<string, string>;
  onImageClick: (url: string, alt: string) => void;
  onViewAll: () => void;
}> = ({ items, total, thumbnailUrls, onImageClick, onViewAll }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
        <PhotoIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có ảnh hoặc video nào</p>
      </div>
    );
  }

  // When total > preview limit, replace last slot with "+N" overlay
  const showOverlay = total > DRAWER_MEDIA_PREVIEW;
  const visibleItems = showOverlay ? items.slice(0, DRAWER_MEDIA_PREVIEW - 1) : items;
  const overlayItem = showOverlay ? items[DRAWER_MEDIA_PREVIEW - 1] ?? null : null;
  const remainingCount = total - (DRAWER_MEDIA_PREVIEW - 1);

  return (
    <div className="grid grid-cols-3 gap-1">
      {visibleItems.map((item) => (
        <DrawerMediaThumb
          key={`${item.messageId}-${item.fileId}`}
          item={item}
          fallbackUrl={thumbnailUrls[item.fileId] ?? null}
          onImageClick={onImageClick}
        />
      ))}
      {showOverlay && (
        <button
          type="button"
          onClick={onViewAll}
          aria-label={`Xem thêm ${remainingCount} ảnh`}
          className="relative aspect-square overflow-hidden rounded-md bg-surface-overlay"
        >
          {overlayItem && (overlayItem.thumbnailUrl ?? thumbnailUrls[overlayItem.fileId]) ? (
            <img
              src={overlayItem.thumbnailUrl ?? thumbnailUrls[overlayItem.fileId]}
              alt={overlayItem.fileName}
              className="h-full w-full object-cover opacity-40"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-surface-overlay" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-base font-bold text-white">+{remainingCount}</span>
          </div>
        </button>
      )}
    </div>
  );
};

const DrawerMediaThumb: React.FC<{
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
      onClick={() => {
        if (src) onImageClick(src, item.fileName);
      }}
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
          <PhotoIcon className="h-5 w-5 text-text-muted" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80">
            <span className="ml-0.5 border-y-[5px] border-l-[9px] border-y-transparent border-l-text-primary" />
          </div>
        </div>
      )}
    </button>
  );
};

// ─── Drawer Files Tab ─────────────────────────────────────────────────────────

const DrawerFilesTab: React.FC<{
  items: ConversationResourcesFileItem[];
  conversationId: string;
}> = ({ items, conversationId }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
        <DocumentIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có file nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <DrawerFileRow
          key={`${item.messageId}-${item.fileId}`}
          item={item}
          conversationId={conversationId}
        />
      ))}
    </div>
  );
};

const DrawerFileRow: React.FC<{
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
      // silent — user can retry
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
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
    >
      <div className="shrink-0">
        <FileTypeIcon type={iconType} className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">
          {truncateFilename(item.fileName)}
        </p>
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {item.senderName} · {date}
        </p>
      </div>
    </button>
  );
};

// ─── Drawer Links Tab ─────────────────────────────────────────────────────────

const DrawerLinksTab: React.FC<{
  items: ConversationResourcesLinkItem[];
}> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
        <LinkIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có link nào được chia sẻ</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <DrawerLinkRow key={item.messageId} item={item} />
      ))}
    </div>
  );
};

const DrawerLinkRow: React.FC<{ item: ConversationResourcesLinkItem }> = ({
  item,
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
    >
      <div className="shrink-0 rounded-md bg-primary/10 p-2">
        <LinkIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.domain}</p>
        <p className="truncate text-xs text-primary">{item.url}</p>
        <p className="truncate text-xs text-text-muted">
          {item.senderName} · {date}
        </p>
      </div>
    </a>
  );
};
