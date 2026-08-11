import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  ArrowUturnRightIcon,
  CheckCircleIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Skeleton, toast } from "../../ui";
import {
  useGetConversationSidebarSummaryQuery,
} from "../../../features/api/chatApi";
import type {
  ConversationResourcesMediaItem,
  ConversationResourcesFileItem,
  ConversationResourcesLinkItem,
} from "../../../features/api/chatApi";
import { ForwardModal } from "../../chat/ForwardModal";
import type { Message } from "../../../types";
import { MessageStatus, MessageType, RoomType } from "../../../types";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import { FileTypeIcon } from "../../message/FileTypeIcon";
import { formatRelativeDate } from "../../../utils/formatTime";
import { fileApi, messageApi } from "../../../services/api";
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
import { useAuthStore, useChatStore } from "../../../stores";
import {
  isFileDownloaded,
  markFileDownloaded,
  subscribeDownloadedFiles,
} from "../../../utils/downloadedFiles";
import { buildResourceDeleteMenuItems } from "./resourceMenuPolicy";
import { saveResourceMessageToCloud } from "./resourceCloudActions";

interface SharedResourcesPreviewProps {
  conversationId: string;
  variant?: "card" | "zalo";
  onOpenAll?: (tab: SharedContentTab) => void;
  onJumpToMessage?: (messageId: string) => void;
}

const DRAWER_MEDIA_PREVIEW = 6;
const DRAWER_FILES_PREVIEW = 4;
const DRAWER_LINKS_PREVIEW = 3;
const GROUP_CONVERSATION_TYPES = new Set<string>([
  RoomType.GROUP,
  RoomType.PUBLIC,
  RoomType.CHANNEL,
  "GROUP",
  "PUBLIC",
  "CHANNEL",
  "group",
  "public",
  "channel",
]);
const PERSONAL_CLOUD_CONVERSATION_TYPES = new Set<string>([
  "PERSONAL_CLOUD",
  "personal_cloud",
]);

type ForwardableResource =
  | ConversationResourcesMediaItem
  | ConversationResourcesFileItem
  | ConversationResourcesLinkItem;

const getResourceMessageType = (item: ForwardableResource): MessageType => {
  if ("url" in item) return MessageType.TEXT;
  if (item.mimeType.startsWith("image/")) return MessageType.IMAGE;
  if (item.mimeType.startsWith("video/")) return MessageType.VIDEO;
  return MessageType.FILE;
};

const buildResourceForwardMessage = (
  conversationId: string,
  item: ForwardableResource,
): Message => {
  const type = getResourceMessageType(item);
  if ("url" in item) {
    return {
      id: item.messageId,
      conversationId,
      senderId: item.senderId,
      content: item.url,
      type,
      status: MessageStatus.SENT,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      attachments: [],
    } as unknown as Message;
  }

  const media = item as ConversationResourcesMediaItem;
  return {
    id: item.messageId,
    conversationId,
    senderId: item.senderId,
    content: "",
    type,
    status: MessageStatus.SENT,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    attachments: [
      {
        id: item.fileId,
        type,
        fileName: item.fileName,
        mimeType: item.mimeType,
        fileSize: item.sizeBytes,
        width: "width" in item ? media.width ?? undefined : undefined,
        height: "height" in item ? media.height ?? undefined : undefined,
        duration: "durationMs" in item ? media.durationMs ?? undefined : undefined,
        thumbnailUrl: "thumbnailUrl" in item ? media.thumbnailUrl ?? undefined : undefined,
      },
    ],
  } as unknown as Message;
};

export const SharedResourcesPreview: React.FC<SharedResourcesPreviewProps> = ({
  conversationId,
  variant = "card",
  onOpenAll,
  onJumpToMessage,
}) => {
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");
  const conversationType = useChatStore(
    (state) => state.conversationById[conversationId]?.type,
  );
  const isPersonalCloud = PERSONAL_CLOUD_CONVERSATION_TYPES.has(String(conversationType));
  const recallLabel = isPersonalCloud
    ? "Xóa"
    : GROUP_CONVERSATION_TYPES.has(String(conversationType))
      ? "Xóa cho cả nhóm (Thu hồi)"
      : "Xóa cho cả hai phía (Thu hồi)";
  const [activeTab, setActiveTab] = useState<SharedContentTab>("media");
  const [modalOpen, setModalOpen] = useState(false);
  const [zaloOpenSections, setZaloOpenSections] = useState<
    Record<SharedContentTab, boolean>
  >({
    media: true,
    files: true,
    links: true,
  });
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; alt?: string }>;
    index: number;
  } | null>(null);
  const [video, setVideo] = useState<{ url: string; fileName?: string } | null>(
    null,
  );

  useEffect(() => {
    setZaloOpenSections({
      media: true,
      files: true,
      links: true,
    });
  }, [conversationId]);

  const toggleZaloSection = useCallback((tab: SharedContentTab) => {
    setZaloOpenSections((prev) => ({
      ...prev,
      [tab]: !prev[tab],
    }));
  }, []);

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
    return (
      data?.media.preview
        .filter((item) => !hiddenMessageIds.has(item.messageId))
        .slice(0, DRAWER_MEDIA_PREVIEW) ?? []
    );
  }, [data?.media.preview, hiddenMessageIds]);

  const filesPreview = useMemo(() => {
    return (data?.files.preview ?? [])
      .filter((item) => !hiddenMessageIds.has(item.messageId))
      .filter(
        (f) =>
          !f.mimeType.startsWith("image/") &&
          !f.mimeType.startsWith("video/") &&
          !f.mimeType.startsWith("audio/"),
      )
      .slice(0, DRAWER_FILES_PREVIEW);
  }, [data?.files.preview, hiddenMessageIds]);

  const linksPreview = useMemo(() => {
    return (
      data?.links.preview
        .filter((item) => !hiddenMessageIds.has(item.messageId))
        .slice(0, DRAWER_LINKS_PREVIEW) ?? []
    );
  }, [data?.links.preview, hiddenMessageIds]);

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
    setForwardMessage(null);
    setHiddenMessageIds(new Set());
  }, [conversationId]);

  const handleForwardResource = useCallback(
    (item: ForwardableResource) => {
      setForwardMessage(buildResourceForwardMessage(conversationId, item));
    },
    [conversationId],
  );

  const handleResourceDeleted = useCallback((messageId: string) => {
    setHiddenMessageIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);

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
          open={zaloOpenSections.media}
          onToggle={() => toggleZaloSection("media")}
        >
          {mediaPreview.length > 0 ? (
            <DrawerMediaTab
              conversationId={conversationId}
              items={mediaPreview}
              total={mediaTotal}
              thumbnailUrls={thumbnailUrls}
              onImageOpen={(index, images) => setLightbox({ images, index })}
              onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
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
          open={zaloOpenSections.files}
          onToggle={() => toggleZaloSection("files")}
        >
          {filesPreview.length > 0 ? (
            <>
              <DrawerFilesTab
                items={filesPreview}
                conversationId={conversationId}
                variant="zalo"
                onForward={handleForwardResource}
                onJumpToMessage={onJumpToMessage}
                onDeleted={handleResourceDeleted}
                recallLabel={recallLabel}
                isPersonalCloud={isPersonalCloud}
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
          open={zaloOpenSections.links}
          onToggle={() => toggleZaloSection("links")}
        >
          {linksPreview.length > 0 ? (
            <>
              <DrawerLinksTab
                items={linksPreview}
                variant="zalo"
                onForward={handleForwardResource}
                onJumpToMessage={onJumpToMessage}
                onDeleted={handleResourceDeleted}
                recallLabel={recallLabel}
                isPersonalCloud={isPersonalCloud}
              />
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

        {forwardMessage && currentUserId ? (
          <ForwardModal
            messages={[forwardMessage]}
            currentUserId={currentUserId}
            onClose={() => setForwardMessage(null)}
          />
        ) : null}
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
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
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
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
            />
          )}
          {activeTab === "links" && (
            <DrawerLinksTab
              items={linksPreview}
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
            />
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
        onJumpToMessage={onJumpToMessage}
      />

      {forwardMessage && currentUserId ? (
        <ForwardModal
          messages={[forwardMessage]}
          currentUserId={currentUserId}
          onClose={() => setForwardMessage(null)}
        />
      ) : null}
    </>
  );
};

const ZaloResourceSection: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, open, onToggle, children }) => (
  <section className="bg-surface px-5 py-4">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mb-3 flex w-full items-center justify-between text-left"
    >
      <span className="text-[18px] font-semibold text-text-primary">{title}</span>
      {open ? (
        <ChevronDownIcon className="h-5 w-5 text-text-muted" />
      ) : (
        <ChevronRightIcon className="h-5 w-5 text-text-muted" />
      )}
    </button>
    {open ? children : null}
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
  onForward: (item: ConversationResourcesMediaItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
  onViewAll: () => void;
}> = ({
  conversationId,
  items,
  total,
  thumbnailUrls,
  onImageOpen,
  onVideoOpen,
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
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
      {visibleItems.map((item, index) => (
        <DrawerMediaThumb
          key={`${item.messageId}-${item.fileId}`}
          conversationId={conversationId}
          item={item}
          fallbackUrl={thumbnailUrls[item.fileId] ?? null}
          menuAlign={index % 3 === 2 ? "right" : "left"}
          onImageClick={(url) => handleThumbClick(item.fileId, url)}
          onVideoOpen={onVideoOpen}
          onForward={() => onForward(item)}
          onJumpToMessage={onJumpToMessage}
          onDeleted={onDeleted}
          recallLabel={recallLabel}
          isPersonalCloud={isPersonalCloud}
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
  menuAlign: "left" | "right";
  onImageClick: (url: string) => void;
  onVideoOpen: (url: string, fileName?: string) => void;
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = React.memo(({
  conversationId,
  item,
  fallbackUrl,
  menuAlign,
  onImageClick,
  onVideoOpen,
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
  const isVideo =
    item.mimeType.startsWith("video/") || item.messageType === "video";
  const rawSrc = item.thumbnailUrl ?? fallbackUrl ?? null;
  const src = rawSrc ? (resolvePublicResourceUrl(rawSrc, { context: "image" }) ?? null) : null;
  const canOpen = true;
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

  const getDownloadUrl = async (): Promise<string | null> => {
    const res = await fileApi.getDownloadUrl({
      conversationId,
      attachmentId: item.fileId,
    });
    const payload = unwrapApiSuccess(res);
    return payload.url || null;
  };

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

  const handleCopy = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url = await getDownloadUrl();
      if (!url) return;
      await navigator.clipboard?.writeText(url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không thể sao chép nội dung này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleDownload = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url = await getDownloadUrl();
      if (url) {
        await downloadResourceWithName(url, item.fileName);
        markFileDownloaded(item.fileId);
      }
    } catch {
      toast.error("Không thể lưu về máy");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleDelete = async (mode: "FOR_ME" | "FOR_EVERYONE") => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await messageApi.deleteMessage(item.messageId, { mode });
      onDeleted(item.messageId);
      toast.success(
        mode === "FOR_EVERYONE"
          ? "Đã thu hồi tin nhắn"
          : "Đã xóa ở phía bạn",
      );
    } catch {
      toast.error("Không thể xóa nội dung này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleJumpToMessage = () => {
    onJumpToMessage?.(item.messageId);
    setMenuOpen(false);
  };

  const handleSaveToMyDocuments = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await saveResourceMessageToCloud(item.messageId, isPersonalCloud);
      toast.success(
        result === "already-in-cloud"
          ? "Nội dung đã ở Cloud của tôi"
          : "Đã lưu vào Cloud của tôi",
      );
    } catch {
      toast.error("Không thể lưu vào Cloud của tôi");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="group relative aspect-square rounded-md">
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => void handleClick()}
        className={clsx(
          "absolute inset-0 overflow-hidden rounded-md bg-surface-overlay",
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

      <div
        className={clsx(
          "absolute left-2 top-2 z-20 hidden h-8 items-center rounded-md bg-white shadow-elev2 ring-1 ring-black/10 group-hover:flex",
          menuOpen && "flex",
        )}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onForward();
          }}
          title="Chia sẻ"
          aria-label="Chia sẻ"
          className="flex h-8 w-9 items-center justify-center rounded-l-md text-text-primary hover:bg-surface-hover"
        >
          <ArrowUturnRightIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
          title="Thêm"
          aria-label="Thêm"
          className="flex h-8 w-9 items-center justify-center rounded-r-md text-text-primary hover:bg-surface-hover"
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </button>
      </div>

      {menuOpen ? (
        <div
          onClick={(event) => event.stopPropagation()}
          className={clsx(
            "absolute top-11 z-40 w-[280px] overflow-hidden rounded-lg border border-border bg-surface py-2 text-[15px] shadow-elev2",
            menuAlign === "right" ? "right-0" : "left-0",
          )}
        >
          <MediaMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
            Copy
          </MediaMenuButton>
          <MediaMenuButton
            onClick={() => {
              setMenuOpen(false);
              onForward();
            }}
          >
            Chia sẻ
          </MediaMenuButton>
          <MediaMenuButton onClick={handleSaveToMyDocuments}>
            Lưu vào Cloud của tôi
          </MediaMenuButton>
          <MediaMenuButton
            onClick={handleJumpToMessage}
            disabled={!onJumpToMessage}
          >
            Xem tin nhắn gốc
          </MediaMenuButton>
          <MediaMenuButton onClick={() => void handleDownload()} disabled={isBusy}>
            Lưu về máy
          </MediaMenuButton>
          <div className="my-2 border-t border-border" />
          {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
            <MediaMenuButton
              key={action.mode}
              tone="danger"
              onClick={() => void handleDelete(action.mode)}
              disabled={isBusy}
            >
              {action.label}
            </MediaMenuButton>
          ))}
        </div>
      ) : null}
    </div>
  );
});

const MediaMenuButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}> = ({ children, onClick, disabled = false, tone = "default" }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      "block w-full px-5 py-2.5 text-left leading-5 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50",
      tone === "danger" ? "text-[#d93025]" : "text-text-primary",
    )}
  >
    {children}
  </button>
);

// ─── Drawer Files Tab ─────────────────────────────────────────────────────────

const DrawerFilesTab: React.FC<{
  items: ConversationResourcesFileItem[];
  conversationId: string;
  variant?: "card" | "zalo";
  onForward: (item: ConversationResourcesFileItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted?: (messageId: string) => void;
  recallLabel?: string;
  isPersonalCloud?: boolean;
}> = ({
  items,
  conversationId,
  variant = "card",
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel = "Xóa cho cả hai phía (Thu hồi)",
  isPersonalCloud = false,
}) => {
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
          onForward={() => onForward(item)}
          onJumpToMessage={onJumpToMessage}
          onDeleted={onDeleted}
          recallLabel={recallLabel}
          isPersonalCloud={isPersonalCloud}
        />
      ))}
    </div>
  );
};

const DrawerFileRow: React.FC<{
  item: ConversationResourcesFileItem;
  conversationId: string;
  variant?: "card" | "zalo";
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted?: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  item,
  conversationId,
  variant = "card",
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
  const iconType = getFileIconType(item.mimeType, item.fileName);
  const date = formatRelativeDate(new Date(item.createdAt));
  const senderName = useResolvedName(item.senderId, item.senderName);
  const [isDownloading, setIsDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isDownloaded = React.useSyncExternalStore(
    subscribeDownloadedFiles,
    () => isFileDownloaded(item.fileId),
    () => false,
  );

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

  const getFileDownloadUrl = async (): Promise<string | null> => {
    const res = await fileApi.getDownloadUrl({
      conversationId,
      attachmentId: item.fileId,
    });
    const payload = unwrapApiSuccess(res);
    return payload.url || null;
  };

  const handleDownload = async () => {
    if (isDownloading || isBusy) return;
    setIsDownloading(true);
    try {
      const url = await getFileDownloadUrl();
      if (url) {
        await downloadResourceWithName(url, item.fileName);
        markFileDownloaded(item.fileId);
      }
    } catch {
      // silent — user can retry
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url = await getFileDownloadUrl();
      if (!url) return;
      await navigator.clipboard?.writeText(url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không thể sao chép nội dung này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleDelete = async (mode: "FOR_ME" | "FOR_EVERYONE") => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await messageApi.deleteMessage(item.messageId, { mode });
      onDeleted?.(item.messageId);
      toast.success(
        mode === "FOR_EVERYONE"
          ? "Đã thu hồi tin nhắn"
          : isPersonalCloud
            ? "Đã xóa"
            : "Đã xóa ở phía bạn",
      );
    } catch {
      toast.error("Không thể xóa nội dung này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleJumpToMessage = () => {
    onJumpToMessage?.(item.messageId);
    setMenuOpen(false);
  };

  const handleSaveToMyDocuments = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await saveResourceMessageToCloud(item.messageId, isPersonalCloud);
      toast.success(
        result === "already-in-cloud"
          ? "Nội dung đã ở Cloud của tôi"
          : "Đã lưu vào Cloud của tôi",
      );
    } catch {
      toast.error("Không thể lưu vào Cloud của tôi");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  if (variant === "zalo") {
    return (
      <div className="group relative rounded-md transition-colors hover:bg-surface-hover">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
          title={item.fileName}
          className="flex min-h-[64px] w-full items-center gap-3 px-1 py-2 text-left disabled:opacity-60"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center">
            <FileTypeIcon
              type={iconType}
              fileName={item.fileName}
              variant="tile"
              className="h-10 w-10"
            />
          </div>
          <div className="min-w-0 flex-1 pr-2">
            <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">
              {item.fileName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] leading-5 text-text-muted">
              <span>{formatFileSize(item.sizeBytes)}</span>
              {isDownloaded ? (
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-[#20a563]" />
              ) : (
                <ClockIcon className="h-4 w-4 shrink-0 text-[#0068ff]" />
              )}
              {senderName ? <span className="hidden truncate min-[430px]:inline">· {senderName}</span> : null}
            </p>
          </div>
          <span className="ml-2 max-w-[96px] shrink-0 truncate text-right text-[12px] text-text-muted group-hover:opacity-0">
            {date}
          </span>
        </button>

        <div className="pointer-events-none absolute right-0 top-1 hidden h-9 items-center rounded-md border border-border bg-surface shadow-elev2 group-hover:flex">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload();
            }}
            disabled={isDownloading}
            title="Tải xuống"
            aria-label="Tải xuống"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-l-md text-text-primary hover:bg-surface-hover disabled:opacity-60"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onForward();
            }}
            disabled={isDownloading}
            title="Chia sẻ"
            aria-label="Chia sẻ"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center text-text-primary hover:bg-surface-hover disabled:opacity-60"
          >
            <ArrowUturnRightIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Thêm"
            aria-label="Thêm"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-r-md text-text-primary hover:bg-surface-hover"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>
        </div>

        {menuOpen ? (
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-11 z-40 w-[280px] overflow-hidden rounded-lg border border-border bg-surface py-2 text-[15px] shadow-elev2"
          >
            <MediaMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
              Copy
            </MediaMenuButton>
            <MediaMenuButton
              onClick={() => {
                setMenuOpen(false);
                onForward();
              }}
            >
              Chia sẻ
            </MediaMenuButton>
            <MediaMenuButton onClick={handleSaveToMyDocuments}>
              Lưu vào Cloud của tôi
            </MediaMenuButton>
            <MediaMenuButton
              onClick={handleJumpToMessage}
              disabled={!onJumpToMessage}
            >
              Xem tin nhắn gốc
            </MediaMenuButton>
            <MediaMenuButton onClick={() => void handleDownload()} disabled={isBusy || isDownloading}>
              Lưu về máy
            </MediaMenuButton>
            <div className="my-2 border-t border-border" />
            {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
              <MediaMenuButton
                key={action.mode}
                tone="danger"
                onClick={() => void handleDelete(action.mode)}
                disabled={isBusy}
              >
                {action.label}
              </MediaMenuButton>
            ))}
          </div>
        ) : null}
      </div>
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
        <FileTypeIcon
          type={iconType}
          fileName={item.fileName}
          variant="tile"
          className="h-8 w-8"
        />
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
  onForward: (item: ConversationResourcesLinkItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted?: (messageId: string) => void;
  recallLabel?: string;
  isPersonalCloud?: boolean;
}> = ({
  items,
  variant = "card",
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel = "Xóa cho cả hai phía (Thu hồi)",
  isPersonalCloud = false,
}) => {
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
        <DrawerLinkRow
          key={item.messageId}
          item={item}
          variant={variant}
          onForward={() => onForward(item)}
          onJumpToMessage={onJumpToMessage}
          onDeleted={onDeleted}
          recallLabel={recallLabel}
          isPersonalCloud={isPersonalCloud}
        />
      ))}
    </div>
  );
};

const DrawerLinkRow: React.FC<{
  item: ConversationResourcesLinkItem;
  variant?: "card" | "zalo";
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted?: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  item,
  variant = "card",
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
  const date = formatRelativeDate(new Date(item.createdAt));
  const senderName = useResolvedName(item.senderId, item.senderName);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

  const openLink = () => {
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await navigator.clipboard?.writeText(item.url);
      toast.success("Đã sao chép liên kết");
    } catch {
      toast.error("Không thể sao chép liên kết này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleSaveToMyDocuments = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await saveResourceMessageToCloud(item.messageId, isPersonalCloud);
      toast.success(
        result === "already-in-cloud"
          ? "Nội dung đã ở Cloud của tôi"
          : "Đã lưu vào Cloud của tôi",
      );
    } catch {
      toast.error("Không thể lưu vào Cloud của tôi");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  const handleJumpToMessage = () => {
    onJumpToMessage?.(item.messageId);
    setMenuOpen(false);
  };

  const handleSaveToMachine = () => {
    const safeName =
      Array.from(item.domain)
        .map((char) => {
          const code = char.charCodeAt(0);
          return code < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char;
        })
        .join("") || "link";
    const blob = new Blob([item.url], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const handleDelete = async (mode: "FOR_ME" | "FOR_EVERYONE") => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await messageApi.deleteMessage(item.messageId, { mode });
      onDeleted?.(item.messageId);
      toast.success(
        mode === "FOR_EVERYONE"
          ? "Đã thu hồi tin nhắn"
          : isPersonalCloud
            ? "Đã xóa"
            : "Đã xóa ở phía bạn",
      );
    } catch {
      toast.error("Không thể xóa nội dung này");
    } finally {
      setIsBusy(false);
      setMenuOpen(false);
    }
  };

  if (variant === "zalo") {
    return (
      <div className="group relative rounded-md transition-colors hover:bg-surface-hover">
        <button
          type="button"
          onClick={openLink}
          title={item.url}
          className="flex min-h-[66px] w-full items-center gap-3 px-1 py-2 text-left"
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
          <span className="ml-2 max-w-[96px] shrink-0 truncate text-right text-[12px] text-text-muted group-hover:opacity-0">
            {date}
          </span>
        </button>

        <div className="pointer-events-none absolute right-0 top-1 hidden h-9 items-center rounded-md border border-border bg-surface shadow-elev2 group-hover:flex">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onForward();
            }}
            title="Chia sẻ"
            aria-label="Chia sẻ"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-l-md text-text-primary hover:bg-surface-hover"
          >
            <ArrowUturnRightIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Thêm"
            aria-label="Thêm"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-r-md text-text-primary hover:bg-surface-hover"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>
        </div>

        {menuOpen ? (
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute right-0 top-11 z-40 w-[280px] overflow-hidden rounded-lg border border-border bg-surface py-2 text-[15px] shadow-elev2"
          >
            <MediaMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
              Copy
            </MediaMenuButton>
            <MediaMenuButton
              onClick={() => {
                setMenuOpen(false);
                onForward();
              }}
            >
              Chia sẻ
            </MediaMenuButton>
            <MediaMenuButton onClick={handleSaveToMyDocuments}>
              Lưu vào Cloud của tôi
            </MediaMenuButton>
            <MediaMenuButton
              onClick={handleJumpToMessage}
              disabled={!onJumpToMessage}
            >
              Xem tin nhắn gốc
            </MediaMenuButton>
            <MediaMenuButton onClick={handleSaveToMachine}>
              Lưu về máy
            </MediaMenuButton>
            <div className="my-2 border-t border-border" />
            {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
              <MediaMenuButton
                key={action.mode}
                tone="danger"
                onClick={() => void handleDelete(action.mode)}
                disabled={isBusy}
              >
                {action.label}
              </MediaMenuButton>
            ))}
          </div>
        ) : null}
      </div>
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
