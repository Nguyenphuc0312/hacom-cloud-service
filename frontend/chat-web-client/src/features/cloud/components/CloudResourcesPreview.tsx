import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowPathIcon as RotateCcw,
  CalendarDaysIcon as CalendarDays,
  ClockIcon as Clock3,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  DocumentIcon as FileText,
  EllipsisHorizontalIcon,
  FolderOpenIcon,
  LinkIcon as Link2,
  PhotoIcon as ImageIcon,
  PlayIcon as Play,
  ArrowUturnRightIcon,
  TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import MediaThumbnail from "../../../components/common/MediaThumbnail";
import { ImagePreviewModal } from "../../../components/modals/ImagePreviewModal";
import { VideoPlayerModal } from "../../../components/info/shared-resources/VideoPlayerModal";
import { FileTypeIcon } from "../../../components/message/FileTypeIcon";
import type { CloudItem } from "../types";
import {
  formatBytes,
  getCloudItemTitle,
  getTrashCountdown,
} from "../utils/cloudFormat";
import { CloudItemIcon } from "./CloudItemIcon";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";
import { downloadResourceWithName, getHacomDesktopBridge } from "../../../utils/downloadFile";
import { getFileIconType } from "../../../utils/formatFileSize";

interface CloudResourcesPreviewProps {
  items: CloudItem[];
  trashItems?: CloudItem[];
  onViewTrash?: () => void;
  onLoadAllTrash?: () => Promise<void>;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  onDeleteTrashItem?: (item: CloudItem) => void;
  isMutating?: boolean;
  isLoadingTrash?: boolean;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
  userId?: string;
  senderName?: string;
  senderAvatar?: string;
}

const ACCESS_REQUEST_CONCURRENCY = 4;
const MEDIA_PREVIEW_LIMIT = 6;
type GalleryTab = "media" | "files" | "links";

const itemTitle = (item: CloudItem): string =>
  getCloudItemTitle(item, { text: "Nội dung", link: "Liên kết", file: "Tệp" });

export const CloudResourcesPreview: React.FC<CloudResourcesPreviewProps> = ({
  items,
  trashItems = [],
  onViewTrash,
  onLoadAllTrash,
  onRestoreTrashItem,
  onDeleteTrashItem,
  isMutating = false,
  isLoadingTrash = false,
  onDeleteItem,
  onViewOriginalMessage,
  onShowInFolder,
  userId,
  senderName,
  senderAvatar,
}) => {
  const [galleryTab, setGalleryTab] = useState<GalleryTab | null>(null);
  const [trashGalleryOpen, setTrashGalleryOpen] = useState(false);
  const [isLoadingTrashGallery, setIsLoadingTrashGallery] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [video, setVideo] = useState<CloudItem | null>(null);
  const [trashExpanded, setTrashExpanded] = useState(true);
  const [accessById, setAccessById] = useState<
    Record<string, { url: string; expiresAt: string }>
  >({});

  const resolvedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        accessUrl: accessById[item.id]?.url ?? item.accessUrl,
      })),
    [accessById, items],
  );
  const resolvedTrashItems = useMemo(
    () =>
      trashItems.map((item) => ({
        ...item,
        accessUrl: accessById[item.id]?.url ?? item.accessUrl,
      })),
    [accessById, trashItems],
  );
  const media = useMemo(
    () => resolvedItems.filter((item) => item.type === "image" || item.type === "video"),
    [resolvedItems],
  );
  const files = useMemo(
    () => resolvedItems.filter((item) => item.type === "file"),
    [resolvedItems],
  );
  const links = useMemo(
    () => resolvedItems.filter((item) => item.type === "link"),
    [resolvedItems],
  );
  const images = useMemo(
    () =>
      [...media, ...resolvedTrashItems]
        .filter((item) => item.type === "image" && item.accessUrl)
        .map((item) => ({
          url: item.accessUrl!,
          alt: itemTitle(item),
          senderName,
          senderAvatar,
          sentAt: item.createdAt,
          groupKey: item.id,
        })),
    [media, resolvedTrashItems, senderAvatar, senderName],
  );

  useEffect(() => {
    if (!userId) return;
    const candidates = [...media, ...files, ...resolvedTrashItems.filter((item) => item.type === "image" || item.type === "video" || item.type === "file")].filter((item) => {
      // Trash items remain owner-readable until purgeAfter, so hydrate their
      // signed URL just like active ready items for gallery previews.
      if (item.status !== "ready" && item.status !== "trashed") return false;
      const expiresAt = accessById[item.id]?.expiresAt ?? item.accessExpiresAt;
      return !expiresAt || Date.parse(expiresAt) - Date.now() <= 30_000;
    });
    if (!candidates.length) return;

    let cancelled = false;
    const entries: Array<
      readonly [string, { url: string; expiresAt: string }] | null
    > = Array.from({ length: candidates.length }, () => null);
    let nextIndex = 0;
    const hydrateNext = async (): Promise<void> => {
      while (!cancelled && nextIndex < candidates.length) {
        const index = nextIndex++;
        const item = candidates[index];
        try {
          const access = await getCachedCloudFileAccess(userId, item.id);
          entries[index] = [
            item.id,
            { url: access.url, expiresAt: access.expiresAt },
          ];
        } catch {
          entries[index] = null;
        }
      }
    };

    void Promise.all(
      Array.from(
        { length: Math.min(ACCESS_REQUEST_CONCURRENCY, candidates.length) },
        () => hydrateNext(),
      ),
    ).then(() => {
      if (cancelled) return;
      const next: Record<string, { url: string; expiresAt: string }> = {};
      entries.forEach((entry) => {
        if (entry) next[entry[0]] = entry[1];
      });
      if (Object.keys(next).length) {
        setAccessById((current) => {
          const changed = Object.entries(next).some(
            ([id, access]) =>
              current[id]?.url !== access.url ||
              current[id]?.expiresAt !== access.expiresAt,
          );
          return changed ? { ...current, ...next } : current;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessById, files, media, resolvedTrashItems, userId]);

  const openImage = (item: CloudItem) => {
    if (!item.accessUrl) return;
    const index = images.findIndex((image) => image.url === item.accessUrl);
    if (index >= 0) setLightboxIndex(index);
  };

  const openTrashGallery = async (): Promise<void> => {
    if (onLoadAllTrash) {
      setIsLoadingTrashGallery(true);
      try {
        await onLoadAllTrash();
      } catch {
        // Keep already loaded Trash items usable if a later page fails.
      } finally {
        setIsLoadingTrashGallery(false);
      }
    }
    setTrashGalleryOpen(true);
  };

  return (
    <>
      <div className="divide-y divide-[#eef0f4] border-y border-[#eef0f4] bg-surface">
        <ResourceSection label="Ảnh/Video" count={media.length}>
          {media.length ? (
            <>
              <div className="grid grid-cols-3 gap-1">
                {media.slice(0, MEDIA_PREVIEW_LIMIT).map((item, index) => {
                  const hasOverflow =
                    media.length > MEDIA_PREVIEW_LIMIT &&
                    index === MEDIA_PREVIEW_LIMIT - 1;
                  const remainingCount =
                    media.length - (MEDIA_PREVIEW_LIMIT - 1);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.accessUrl && !hasOverflow}
                      onClick={() =>
                        hasOverflow
                          ? setGalleryTab("media")
                          : item.type === "video"
                            ? setVideo(item)
                            : openImage(item)
                      }
                      className="group relative aspect-square overflow-hidden rounded-md bg-surface-overlay disabled:cursor-default"
                      aria-label={itemTitle(item)}
                    >
                      <MediaThumbnail
                        attachment={{
                          id: item.id,
                          type: item.type,
                          fileName: itemTitle(item),
                          mimeType: item.contentType ?? `${item.type}/*`,
                          sizeBytes: item.sizeBytes,
                          messageType: item.type,
                        }}
                        src={item.type === "image" ? item.accessUrl : null}
                        variant="grid"
                        alt={itemTitle(item)}
                        className="h-full w-full [&_.truncate]:text-[9px] [&_.truncate]:font-normal [&_.truncate]:leading-3"
                        imageClassName="transition-transform duration-200 group-hover:scale-105"
                      />
                      {hasOverflow ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[14px] font-bold text-white">
                          +{remainingCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {media.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setGalleryTab("media")}
                  className="mt-3 h-8 w-full rounded bg-[#e4e7ec] text-[13px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7]"
                >
                  Xem tất cả
                </button>
              ) : null}
            </>
          ) : (
            <p className="py-3 text-center text-[12px] text-text-muted">
              Chưa có ảnh hoặc video nào
            </p>
          )}
        </ResourceSection>

        <ResourceSection label="File" count={files.length}>
          {files.length ? <div className="space-y-0.5">{files.slice(0, 3).map((item) => <CloudFileRow key={item.id} item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : <p className="py-3 text-center text-[12px] text-text-muted">Chưa có File được chia sẻ trong hội thoại này</p>}
          {files.length >= 4 ? <button type="button" onClick={() => setGalleryTab("files")} className="mt-3 h-8 w-full rounded bg-[#e4e7ec] text-[13px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7]">Xem tất cả</button> : null}
        </ResourceSection>

        <ResourceSection label="Link" count={links.length}>
          {links.length ? <div className="space-y-0.5">{links.slice(0, 3).map((item) => <CloudLinkRow key={item.id} item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : <p className="py-3 text-center text-[12px] text-text-muted">Chưa có link nào được chia sẻ</p>}
          {links.length >= 4 ? <button type="button" onClick={() => setGalleryTab("links")} className="mt-3 h-8 w-full rounded bg-[#e4e7ec] text-[13px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7]">Xem tất cả</button> : null}
        </ResourceSection>

        <section className="border-t border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-text-primary transition-colors hover:bg-surface-hover"
            aria-expanded={trashExpanded}
            aria-controls="cloud-resource-section-trash"
            onClick={() => setTrashExpanded((open) => !open)}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-text-muted" aria-hidden />
              Thùng rác
              <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-muted">
                {trashItems.length}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${trashExpanded ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
          </button>
          {trashExpanded ? (
            <div id="cloud-resource-section-trash" className="px-4 pb-4">
              {isLoadingTrash ? (
                <div className="space-y-2 py-2" aria-label="Đang tải thùng rác">
                  {[1, 2, 3].map((value) => (
                    <div key={value} className="h-12 animate-pulse rounded-lg bg-surface-overlay" />
                  ))}
                </div>
              ) : trashItems.length === 0 ? (
                <p className="py-3 text-[12px] text-text-muted">Thùng rác đang trống</p>
              ) : (
                <>
                  <div className="flex items-center justify-between py-2 text-[11px] text-text-muted">
                    <span>{trashItems.length} mục</span>
                    <button
                      type="button"
                      className="font-medium text-primary"
                      onClick={onViewTrash}
                    >
                      Chọn
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {trashItems.slice(0, 3).map((item) => {
                      const countdown = getTrashCountdown(item.purgeAfter);
                      const title = itemTitle(item);
                      return (
                        <div
                          key={item.id}
                          className="group flex items-center gap-2.5 rounded-lg bg-surface-overlay px-2.5 py-1.5"
                        >
                          <CloudItemIcon type={item.type} className="h-8 w-8 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] leading-5 text-text-primary" title={title}>
                              {title}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] leading-4 text-text-muted">
                              {formatBytes(item.sizeBytes)}
                              <span aria-hidden>·</span>
                              <Clock3 className="h-3 w-3" aria-hidden />
                              {countdown.expired
                                ? "Đã hết hạn"
                                : countdown.hours > 0
                                  ? `Còn ${countdown.hours} giờ`
                                  : `Còn ${countdown.minutes} phút`}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5">
                            {onRestoreTrashItem ? (
                              <button
                                type="button"
                                onClick={() => void onRestoreTrashItem(item.id)}
                                disabled={isMutating || countdown.expired}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Khôi phục ${title}`}
                                title="Khôi phục"
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                            {onDeleteTrashItem ? (
                              <button
                                type="button"
                                onClick={() => onDeleteTrashItem(item)}
                                disabled={isMutating}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-danger opacity-0 transition-opacity hover:bg-danger/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Xóa vĩnh viễn ${title}`}
                                title="Xóa vĩnh viễn"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {trashItems.length >= 4 ? (
                    <button
                      type="button"
                      disabled={isLoadingTrashGallery}
                      onClick={() => void openTrashGallery()}
                      className="mt-3 w-full rounded-md bg-surface-overlay py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover"
                    >
                      {isLoadingTrashGallery ? "Đang tải…" : "Xem tất cả"}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>
      </div>
      {galleryTab ? <ResourceGallery tab={galleryTab} allItems={resolvedItems} onClose={() => setGalleryTab(null)} onOpenImage={openImage} onOpenVideo={setVideo} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
      {trashGalleryOpen ? <ResourceGallery title="Thùng rác" tab={resolvedTrashItems.some((item) => item.type === "image" || item.type === "video") ? "media" : resolvedTrashItems.some((item) => item.type === "file") ? "files" : "links"} allItems={resolvedTrashItems} onClose={() => setTrashGalleryOpen(false)} onOpenImage={openImage} onOpenVideo={setVideo} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
      <ImagePreviewModal isOpen={lightboxIndex !== null} onClose={() => setLightboxIndex(null)} images={images} initialIndex={lightboxIndex ?? 0} />
      <VideoPlayerModal isOpen={video !== null} onClose={() => setVideo(null)} url={video?.accessUrl ?? null} fileName={video ? itemTitle(video) : undefined} />
    </>
  );
};

const resourceUrl = (item: CloudItem): string => item.accessUrl?.trim() || item.url?.trim() || "";

const linkLabel = (item: CloudItem, url: string): string =>
  item.title?.trim() || url || itemTitle(item);

/** Documents are opened/downloaded through the row itself. Their overflow
 * menu intentionally starts at "Chia sẻ" (unlike audio/video resources). */
const isDocumentFile = (item: CloudItem): boolean => {
  if (item.type !== "file") return false;
  const mime = (item.contentType ?? "").toLowerCase();
  if (mime === "application/pdf" || mime.includes("word") || mime.includes("excel") || mime.includes("spreadsheet")) return true;
  const name = (item.title ?? item.content ?? "").split("?", 1)[0].toLowerCase();
  return /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|odt|ods)$/.test(name);
};

const shareResource = async (item: CloudItem): Promise<void> => {
  const url = resourceUrl(item);
  if (!url) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: itemTitle(item), url });
      return;
    }
    await navigator.clipboard?.writeText(url);
  } catch {
    // Sharing can be cancelled by the user; keep the row usable.
  }
};

interface ResourceActionProps {
  item: CloudItem;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
}

const ResourceActions: React.FC<ResourceActionProps> = ({ item, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderActionPending, setFolderActionPending] = useState(false);
  const url = resourceUrl(item);
  const documentFile = isDocumentFile(item);

  const openResource = () => {
    if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  };

  const openFolder = async () => {
    if (!url || folderActionPending) return;
    const fileName = item.title?.trim() || itemTitle(item);
    setFolderActionPending(true);
    try {
      const bridge = getHacomDesktopBridge();
      if (bridge?.openResourceInFolder) {
        await bridge.openResourceInFolder({ id: item.id, url, fileName });
        return;
      }
      // Links are web resources, not local files. Keep their normal browser
      // behaviour instead of downloading an HTML page as a fake attachment.
      if (item.type === "link") {
        openResource();
        return;
      }
      // Web browsers intentionally cannot open Explorer/Finder. Downloading
      // with the original name is the safe localhost fallback.
      await downloadResourceWithName(url, fileName);
    } finally {
      setFolderActionPending(false);
    }
  };

  return (
    <div className="pointer-events-none absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-border/70 bg-surface px-1.5 py-1 shadow-lg opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
      {item.type !== "link" ? (
        <button type="button" disabled={folderActionPending} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openFolder(); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-wait disabled:opacity-60" aria-label={`Mở thư mục chứa ${itemTitle(item)}`} title={folderActionPending ? "Đang tải…" : "Mở thư mục"}>
          <FolderOpenIcon className="h-4 w-4" />
        </button>
      ) : null}
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void shareResource(item); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary" aria-label={`Chia sẻ ${itemTitle(item)}`} title="Chia sẻ">
        <ArrowUturnRightIcon className="h-4 w-4" />
      </button>
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMenuOpen((open) => !open); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary" aria-label={`Thêm tùy chọn cho ${itemTitle(item)}`} title="Thêm tùy chọn" aria-expanded={menuOpen}>
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>
      {menuOpen ? (
        <div className="absolute bottom-full right-0 z-30 mb-2 min-w-[16rem] rounded-xl border border-border bg-surface p-2 text-sm shadow-2xl" onClick={(event) => event.stopPropagation()} role="menu">
          {!documentFile ? <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); openResource(); }}>Mở tài liệu</button> : null}
          <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); void shareResource(item); }}>Chia sẻ</button>
          <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); onViewOriginalMessage?.(item); }}>Xem tin nhắn gốc</button>
          <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); onShowInFolder?.(item); }}>Hiển thị trong thư mục</button>
          <div className="my-1 border-t border-border/70" />
          <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => { setMenuOpen(false); void onDeleteItem?.(item); }}>Xóa</button>
        </div>
      ) : null}
    </div>
  );
};

type ResourceRowProps = Omit<ResourceActionProps, "item"> & { item: CloudItem };

const CloudFileRow: React.FC<ResourceRowProps> = ({
  item,
  onDeleteItem,
  onViewOriginalMessage,
  onShowInFolder,
}) => {
  const fileName = itemTitle(item);
  const content = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <FileTypeIcon
          type={getFileIconType(item.contentType, fileName)}
          className="h-8 w-8"
        />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold leading-4 text-text-primary">
          {fileName}
        </span>
        <span className="mt-0.5 block truncate text-[10px] leading-4 text-text-muted">
          {formatBytes(item.sizeBytes)} · Bạn
        </span>
      </span>
      <span className="ml-2 max-w-[80px] shrink-0 truncate text-right text-[10px] text-text-muted group-hover:opacity-0">
        {formatSentDate(item.createdAt)}
      </span>
    </>
  );

  return (
    <div className="group relative rounded-md hover:bg-surface-hover">
      {item.accessUrl ? (
        <a
          href={item.accessUrl}
          download={itemTitle(item)}
          className="flex min-h-[54px] w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left"
        >
          {content}
        </a>
      ) : (
        <div className="flex min-h-[54px] w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left">
          {content}
        </div>
      )}
      <ResourceActions
        item={item}
        onDeleteItem={onDeleteItem}
        onViewOriginalMessage={onViewOriginalMessage}
        onShowInFolder={onShowInFolder}
      />
    </div>
  );
};

const CloudLinkRow: React.FC<ResourceRowProps> = ({
  item,
  onDeleteItem,
  onViewOriginalMessage,
  onShowInFolder,
}) => {
  const url = item.url?.trim() ?? "";
  const label = linkLabel(item, url);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return (
    <div className="group relative rounded-md hover:bg-surface-hover">
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-[54px] w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d5d9e0] bg-[#eef0f4] text-text-primary"><Link2 className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold leading-4 text-text-primary" title={label}>{label}</span><span className="block truncate text-[10px] leading-4 text-[#0068ff]" title={url}>{url || host}</span><span className="hidden truncate text-[10px] leading-4 text-text-muted min-[430px]:block">Bạn</span></span>
        <span className="ml-2 max-w-[80px] shrink-0 truncate text-right text-[10px] text-text-muted group-hover:opacity-0">{formatSentDate(item.createdAt)}</span>
      </a>
      <ResourceActions item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
    </div>
  );
};

const formatSentDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Ngày gửi";
  return `Ngày ${date.getDate()} Tháng ${date.getMonth() + 1}`;
};

const ResourceGallery: React.FC<{
  title?: "Kho lưu trữ" | "Thùng rác";
  tab: GalleryTab;
  allItems: CloudItem[];
  onClose: () => void;
  onOpenImage: (item: CloudItem) => void;
  onOpenVideo: (item: CloudItem) => void;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
}> = ({ title = "Kho lưu trữ", tab: initialTab, allItems, onClose, onOpenImage, onOpenVideo, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const [tab, setTab] = useState<GalleryTab>(initialTab);
  const [filterOpen, setFilterOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [calendarField, setCalendarField] = useState<"from" | "to" | null>(null);
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [suggestionPosition, setSuggestionPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const suggestionHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tabItems = useMemo(() => {
    const types: CloudItem["type"][] =
      tab === "media" ? ["image", "video"] : tab === "files" ? ["file"] : ["link"];
    return allItems.filter((item) => types.includes(item.type));
  }, [allItems, tab]);
  const filteredItems = useMemo(() => {
    const from = fromDate
      ? new Date(`${fromDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = toDate
      ? new Date(`${toDate}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;
    return tabItems.filter((item) => {
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
    });
  }, [fromDate, tabItems, toDate]);
  const groups = useMemo(() => {
    const grouped = new Map<string, CloudItem[]>();
    [...filteredItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .forEach((item) => {
        const key = formatSentDate(item.createdAt);
        grouped.set(key, [...(grouped.get(key) ?? []), item]);
      });
    return [...grouped.entries()];
  }, [filteredItems]);

  const tabLabel = tab === "media" ? "Ảnh/Video" : tab === "files" ? "Files" : "Links";
  const chooseSuggestion = (days: number) => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - days);
    const toInput = (date: Date) => date.toISOString().slice(0, 10);
    setFromDate(toInput(start));
    setToDate(toInput(today));
    setSuggestionsOpen(false);
    setSuggestionPosition(null);
  };
  const showSuggestions = (element: HTMLButtonElement) => {
    if (suggestionHideTimer.current) clearTimeout(suggestionHideTimer.current);
    const rect = element.getBoundingClientRect();
    setSuggestionPosition({ top: rect.top, left: Math.max(8, rect.left - 232) });
    setSuggestionsOpen(true);
  };
  const keepSuggestionsOpen = () => {
    if (suggestionHideTimer.current) clearTimeout(suggestionHideTimer.current);
  };
  const hideSuggestionsSoon = () => {
    if (suggestionHideTimer.current) clearTimeout(suggestionHideTimer.current);
    suggestionHideTimer.current = setTimeout(() => {
      setSuggestionsOpen(false);
      setSuggestionPosition(null);
    }, 120);
  };
  const openCalendar = (field: "from" | "to") => {
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
    setCalendarField(field);
    const selected = field === "from" ? fromDate : toDate;
    if (selected) setCalendarMonth(new Date(`${selected}T00:00:00`));
  };
  const cancelCalendar = () => {
    setCalendarField(null);
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
  };
  const confirmCalendar = () => {
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setCalendarField(null);
  };
  const selectCalendarDate = (value: string) => {
    if (calendarField === "from") {
      if (draftFromDate === value) {
        setDraftFromDate("");
        return;
      }
      setDraftFromDate(value);
      if (draftToDate && value > draftToDate) setDraftToDate("");
      setCalendarField("to");
      return;
    }
    if (draftToDate === value) {
      setDraftToDate("");
      return;
    }
    if (draftFromDate && value < draftFromDate) {
      setDraftFromDate(value);
      setDraftToDate("");
      setCalendarField("to");
      return;
    }
    setDraftToDate(value);
  };

  return (
    <section
      className="absolute inset-0 z-40 flex w-full flex-col overflow-hidden bg-surface shadow-2xl"
      aria-label={title}
    >
      <header className="flex min-h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border/70 px-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-[16px] font-semibold text-text-primary">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md px-2 text-[13px] font-medium text-text-primary hover:bg-surface-hover"
        >
          Chọn
        </button>
      </header>
      <nav className="flex h-14 shrink-0 border-b border-border px-5" aria-label="Loại nội dung">
        {(["media", "files", "links"] as const).map((key) => {
          const label = key === "media" ? "Ảnh/Video" : key === "files" ? "Files" : "Links";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center border-b-2 text-base font-medium ${key === tab ? "border-primary text-primary" : "border-transparent text-text-primary"}`}
            >
              {label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto bg-surface-muted pb-8">
        <div className="relative mx-5 my-4">
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            className="flex h-9 w-full items-center justify-between rounded-full bg-surface-overlay px-4 text-base text-text-secondary"
          >
            <span>Ngày gửi</span>
            <ChevronDown className={`h-5 w-5 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
          </button>
          {filterOpen ? (
            <div className="absolute left-3 right-3 top-11 z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain">
              <div className="relative rounded-xl border border-border bg-surface p-3 shadow-xl">
                <button
                  type="button"
                  onMouseEnter={(event) => showSuggestions(event.currentTarget)}
                  onMouseLeave={hideSuggestionsSoon}
                  onFocus={(event) => showSuggestions(event.currentTarget)}
                  onClick={(event) => {
                    if (suggestionsOpen) {
                      setSuggestionsOpen(false);
                      setSuggestionPosition(null);
                    } else {
                      showSuggestions(event.currentTarget);
                    }
                  }}
                  className="flex w-full items-center justify-between border-b border-border/70 pb-4 text-left text-base text-text-primary"
                >
                  <span>Gợi ý thời gian</span>
                  <ChevronRight className={`h-5 w-5 transition-transform ${suggestionsOpen ? "rotate-90" : ""}`} />
                </button>
                <div className="pt-4">
                  <p className="mb-3 text-base text-text-primary">Chọn khoảng thời gian</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => openCalendar("from")}
                      className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "from" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}
                    >
                      {draftFromDate ? formatCalendarDate(draftFromDate) : fromDate ? formatCalendarDate(fromDate) : "Từ ngày"}
                      <CalendarDays className="h-6 w-6 shrink-0 text-text-muted" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCalendar("to")}
                      className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "to" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}
                    >
                      {draftToDate ? formatCalendarDate(draftToDate) : toDate ? formatCalendarDate(toDate) : "Đến ngày"}
                      <CalendarDays className="h-6 w-6 shrink-0 text-text-muted" />
                    </button>
                  </div>
                </div>
                {calendarField ? (
                  <CalendarPicker
                    month={calendarMonth}
                    fromDate={draftFromDate}
                    toDate={draftToDate}
                    onMonthChange={setCalendarMonth}
                    onSelect={selectCalendarDate}
                    onCancel={cancelCalendar}
                    onConfirm={confirmCalendar}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {groups.length ? groups.map(([date, group]) => (
          <section key={date} className="mb-3 border-b-8 border-surface-muted bg-surface px-5 pb-5 pt-4">
            <h3 className="mb-5 text-lg font-semibold text-text-primary">{date}</h3>
            {tab === "media" ? <div className="grid grid-cols-3 gap-3">{group.map((item) => <button key={item.id} type="button" disabled={!item.accessUrl} onClick={() => item.type === "video" ? onOpenVideo(item) : onOpenImage(item)} className="group relative aspect-square overflow-hidden rounded-md bg-surface-overlay disabled:cursor-default"><GalleryMedia item={item} /></button>)}</div> : null}
            {tab === "files" ? <div className="space-y-2">{group.map((item) => <GalleryFile key={item.id} item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : null}
            {tab === "links" ? <div className="space-y-2">{group.map((item) => <GalleryLink key={item.id} item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : null}
          </section>
        )) : <EmptyState icon={tab === "media" ? <ImageIcon /> : tab === "files" ? <FileText /> : <Link2 />} label={`Chưa có ${tabLabel.toLowerCase()}`} />}
      </div>
      {suggestionsOpen && suggestionPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[1000] grid w-56 gap-1 rounded-xl border border-border bg-surface p-3 shadow-2xl"
              style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
              onMouseEnter={keepSuggestionsOpen}
              onMouseLeave={hideSuggestionsSoon}
              role="menu"
            >
              {[
                [7, "7 ngày trước"],
                [30, "30 ngày trước"],
                [90, "3 tháng trước"],
              ].map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => chooseSuggestion(Number(days))}
                  className="rounded-md px-2 py-2 text-left text-base text-text-secondary hover:bg-surface-hover"
                  role="menuitem"
                >
                  {label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </section>
  );
};

const GalleryMedia: React.FC<{ item: CloudItem }> = ({ item }) =>
  item.accessUrl ? (
    item.type === "image" ? (
      <img src={item.accessUrl} alt={itemTitle(item)} className="h-full w-full object-cover" loading="lazy" />
    ) : (
      <>
        <video src={item.accessUrl} className="h-full w-full object-cover" muted preload="metadata" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/15">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
            <Play className="h-5 w-5" fill="currentColor" />
          </span>
        </span>
      </>
    )
  ) : (
    <ImageIcon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-text-muted" />
  );

const GalleryFile: React.FC<ResourceRowProps> = ({ item, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => (
  <div className="group relative rounded-lg bg-surface-overlay">
    {item.accessUrl ? <a href={item.accessUrl} download={itemTitle(item)} className="flex items-center gap-3 rounded-lg p-3 pr-28"><FileText className="h-7 w-7 text-text-muted" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{itemTitle(item)}</span><span className="text-xs text-text-muted">{formatBytes(item.sizeBytes)}</span></span></a> : <div className="flex items-center gap-3 rounded-lg p-3 pr-28"><FileText className="h-7 w-7 text-text-muted" /><span className="truncate text-sm text-text-primary">{itemTitle(item)}</span></div>}
    <ResourceActions item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
  </div>
);

const GalleryLink: React.FC<ResourceRowProps> = ({ item, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const url = item.url?.trim() ?? "";
  const label = linkLabel(item, url);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return <div className="group relative rounded-lg bg-surface-overlay"><a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg p-3 pr-28"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary" title={label}>{label}</span><span className="block truncate text-xs text-text-muted" title={host}>{host}</span></span></a><ResourceActions item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /></div>;
};

const formatCalendarDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

const dateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const CalendarPicker: React.FC<{
  month: Date;
  fromDate: string;
  toDate: string;
  onMonthChange: (date: Date) => void;
  onSelect: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ month, fromDate, toDate, onMonthChange, onSelect, onCancel, onConfirm }) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(1 - firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const todayValue = dateInputValue(new Date());

  return (
    <div
      className="relative z-30 mx-auto mt-3 w-full max-w-[360px] max-h-[calc(100dvh-18rem)] min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pb-2 text-lg font-medium text-text-primary">
        <span>Tháng {month.getMonth() + 1}, {month.getFullYear()}</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="h-8 w-8 rounded-full text-2xl leading-none hover:bg-surface-hover" aria-label="Tháng trước">‹</button>
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="h-8 w-8 rounded-full text-2xl leading-none hover:bg-surface-hover" aria-label="Tháng sau">›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 border-t border-border/70 pt-1 text-center text-sm font-medium text-text-secondary">
        {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => <span key={day} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
        {days.map((date) => {
          const value = dateInputValue(date);
          const inMonth = date.getMonth() === month.getMonth();
          const locked = value > todayValue || (Boolean(toDate) && value > toDate);
          const selected = value === fromDate || value === toDate;
          const between = Boolean(fromDate && toDate && value > fromDate && value < toDate);
          return (
            <button
              key={value}
              type="button"
              disabled={locked}
              onClick={() => onSelect(value)}
              className={`relative h-7 rounded-md text-xs ${locked ? "cursor-not-allowed bg-surface-muted text-text-muted/45" : inMonth ? "text-text-primary" : "text-text-muted/60"} ${between && !locked ? "bg-primary/10" : ""} ${selected && !locked ? "bg-primary text-white" : !locked ? "hover:bg-surface-hover" : ""}`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-2 flex justify-end gap-2 border-t border-border/70 bg-surface pt-2">
        <button type="button" onClick={onCancel} className="rounded-md bg-surface-overlay px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover">Hủy</button>
        <button type="button" onClick={onConfirm} disabled={!fromDate && !toDate} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Xác nhận</button>
      </div>
    </div>
  );
};

const ResourceSection: React.FC<{
  label: string;
  count: number;
  children: React.ReactNode;
}> = ({ label, count, children }) => {
  const [expanded, setExpanded] = useState(true);
  const contentId = `cloud-resource-section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="bg-surface px-5 py-3">
      <button
        type="button"
        className="mb-2.5 flex w-full items-center justify-between text-left text-[14px] font-semibold text-text-primary"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2.5">
          {count > 0 ? (
            <span className="text-[12px] font-normal text-text-muted">{count}</span>
          ) : null}
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          )}
        </span>
      </button>
      {expanded ? <div id={contentId}>{children}</div> : null}
    </section>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactElement<{ className?: string }>;
  label: string;
}> = ({ icon, label }) => (
  <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-text-muted">
    {React.cloneElement(icon, { className: "h-7 w-7" })}
    <p className="text-xs leading-5">{label}</p>
  </div>
);
