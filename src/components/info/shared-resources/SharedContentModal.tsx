import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import clsx from "clsx";
import {
  ArrowDownTrayIcon,
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  ArrowUturnRightIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { Modal, Skeleton, toast } from "../../ui";
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
import { messageApi } from "../../../services/api";
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
import { ForwardModal } from "../../chat/ForwardModal";
import type { Message } from "../../../types";
import { MessageStatus, MessageType, RoomType } from "../../../types";
import { useAuthStore, useChatStore } from "../../../stores";
import { buildResourceDeleteMenuItems } from "./resourceMenuPolicy";
import { saveResourceMessageToCloud } from "./resourceCloudActions";

export type SharedContentTab = "media" | "files" | "links";

interface SharedContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  defaultTab?: SharedContentTab;
  onJumpToMessage?: (messageId: string) => void;
}

interface SharedContentPanelProps {
  conversationId: string;
  defaultTab?: SharedContentTab;
  onBack: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

const MODAL_MEDIA_PAGE_SIZE = 18;
const MODAL_FILES_PAGE_SIZE = 15;
const MODAL_LINKS_PAGE_SIZE = 15;

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

type StorageResource =
  | ConversationResourcesMediaItem
  | ConversationResourcesFileItem
  | ConversationResourcesLinkItem;

const getStorageResourceMessageType = (item: StorageResource): MessageType => {
  if ("url" in item) return MessageType.TEXT;
  if (item.mimeType.startsWith("image/")) return MessageType.IMAGE;
  if (item.mimeType.startsWith("video/")) return MessageType.VIDEO;
  return MessageType.FILE;
};

const buildStorageForwardMessage = (
  conversationId: string,
  item: StorageResource,
): Message => {
  const type = getStorageResourceMessageType(item);
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

const useStorageResourceActions = (conversationId: string) => {
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

  return { currentUserId, isPersonalCloud, recallLabel };
};

export const SharedContentModal: React.FC<SharedContentModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  defaultTab = "media",
  onJumpToMessage,
}) => {
  const { currentUserId, isPersonalCloud, recallLabel } =
    useStorageResourceActions(conversationId);
  const [activeTab, setActiveTab] = useState<SharedContentTab>(defaultTab);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setActiveTab(defaultTab);
  }, [isOpen, defaultTab]);
  useEffect(() => {
    setHiddenMessageIds(new Set());
    setForwardMessage(null);
  }, [conversationId]);

  const handleForwardResource = useCallback(
    (item: StorageResource) => {
      setForwardMessage(buildStorageForwardMessage(conversationId, item));
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
              hiddenMessageIds={hiddenMessageIds}
              onImageOpen={(index, images) => setLightbox({ images, index })}
              onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
            />
          )}
          {activeTab === "files" && (
            <ModalFilesTab
              conversationId={conversationId}
              hiddenMessageIds={hiddenMessageIds}
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
            />
          )}
          {activeTab === "links" && (
            <ModalLinksTab
              conversationId={conversationId}
              hiddenMessageIds={hiddenMessageIds}
              onForward={handleForwardResource}
              onJumpToMessage={onJumpToMessage}
              onDeleted={handleResourceDeleted}
              recallLabel={recallLabel}
              isPersonalCloud={isPersonalCloud}
            />
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

export const SharedContentPanel: React.FC<SharedContentPanelProps> = ({
  conversationId,
  defaultTab = "media",
  onBack,
  onJumpToMessage,
}) => {
  const { currentUserId, isPersonalCloud, recallLabel } =
    useStorageResourceActions(conversationId);
  const [activeTab, setActiveTab] = useState<SharedContentTab>(defaultTab);
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
    setActiveTab(defaultTab);
    setHiddenMessageIds(new Set());
    setForwardMessage(null);
  }, [defaultTab, conversationId]);

  const handleForwardResource = useCallback(
    (item: StorageResource) => {
      setForwardMessage(buildStorageForwardMessage(conversationId, item));
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
            hiddenMessageIds={hiddenMessageIds}
            onImageOpen={(index, images) => setLightbox({ images, index })}
            onVideoOpen={(url, fileName) => setVideo({ url, fileName })}
            onForward={handleForwardResource}
            onJumpToMessage={onJumpToMessage}
            onDeleted={handleResourceDeleted}
            recallLabel={recallLabel}
            isPersonalCloud={isPersonalCloud}
          />
        )}
        {activeTab === "files" && (
          <ModalFilesTab
            conversationId={conversationId}
            hiddenMessageIds={hiddenMessageIds}
            onForward={handleForwardResource}
            onJumpToMessage={onJumpToMessage}
            onDeleted={handleResourceDeleted}
            recallLabel={recallLabel}
            isPersonalCloud={isPersonalCloud}
          />
        )}
        {activeTab === "links" && (
          <ModalLinksTab
            conversationId={conversationId}
            hiddenMessageIds={hiddenMessageIds}
            onForward={handleForwardResource}
            onJumpToMessage={onJumpToMessage}
            onDeleted={handleResourceDeleted}
            recallLabel={recallLabel}
            isPersonalCloud={isPersonalCloud}
          />
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

      {forwardMessage && currentUserId ? (
        <ForwardModal
          messages={[forwardMessage]}
          currentUserId={currentUserId}
          onClose={() => setForwardMessage(null)}
        />
      ) : null}
    </div>
  );
};

// ─── Modal Media Tab ──────────────────────────────────────────────────────────

const ModalMediaTab: React.FC<{
  conversationId: string;
  hiddenMessageIds: Set<string>;
  onImageOpen: (index: number, images: Array<{ url: string; alt?: string }>) => void;
  onVideoOpen: (url: string, fileName?: string) => void;
  onForward: (item: ConversationResourcesMediaItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  conversationId,
  hiddenMessageIds,
  onImageOpen,
  onVideoOpen,
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
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
    return (data?.data ?? []).filter((item) => !hiddenMessageIds.has(item.messageId));
  }, [data?.data, hiddenMessageIds]);

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
            onForward={() => onForward(item)}
            onJumpToMessage={onJumpToMessage}
            onDeleted={onDeleted}
            recallLabel={recallLabel}
            isPersonalCloud={isPersonalCloud}
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
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = React.memo(({
  conversationId,
  item,
  fallbackUrl,
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const getDownloadUrl = async () => {
    const res = await fileApi.getDownloadUrl({
      conversationId,
      attachmentId: item.fileId,
    });
    const payload = unwrapApiSuccess(res);
    return payload.url;
  };

  const handleClick = async () => {
    // Videos must be played from their resolved source — the thumbnail (src) is
    // only a still image, so routing it to the image lightbox shows a frozen
    // frame that can't be played.
    if (isVideo) {
      try {
        const url = await getDownloadUrl();
        if (url) onVideoOpen(url, item.fileName);
      } catch {
        // Stable fallback stays visible; user can retry by clicking the tile.
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
      if (url) {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết");
      }
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
      if (url) await downloadResourceWithName(url, item.fileName);
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

  return (
    <div ref={containerRef} className="group relative aspect-square rounded-md">
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

      <StorageHoverActions
        isOpen={menuOpen}
        onForward={onForward}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        className="left-2 top-2"
      />

      {menuOpen ? (
        <StorageResourceMenu className="left-2 top-11">
          <StorageMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
            Copy
          </StorageMenuButton>
          <StorageMenuButton
            onClick={() => {
              setMenuOpen(false);
              onForward();
            }}
          >
            Chia sẻ
          </StorageMenuButton>
          <StorageMenuButton onClick={handleSaveToMyDocuments}>
            Lưu vào Cloud của tôi
          </StorageMenuButton>
          <StorageMenuButton
            onClick={handleJumpToMessage}
            disabled={!onJumpToMessage}
          >
            Xem tin nhắn gốc
          </StorageMenuButton>
          <StorageMenuButton onClick={() => void handleDownload()} disabled={isBusy}>
            Lưu về máy
          </StorageMenuButton>
          <div className="my-2 border-t border-border" />
          {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
            <StorageMenuButton
              key={action.mode}
              tone="danger"
              onClick={() => void handleDelete(action.mode)}
              disabled={isBusy}
            >
              {action.label}
            </StorageMenuButton>
          ))}
        </StorageResourceMenu>
      ) : null}
    </div>
  );
});

// ─── Modal Files Tab ──────────────────────────────────────────────────────────

const ModalFilesTab: React.FC<{
  conversationId: string;
  hiddenMessageIds: Set<string>;
  onForward: (item: ConversationResourcesFileItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  conversationId,
  hiddenMessageIds,
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
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
      !hiddenMessageIds.has(f.messageId) &&
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
                onForward={() => onForward(item)}
                onJumpToMessage={onJumpToMessage}
                onDeleted={onDeleted}
                recallLabel={recallLabel}
                isPersonalCloud={isPersonalCloud}
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
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  item,
  conversationId,
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
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const getDownloadUrl = async () => {
    const res = await fileApi.getDownloadUrl({
      conversationId,
      attachmentId: item.fileId,
    });
    const payload = unwrapApiSuccess(res);
    return payload.url;
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const url = await getDownloadUrl();
      if (url) await downloadResourceWithName(url, item.fileName);
    } catch {
      // silent
    } finally {
      setIsDownloading(false);
      setMenuOpen(false);
    }
  };

  const handleCopy = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const url = await getDownloadUrl();
      if (url) {
        await navigator.clipboard.writeText(url);
        toast.success("Đã sao chép liên kết");
      }
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
      onDeleted(item.messageId);
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

  return (
    <div
      ref={rowRef}
      className="group relative rounded-xl transition-colors hover:bg-surface-hover"
    >
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        title={item.fileName}
        className="flex min-h-[62px] w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60"
      >
      <FileTypeIcon
        type={iconType}
        fileName={item.fileName}
        variant="tile"
        className="h-10 w-10 shrink-0"
      />
      <div className="min-w-0 flex-1 pr-20">
        <FileName
          name={item.fileName}
          className="text-sm font-semibold text-text-primary"
        />
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(item.sizeBytes)} · {senderName} · {date}
        </p>
      </div>
      </button>

      <StorageHoverActions
        isOpen={menuOpen}
        onForward={onForward}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onDownload={() => void handleDownload()}
        className="right-2 top-1/2 -translate-y-1/2"
      />

      {menuOpen ? (
        <StorageResourceMenu className="right-2 top-12">
          <StorageMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
            Copy
          </StorageMenuButton>
          <StorageMenuButton
            onClick={() => {
              setMenuOpen(false);
              onForward();
            }}
          >
            Chia sẻ
          </StorageMenuButton>
          <StorageMenuButton onClick={handleSaveToMyDocuments}>
            Lưu vào Cloud của tôi
          </StorageMenuButton>
          <StorageMenuButton
            onClick={handleJumpToMessage}
            disabled={!onJumpToMessage}
          >
            Xem tin nhắn gốc
          </StorageMenuButton>
          <StorageMenuButton
            onClick={() => void handleDownload()}
            disabled={isBusy || isDownloading}
          >
            Lưu về máy
          </StorageMenuButton>
          <div className="my-2 border-t border-border" />
          {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
            <StorageMenuButton
              key={action.mode}
              tone="danger"
              onClick={() => void handleDelete(action.mode)}
              disabled={isBusy}
            >
              {action.label}
            </StorageMenuButton>
          ))}
        </StorageResourceMenu>
      ) : null}
    </div>
  );
};

// ─── Modal Links Tab ──────────────────────────────────────────────────────────

const StorageHoverActions: React.FC<{
  isOpen: boolean;
  onForward: () => void;
  onToggleMenu: () => void;
  onDownload?: () => void;
  className?: string;
}> = ({ isOpen, onForward, onToggleMenu, onDownload, className }) => (
  <div
    className={clsx(
      "pointer-events-none absolute z-20 hidden h-9 items-center overflow-hidden rounded-md border border-border bg-surface shadow-elev2 group-hover:flex",
      isOpen && "flex",
      className,
    )}
  >
    {onDownload ? (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDownload();
        }}
        title="Tải xuống"
        aria-label="Tải xuống"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center text-text-primary hover:bg-surface-hover"
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>
    ) : null}
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onForward();
      }}
      title="Chia sẻ"
      aria-label="Chia sẻ"
      className="pointer-events-auto flex h-9 w-9 items-center justify-center text-text-primary hover:bg-surface-hover"
    >
      <ArrowUturnRightIcon className="h-5 w-5" />
    </button>
    <button
      type="button"
      title="Thêm"
      aria-label="Thêm"
      className="pointer-events-auto flex h-9 w-9 items-center justify-center text-text-primary hover:bg-surface-hover"
      onClick={(event) => {
        event.stopPropagation();
        onToggleMenu();
      }}
    >
      <EllipsisHorizontalIcon className="h-5 w-5" />
    </button>
  </div>
);

const StorageResourceMenu: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    onClick={(event) => event.stopPropagation()}
    className={clsx(
      "absolute z-40 w-[280px] overflow-hidden rounded-lg border border-border bg-surface py-2 text-[15px] shadow-elev2",
      className,
    )}
  >
    {children}
  </div>
);

const StorageMenuButton: React.FC<{
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

const ModalLinksTab: React.FC<{
  conversationId: string;
  hiddenMessageIds: Set<string>;
  onForward: (item: ConversationResourcesLinkItem) => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  conversationId,
  hiddenMessageIds,
  onForward,
  onJumpToMessage,
  onDeleted,
  recallLabel,
  isPersonalCloud,
}) => {
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
    if (hiddenMessageIds.has(item.messageId)) return false;
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
          <ModalLinkRow
            key={item.messageId}
            item={item}
            onForward={() => onForward(item)}
            onJumpToMessage={onJumpToMessage}
            onDeleted={onDeleted}
            recallLabel={recallLabel}
            isPersonalCloud={isPersonalCloud}
          />
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

const ModalLinkRow: React.FC<{
  item: ConversationResourcesLinkItem;
  onForward: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onDeleted: (messageId: string) => void;
  recallLabel: string;
  isPersonalCloud: boolean;
}> = ({
  item,
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
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const openLink = () => {
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await navigator.clipboard.writeText(item.url);
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
      onDeleted(item.messageId);
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

  return (
    <div
      ref={rowRef}
      className="group relative rounded-xl transition-colors hover:bg-surface-hover"
    >
      <button
        type="button"
        onClick={openLink}
        title={item.url}
        className="flex min-h-[66px] w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#d5d9e0] bg-[#eef0f4]">
          <LinkIcon className="h-5 w-5 text-text-primary" />
        </div>
        <div className="min-w-0 flex-1 pr-20">
          <p className="truncate text-sm font-semibold text-text-primary">
            {item.domain}
          </p>
          <p className="truncate text-xs text-primary">{item.url}</p>
          <p className="truncate text-xs text-text-muted">
          {senderName} · {date}
          </p>
        </div>
      </button>

      <StorageHoverActions
        isOpen={menuOpen}
        onForward={onForward}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        className="right-2 top-1/2 -translate-y-1/2"
      />

      {menuOpen ? (
        <StorageResourceMenu className="right-2 top-12">
          <StorageMenuButton onClick={() => void handleCopy()} disabled={isBusy}>
            Copy
          </StorageMenuButton>
          <StorageMenuButton
            onClick={() => {
              setMenuOpen(false);
              onForward();
            }}
          >
            Chia sẻ
          </StorageMenuButton>
          <StorageMenuButton onClick={handleSaveToMyDocuments}>
            Lưu vào Cloud của tôi
          </StorageMenuButton>
          <StorageMenuButton
            onClick={handleJumpToMessage}
            disabled={!onJumpToMessage}
          >
            Xem tin nhắn gốc
          </StorageMenuButton>
          <StorageMenuButton onClick={handleSaveToMachine}>
            Lưu về máy
          </StorageMenuButton>
          <div className="my-2 border-t border-border" />
          {buildResourceDeleteMenuItems(isPersonalCloud, recallLabel).map((action) => (
            <StorageMenuButton
              key={action.mode}
              tone="danger"
              onClick={() => void handleDelete(action.mode)}
              disabled={isBusy}
            >
              {action.label}
            </StorageMenuButton>
          ))}
        </StorageResourceMenu>
      ) : null}
    </div>
  );
};
