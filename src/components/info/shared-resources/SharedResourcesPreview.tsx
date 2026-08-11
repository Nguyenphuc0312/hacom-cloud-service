import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Skeleton } from "../../ui";
import {
  useGetConversationSidebarSummaryQuery,
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
import { downloadResourceWithName } from "../../../utils/downloadFile";
import { resolvePublicResourceUrl } from "../../../config";
import { fetchThumbnailUrlsShared } from "../../../hooks/useBatchThumbnailUrl";
import { ImagePreviewModal } from "../../modals/ImagePreviewModal";
import { VideoPlayerModal } from "./VideoPlayerModal";
import { SharedContentModal } from "./SharedContentModal";
import type { SharedContentTab } from "./SharedContentModal";
import { FileName } from "../../common/FileName";
import { MediaThumbnail } from "../../common/MediaThumbnail";
import { useResolvedName } from "../../../stores/enrichedProfileStore";

interface SharedResourcesPreviewProps {
  conversationId: string;
  variant?: "card" | "zalo";
  onOpenAll?: (tab: SharedContentTab) => void;
}

const DRAWER_MEDIA_PREVIEW = 6;
const DRAWER_FILES_PREVIEW = 4;
const DRAWER_LINKS_PREVIEW = 3;

export const SharedResourcesPreview: React.FC<SharedResourcesPreviewProps> = ({
  conversationId,
  variant = "card",
  onOpenAll,
}) => {
  const [activeTab, setActiveTab] = useState<SharedContentTab>("media");
  const [modalOpen, setModalOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; alt?: string }>;
    index: number;
  } | null>(null);
  const [video, setVideo] = useState<{ url: string; fileName?: string } | null>(
    null,
  );

  const [urlCache, setUrlCache] = useState<{
    forConversationId: string;
    urls: Record<string, string>;
  }>({ forConversationId: conversationId, urls: {} });

  const { data, isLoading, isError } = useGetConversationSidebarSummaryQuery(
    conversationId,
    { skip: !conversationId },
  );

  const mediaTotal = data?.media.total ?? 0;
  const filesTotal = data?.files.total ?? 0;
  const linksTotal = data?.links.total ?? 0;
  const totalAll = mediaTotal + filesTotal + linksTotal;

  // Memoize mediaPreview to create stable reference
  // This prevents useEffect from re-firing when the array reference changes
  const mediaPreview = useMemo(() => {
    return data?.media.preview.slice(0, DRAWER_MEDIA_PREVIEW) ?? [];
  }, [data?.media.preview]);

  const filesPreview = useMemo(() => {
    return (data?.files.preview ?? [])
      .filter(
        (f) =>
          !f.mimeType.startsWith("image/") &&
          !f.mimeType.startsWith("video/") &&
          !f.mimeType.startsWith("audio/"),
      )
      .slice(0, DRAWER_FILES_PREVIEW);
  }, [data?.files.preview]);

  const linksPreview = useMemo(() => {
    return data?.links.preview.slice(0, DRAWER_LINKS_PREVIEW) ?? [];
  }, [data?.links.preview]);

  // Memoize thumbnailUrls to ensure stable reference
  const thumbnailUrls = useMemo(() => {
    return urlCache.forConversationId === conversationId ? urlCache.urls : {};
  }, [urlCache.forConversationId, conversationId, urlCache.urls]);

  // Create stable thumbnail file IDs key for deduplication
  const thumbnailFileIdsKey = useMemo(() => {
    if (mediaPreview.length === 0) return null;
    return mediaPreview.map((item) => item.fileId).sort().join("|");
  }, [mediaPreview]);

  // Tracks the conversation for which we've already run the initial tab
  // auto-select, so it runs exactly once per conversation (when data arrives)
  // and never overrides a tab the user manually clicked afterwards.
  const autoSelectedForRef = useRef<string | null>(null);

  // Auto-select first non-empty tab once data arrives — only on the first load
  // per conversation. Without the ref guard this re-fires whenever activeTab
  // changes and bounces the user off an empty tab (e.g. clicking "Link" when
  // there are no links snapped back to "Ảnh/Video").
  useEffect(() => {
    if (!data) return;
    if (autoSelectedForRef.current === conversationId) return;
    autoSelectedForRef.current = conversationId;

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
  }, [data, activeTab, conversationId]);

  // Reset when conversation changes
  useEffect(() => {
    autoSelectedForRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab("media");
    setUrlCache({ forConversationId: conversationId, urls: {} });
  }, [conversationId]);

  // Batch thumbnail loading for drawer media preview (only when media tab is
  // active). Delegates to the SHARED thumbnail cache/dedupe so files already
  // resolved in the timeline are not re-fetched here.
  useEffect(() => {
    if (activeTab !== "media" || !thumbnailFileIdsKey) return;

    const needingFallback = mediaPreview.filter(
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
      .catch(() => {
        // Error handling - don't spam retries
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, thumbnailFileIdsKey, conversationId]);

  if (isLoading && variant === "card") {
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

  if (isLoading && variant === "zalo") {
    return (
      <div className="divide-y divide-[#eef0f4] border-y border-[#eef0f4] bg-surface">
        {["Ảnh/Video", "File", "Link"].map((label) => (
          <div key={label} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold text-text-primary">{label}</span>
              <ChevronRightIcon className="h-4 w-4 text-text-muted" />
            </div>
            <Skeleton className="mt-3 h-16 w-full rounded-md" />
          </div>
        ))}
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

  if (variant === "zalo") {
    return (
      <div className="divide-y divide-[#eef0f4] border-y border-[#eef0f4] bg-surface">
        <ZaloResourceSection
          title="Ảnh/Video"
          onOpen={() => onOpenAll?.("media")}
        >
          {mediaPreview.length > 0 ? (
            <DrawerMediaTab
              conversationId={conversationId}
              items={mediaPreview}
              total={mediaTotal}
              thumbnailUrls={thumbnailUrls}
              onImageOpen={(index, images) => setLightbox({ images, index })}
              onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
              onViewAll={() => onOpenAll?.("media")}
            />
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">
              Chưa có ảnh hoặc video nào
            </p>
          )}
          {mediaTotal > 0 && (
            <button
              type="button"
              onClick={() => onOpenAll?.("media")}
              className="mt-4 h-10 w-full rounded bg-[#e4e7ec] text-[15px] font-semibold text-text-primary hover:bg-[#dde1e7]"
            >
              Xem tất cả
            </button>
          )}
        </ZaloResourceSection>

        <ZaloResourceSection
          title="File"
          onOpen={() => onOpenAll?.("files")}
        >
          {filesPreview.length > 0 ? (
            <>
              <DrawerFilesTab
                items={filesPreview}
                conversationId={conversationId}
                variant="zalo"
              />
              {filesTotal > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAll?.("files")}
                  className="mt-4 h-10 w-full rounded bg-[#e4e7ec] text-[15px] font-semibold text-text-primary hover:bg-[#dde1e7]"
                >
                  Xem tất cả
                </button>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">
              Chưa có File được chia sẻ trong hội thoại này
            </p>
          )}
        </ZaloResourceSection>

        <ZaloResourceSection
          title="Link"
          onOpen={() => onOpenAll?.("links")}
        >
          {linksPreview.length > 0 ? (
            <>
              <DrawerLinksTab items={linksPreview} variant="zalo" />
              {linksTotal > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAll?.("links")}
                  className="mt-4 h-10 w-full rounded bg-[#e4e7ec] text-[15px] font-semibold text-text-primary hover:bg-[#dde1e7]"
                >
                  Xem tất cả
                </button>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">
              Chưa có link nào được chia sẻ
            </p>
          )}
        </ZaloResourceSection>

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
  }

  if (!data || totalAll === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-8 text-text-muted">
        <PhotoIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có nội dung nào được chia sẻ</p>
      </div>
    );
  }

  // Always show all three tabs (Ảnh/Video · File · Link) in the same row, even
  // when a category is empty — users expect the Link tab to be visible here
  // without first opening the "Xem tất cả" modal.
  const tabs: { key: SharedContentTab; label: string; count: number }[] = [
    { key: "media", label: "Ảnh/Video", count: mediaTotal },
    { key: "files", label: "File", count: filesTotal },
    { key: "links", label: "Link", count: linksTotal },
  ];

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
              conversationId={conversationId}
              items={mediaPreview}
              total={mediaTotal}
              thumbnailUrls={thumbnailUrls}
              onImageOpen={(index, images) => setLightbox({ images, index })}
              onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
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

      <SharedContentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        conversationId={conversationId}
        defaultTab={activeTab}
      />
    </>
  );
};

const ZaloResourceSection: React.FC<{
  title: string;
  onOpen: () => void;
  children: React.ReactNode;
}> = ({ title, onOpen, children }) => (
  <section className="bg-surface px-5 py-4">
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 flex w-full items-center justify-between text-left"
    >
      <span className="text-[18px] font-semibold text-text-primary">{title}</span>
      <ChevronRightIcon className="h-5 w-5 text-text-muted" />
    </button>
    {children}
  </section>
);

// ─── Drawer Media Tab ─────────────────────────────────────────────────────────

const DrawerMediaTab: React.FC<{
  conversationId: string;
  items: ConversationResourcesMediaItem[];
  total: number;
  thumbnailUrls: Record<string, string>;
  onImageOpen: (index: number, images: Array<{ url: string; alt?: string }>) => void;
  onVideoOpen: (url: string, fileName?: string) => void;
  onViewAll: () => void;
}> = ({
  conversationId,
  items,
  total,
  thumbnailUrls,
  onImageOpen,
  onVideoOpen,
  onViewAll,
}) => {
  // When total > preview limit, replace last slot with "+N" overlay
  const showOverlay = total > DRAWER_MEDIA_PREVIEW;
  const visibleItems = showOverlay ? items.slice(0, DRAWER_MEDIA_PREVIEW - 1) : items;
  const overlayItem = showOverlay ? items[DRAWER_MEDIA_PREVIEW - 1] ?? null : null;
  const remainingCount = total - (DRAWER_MEDIA_PREVIEW - 1);

  // Pre-resolve all URLs so the lightbox can navigate between them — include all items so
  // indices stay stable even when some thumbnails haven't resolved yet.
  const gallery = useMemo(
    () =>
      visibleItems.map((item) => {
        const raw = item.thumbnailUrl ?? thumbnailUrls[item.fileId] ?? null;
        const url = raw ? (resolvePublicResourceUrl(raw, { context: "image" }) ?? "") : "";
        return { url, alt: item.fileName, fileId: item.fileId };
      }),
    [visibleItems, thumbnailUrls],
  );

  const handleThumbClick = useCallback(
    (clickedFileId: string, clickedUrl: string) => {
      let idx = gallery.findIndex((img) => img.fileId === clickedFileId);
      if (idx < 0) idx = gallery.findIndex((img) => img.url === clickedUrl);
      const galleryForModal = gallery.map(({ url, alt }) => ({ url, alt }));
      onImageOpen(idx >= 0 ? idx : 0, galleryForModal);
    },
    [gallery, onImageOpen],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-muted">
        <PhotoIcon className="h-8 w-8" />
        <p className="text-sm">Chưa có ảnh hoặc video nào</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {visibleItems.map((item) => (
        <DrawerMediaThumb
          key={`${item.messageId}-${item.fileId}`}
          conversationId={conversationId}
          item={item}
          fallbackUrl={thumbnailUrls[item.fileId] ?? null}
          onImageClick={(url) => handleThumbClick(item.fileId, url)}
          onVideoOpen={onVideoOpen}
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
            <MediaThumbnail
              attachment={overlayItem}
              src={overlayItem.thumbnailUrl ?? thumbnailUrls[overlayItem.fileId]}
              variant="grid"
              className="opacity-40"
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
        // Keep the stable fallback tile; user can retry by clicking again.
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

// ─── Drawer Files Tab ─────────────────────────────────────────────────────────

const DrawerFilesTab: React.FC<{
  items: ConversationResourcesFileItem[];
  conversationId: string;
  variant?: "card" | "zalo";
}> = ({ items, conversationId, variant = "card" }) => {
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
          variant={variant}
        />
      ))}
    </div>
  );
};

const DrawerFileRow: React.FC<{
  item: ConversationResourcesFileItem;
  conversationId: string;
  variant?: "card" | "zalo";
}> = ({ item, conversationId, variant = "card" }) => {
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
      // silent — user can retry
    } finally {
      setIsDownloading(false);
    }
  };

  if (variant === "zalo") {
    return (
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        title={item.fileName}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          <FileTypeIcon type={iconType} className="h-10 w-10" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">
            {item.fileName}
          </p>
          <p className="truncate text-[12px] leading-5 text-text-muted">
            {formatFileSize(item.sizeBytes)}
            {senderName ? <span className="hidden min-[430px]:inline"> · {senderName}</span> : null}
          </p>
        </div>
        <span className="ml-2 max-w-[96px] shrink-0 truncate text-right text-[12px] text-text-muted">
          {date}
        </span>
      </button>
    );
  }

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

// ─── Drawer Links Tab ─────────────────────────────────────────────────────────

const DrawerLinksTab: React.FC<{
  items: ConversationResourcesLinkItem[];
  variant?: "card" | "zalo";
}> = ({ items, variant = "card" }) => {
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
        <DrawerLinkRow key={item.messageId} item={item} variant={variant} />
      ))}
    </div>
  );
};

const DrawerLinkRow: React.FC<{
  item: ConversationResourcesLinkItem;
  variant?: "card" | "zalo";
}> = ({
  item,
  variant = "card",
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));
  const senderName = useResolvedName(item.senderId, item.senderName);

  if (variant === "zalo") {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[66px] items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-surface-hover"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#d5d9e0] bg-[#eef0f4]">
          <LinkIcon className="h-5 w-5 text-text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">{item.domain}</p>
          <p className="truncate text-[13px] leading-5 text-[#0068ff]">{item.url}</p>
          {senderName ? (
            <p className="hidden truncate text-[12px] leading-5 text-text-muted min-[430px]:block">
              {senderName}
            </p>
          ) : null}
        </div>
        <span className="ml-2 max-w-[96px] shrink-0 truncate text-right text-[12px] text-text-muted">
          {date}
        </span>
      </a>
    );
  }

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
          {senderName} · {date}
        </p>
      </div>
    </a>
  );
};
