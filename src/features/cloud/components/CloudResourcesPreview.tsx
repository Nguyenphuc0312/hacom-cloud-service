import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftIcon as ArrowLeft,
  ArrowPathIcon as RotateCcw,
  CheckIcon as Check,
  CalendarDaysIcon as CalendarDays,
  ChevronDownIcon as ChevronDown,
  ChevronRightIcon as ChevronRight,
  ClockIcon as Clock,
  DocumentIcon as FileText,
  ArrowDownTrayIcon as Download,
  EllipsisHorizontalIcon,
  FolderOpenIcon,
  LinkIcon as Link2,
  PhotoIcon as ImageIcon,
  PlayIcon as Play,
  ArrowUturnRightIcon,
  TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { ImagePreviewModal } from "../../../components/modals/ImagePreviewModal";
import { VideoPlayerModal } from "../../../components/info/shared-resources/VideoPlayerModal";
import { MediaThumbnail } from "../../../components/common/MediaThumbnail";
import FileTypeIcon from "../../../components/message/FileTypeIcon";
import { getFileIconType } from "../../../utils/formatFileSize";
import type { CloudItem } from "../types";
import { CloudItemIcon } from "./CloudItemIcon";
import { formatBytes, formatCloudDateTime, getCloudItemTitle, getTrashCountdown, getTrashExpiry, getTrashSortTime, isTrashItemExpired, normalizeCloudItemType } from "../utils/cloudFormat";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";
import { downloadResourceWithName, getHacomDesktopBridge } from "../../../utils/downloadFile";
import { formatRelativeDate } from "../../../utils/formatTime";

interface CloudResourcesPreviewProps {
  items: CloudItem[];
  trashItems?: CloudItem[];
  onLoadAllTrash?: () => Promise<void>;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  onPermanentDeleteItem?: (itemId: string) => void | Promise<void>;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
  userId?: string;
  senderName?: string;
  senderAvatar?: string;
}

const itemTitle = (item: CloudItem): string =>
  item.type === "audio" && !item.title?.trim()
    ? "Tin nhắn thoại"
    : getCloudItemTitle(item, { text: "Nội dung", link: "Liên kết", file: "Tệp" });

export const CloudResourcesPreview: React.FC<CloudResourcesPreviewProps> = ({
  items,
  trashItems = [],
  onLoadAllTrash,
  onRestoreTrashItem,
  onPermanentDeleteItem,
  onDeleteItem,
  onViewOriginalMessage,
  onShowInFolder,
  userId,
  senderName,
  senderAvatar,
}) => {
  const [galleryTab, setGalleryTab] = useState<GalleryTab | null>(null);
  const [trashGalleryOpen, setTrashGalleryOpen] = useState(false);
  const [trashGalleryTab, setTrashGalleryTab] = useState<GalleryTab | null>(null);
  const [isLoadingTrashGallery, setIsLoadingTrashGallery] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxCollection, setLightboxCollection] = useState<"active" | "trash">("active");
  const [video, setVideo] = useState<CloudItem | null>(null);
  const [trashExpanded, setTrashExpanded] = useState(true);
  const [trashNow, setTrashNow] = useState(() => Date.now());
  const [accessById, setAccessById] = useState<Record<string, { url: string; expiresAt: string }>>({});

  const resolvedItems = useMemo(
    () => items.map((item) => ({ ...normalizeCloudItemType(item), accessUrl: accessById[item.id]?.url ?? item.accessUrl })),
    [accessById, items],
  );
  const resolvedTrashItems = useMemo(
    () => trashItems
      .filter((item) => !isTrashItemExpired(item, trashNow))
      .map((item) => ({ ...normalizeCloudItemType(item), accessUrl: accessById[item.id]?.url ?? item.accessUrl }))
      .sort((a, b) => getTrashSortTime(b) - getTrashSortTime(a)),
    [accessById, trashItems, trashNow],
  );
  const media = useMemo(() => resolvedItems.filter((item) => item.type === "image" || item.type === "video"), [resolvedItems]);
  const files = useMemo(() => resolvedItems.filter((item) => item.type === "file"), [resolvedItems]);
  const links = useMemo(() => resolvedItems.filter((item) => item.type === "link"), [resolvedItems]);
  const activeImages = useMemo(
    () => media.filter((item) => item.type === "image" && item.accessUrl).map((item) => ({ url: item.accessUrl!, alt: itemTitle(item), senderName, senderAvatar, sentAt: item.createdAt, groupKey: item.id })),
    [media, senderAvatar, senderName],
  );
  const trashImages = useMemo(
    () => resolvedTrashItems.filter((item) => item.type === "image" && item.accessUrl).map((item) => ({ url: item.accessUrl!, alt: itemTitle(item), senderName, senderAvatar, sentAt: item.createdAt, groupKey: item.id })),
    [resolvedTrashItems, senderAvatar, senderName],
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
    void Promise.all(candidates.map(async (item) => {
      try { const access = await getCachedCloudFileAccess(userId, item.id); return [item.id, { url: access.url, expiresAt: access.expiresAt }] as const; } catch { return null; }
    })).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter((entry): entry is readonly [string, { url: string; expiresAt: string }] => Boolean(entry)));
      if (Object.keys(next).length) setAccessById((current) => ({ ...current, ...next }));
    });
    return () => { cancelled = true; };
  }, [accessById, files, media, resolvedTrashItems, userId]);

  useEffect(() => {
    if (!trashItems.length) return;
    const timer = window.setInterval(() => setTrashNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [trashItems.length]);

  const openImage = (item: CloudItem, collection: "active" | "trash") => {
    if (!item.accessUrl) return;
    const collectionImages = collection === "trash" ? trashImages : activeImages;
    const index = collectionImages.findIndex((image) => image.url === item.accessUrl);
    if (index >= 0) {
      setLightboxCollection(collection);
      setLightboxIndex(index);
    }
  };
  const openActiveImage = (item: CloudItem) => openImage(item, "active");
  const openTrashImage = (item: CloudItem) => openImage(item, "trash");

  const openTrashGallery = async (preferredTab?: GalleryTab) => {
    if (onLoadAllTrash) {
      setIsLoadingTrashGallery(true);
      try {
        await onLoadAllTrash();
      } catch {
        // Keep the already loaded trash items usable if a later page fails.
      } finally {
        setIsLoadingTrashGallery(false);
      }
    }
    const fallbackTab = resolvedTrashItems.some((item) => item.type === "image" || item.type === "video")
      ? "media"
      : resolvedTrashItems.some((item) => item.type === "file")
        ? "files"
        : resolvedTrashItems.some((item) => item.type === "link")
          ? "links"
          : "text";
    setTrashGalleryTab(preferredTab ?? fallbackTab);
    setTrashGalleryOpen(true);
  };

  const galleryTabForItem = (item: CloudItem): GalleryTab =>
    item.type === "image" || item.type === "video" ? "media" : item.type === "file" ? "files" : item.type === "link" ? "links" : "text";

  return (
    <>
      <div className="divide-y divide-[#eef0f4] border-y border-[#eef0f4] bg-surface">
        <ResourceSection label="Ảnh/Video" count={media.length}>
          {media.length ? <>
            <div className="grid grid-cols-3 gap-1.5">
              {media.slice(0, 6).map((item) => (
                <div key={item.id} className="group relative aspect-square">
                  <button type="button" disabled={!item.accessUrl} onClick={() => item.type === "video" ? setVideo(item) : openActiveImage(item)} className="group relative h-full w-full overflow-hidden rounded-lg bg-surface-overlay transition-shadow hover:ring-2 hover:ring-primary/50 disabled:cursor-default" aria-label={itemTitle(item)}>
                    {item.accessUrl ? item.type === "image" ? <img src={item.accessUrl} alt={itemTitle(item)} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" /> : <video src={item.accessUrl} className="h-full w-full object-cover" muted preload="metadata" /> : <ImageIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-text-muted" />}
                    {item.type === "video" ? <span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-sm"><Play className="h-5 w-5" fill="currentColor" /></span></span> : null}
                  </button>
                  <ResourceActions compact placement="top" align="left" item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
                </div>
              ))}
            </div>
            <ViewAllButton onClick={() => setGalleryTab("media")} />
          </> : <ResourceEmptyText>Chưa có ảnh hoặc video nào</ResourceEmptyText>}
        </ResourceSection>

        <ResourceSection label="File" count={files.length}>
          {files.length ? <><div className="space-y-1.5">{files.slice(0, 3).map((item) => <CloudFileRow key={item.id} item={item} senderName={senderName} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div><ViewAllButton onClick={() => setGalleryTab("files")} /></> : <ResourceEmptyText>Chưa có File được chia sẻ trong hội thoại này</ResourceEmptyText>}
        </ResourceSection>

        <ResourceSection label="Link" count={links.length}>
          {links.length ? <><div className="space-y-1.5">{links.slice(0, 3).map((item) => <CloudLinkRow key={item.id} item={item} senderName={senderName} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div><ViewAllButton onClick={() => setGalleryTab("links")} /></> : <ResourceEmptyText>Chưa có link nào được chia sẻ</ResourceEmptyText>}
        </ResourceSection>

        <section className="bg-surface px-5 py-3">
          <button type="button" className="mb-2.5 flex w-full items-center justify-between text-left text-[16px] font-semibold text-text-primary transition-colors" aria-expanded={trashExpanded} aria-controls="cloud-resource-section-trash" onClick={() => setTrashExpanded((open) => !open)}>
            <span>Thùng rác</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${trashExpanded ? "" : "-rotate-90"}`} aria-hidden="true" />
          </button>
          {trashExpanded ? <div id="cloud-resource-section-trash">
            {resolvedTrashItems.length ? <>
              <div className="flex items-center justify-between py-2 text-sm text-text-muted">
                <span>{resolvedTrashItems.length} mục</span>
              </div>
              {resolvedTrashItems.slice(0, 3).map((item) => {
                const countdown = getTrashCountdown(getTrashExpiry(item.purgeAfter, item.deletedAt), trashNow);
                const remaining = countdown.hours > 0
                  ? `Còn khoảng ${countdown.hours} giờ`
                  : `Còn khoảng ${countdown.minutes} phút`;
                return <div key={item.id} className="group relative flex items-center gap-3 rounded-lg bg-surface-overlay px-3 py-2">
                <button type="button" onClick={() => void openTrashGallery(galleryTabForItem(item))} className="flex min-w-0 flex-1 items-center gap-3 rounded-md pr-3 text-left hover:bg-surface-hover" aria-label={`Mở ${itemTitle(item)} trong kho lưu trữ`}>
                  <CloudResourceThumbnail item={item} />
                  <span className="min-w-0 flex-1 pr-2"><span className="block truncate text-[14px] font-semibold leading-5 text-text-primary" title={itemTitle(item)}>{itemTitle(item)}</span><span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-5 text-text-muted"><span className="shrink-0">{formatBytes(item.sizeBytes)}</span><span className="shrink-0" aria-hidden="true">·</span><span className="flex shrink-0 items-center gap-1"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{remaining}</span></span></span></span>
                </button>
                <ResourceActions compact placement="top" isTrash trashNow={trashNow} item={item} onRestoreItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
              </div>;
              })}
              {resolvedTrashItems.length > 0 ? <button type="button" disabled={isLoadingTrashGallery} onClick={() => void openTrashGallery()} className="mt-3 w-full rounded-md bg-surface-overlay py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60">{isLoadingTrashGallery ? "Đang tải…" : "Xem tất cả"}</button> : null}
            </> : <p className="py-3 text-sm text-text-muted">Thùng rác đang trống</p>}
          </div> : null}
        </section>
      </div>
      {galleryTab ? <ResourceGallery title="Kho lưu trữ" tab={galleryTab} allItems={resolvedItems} onClose={() => setGalleryTab(null)} onOpenImage={openActiveImage} onOpenVideo={setVideo} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
      {trashGalleryOpen ? <ResourceGallery title="Thùng rác" tab={trashGalleryTab ?? "media"} allItems={resolvedTrashItems} onClose={() => setTrashGalleryOpen(false)} onOpenImage={openTrashImage} onOpenVideo={setVideo} onDeleteItem={onDeleteItem} onRestoreTrashItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
      <ImagePreviewModal isOpen={lightboxIndex !== null} onClose={() => setLightboxIndex(null)} images={lightboxCollection === "trash" ? trashImages : activeImages} initialIndex={lightboxIndex ?? 0} />
      <VideoPlayerModal isOpen={video !== null} onClose={() => setVideo(null)} url={video?.accessUrl ?? null} fileName={video ? itemTitle(video) : undefined} />
    </>
  );
};

const resourceUrl = (item: CloudItem): string => item.accessUrl?.trim() || item.url?.trim() || "";

/** Compact, Hacom Chat-style thumbnail for rows in the conversation drawer. */
const CloudResourceThumbnail: React.FC<{ item: CloudItem }> = ({ item }) => {
  const name = itemTitle(item);
  const attachment = {
    id: item.id,
    type: item.type,
    url: item.accessUrl,
    downloadUrl: item.accessUrl,
    fileName: name,
    mimeType: item.contentType,
    sizeBytes: item.sizeBytes,
  };

  if (item.type === "image" || item.type === "video") {
    return (
      <MediaThumbnail
        attachment={attachment}
        variant="reply"
        className="h-10 w-10 shrink-0 rounded-lg"
        imageClassName="object-cover"
        alt={name}
      />
    );
  }

  if (item.type === "file") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-overlay">
        <FileTypeIcon
          type={getFileIconType(item.contentType, name)}
          fileName={name}
          className="h-7 w-7"
        />
      </span>
    );
  }

  return <CloudItemIcon type={item.type} className="h-10 w-10 shrink-0" />;
};

const linkLabel = (item: CloudItem, url: string): string => {
  const title = item.title?.trim();
  if (!title) return url || itemTitle(item);

  // Cloud may receive a generated preview title containing only the host
  // (for example "localhost" or "facebook.com"). In that case keep the
  // complete URL in the first line so paths/query strings are not lost.
  try {
    const parsed = new URL(url);
    const normalizedTitle = title
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const hostWithPort = parsed.host.replace(/^www\./i, "").toLowerCase();
    if (normalizedTitle === host || normalizedTitle === hostWithPort) return url;
  } catch {
    // Keep a custom title for malformed/non-http URLs.
  }

  return title;
};

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

// All resource rows share one menu surface.  Dispatching a small window event
// lets independently rendered rows close one another before a new menu opens;
// this also covers rows rendered in different sections (active and trash).
const RESOURCE_MENU_OPEN_EVENT = "hacom-cloud-resource-menu-open";
type ResourceMenuOpenDetail = { itemId: string };

interface ResourceActionProps {
  item: CloudItem;
  compact?: boolean;
  placement?: "center" | "top";
  align?: "left" | "right";
  isTrash?: boolean;
  trashNow?: number;
  onRestoreItem?: (itemId: string) => void | Promise<void>;
  onPermanentDeleteItem?: (itemId: string) => void | Promise<void>;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
}

const ResourceActions: React.FC<ResourceActionProps> = ({ item, compact = false, placement = "center", align = "right", isTrash = false, trashNow = Date.now(), onRestoreItem, onPermanentDeleteItem, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [folderActionPending, setFolderActionPending] = useState(false);
  const url = resourceUrl(item);
  const documentFile = isDocumentFile(item);
  const trashExpired = isTrash && isTrashItemExpired(item, trashNow);
  // Trash actions are rendered at the top-right of every resource row. Keep
  // their overflow menu below the two action buttons (restore/permanent
  // delete are shown from that menu), matching the Hacom Chat interaction.
  const actionPlacement = isTrash ? "top" : placement;

  useEffect(() => {
    const closeOtherMenu = (event: Event) => {
      const detail = (event as CustomEvent<ResourceMenuOpenDetail>).detail;
      if (detail?.itemId !== item.id) {
        setMenuOpen(false);
        setMenuPosition(null);
      }
    };
    window.addEventListener(RESOURCE_MENU_OPEN_EVENT, closeOtherMenu);
    return () => window.removeEventListener(RESOURCE_MENU_OPEN_EVENT, closeOtherMenu);
  }, [item.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (actionBarRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setMenuOpen(false);
      setMenuPosition(null);
    };
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [menuOpen]);

  // The menu is portaled to document.body so it cannot be clipped by a
  // scrolling resource panel. Keep its fixed coordinates tied to the action
  // bar while the panel or viewport moves; otherwise a scroll leaves the menu
  // floating at the old (often far-away) position.
  useEffect(() => {
    if (!menuOpen) return;
    const updateMenuPosition = () => {
      const rect = actionBarRef.current?.getBoundingClientRect();
      if (!rect || typeof window === "undefined") return;
      const menuWidth = 256;
      const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 300;
      const gap = 8;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
      const belowTop = rect.bottom + gap;
      const aboveTop = rect.top - menuHeight - gap;
      const canFitBelow = belowTop + menuHeight <= window.innerHeight - gap;
      const canFitAbove = aboveTop >= gap;
      // Prefer the position shown by Hacom Chat: directly below the action
      // bar. Only use above as a last resort when the viewport has no room.
      const top = canFitBelow
        ? belowTop
        : canFitAbove
          ? aboveTop
          : Math.max(gap, Math.min(belowTop, window.innerHeight - menuHeight - gap));
      setMenuPosition({ top, left });
    };

    updateMenuPosition();
    const frameId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen]);

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

  const toggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isTrash) return;
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = actionBarRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const menuWidth = 256;
    const menuHeight = 300;
    const gap = 8;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - menuHeight - gap;
    const maxTop = Math.max(8, window.innerHeight - menuHeight - gap);
    const canFitBelow = belowTop + menuHeight <= window.innerHeight - gap;
    const canFitAbove = aboveTop >= gap;
    // Open below whenever there is room. The previous center-placement path
    // preferred `aboveTop`, which made menus appear far above the ellipsis.
    const top = canFitBelow ? belowTop : canFitAbove ? aboveTop : maxTop;
    window.dispatchEvent(new CustomEvent<ResourceMenuOpenDetail>(RESOURCE_MENU_OPEN_EVENT, { detail: { itemId: item.id } }));
    setMenuPosition({ top, left });
    setMenuOpen(true);
  };

  return (
    <>
    <div ref={actionBarRef} className={`pointer-events-none absolute ${align === "left" ? "left-2" : "right-2"} z-40 flex items-center gap-1 rounded-lg border border-border/70 bg-surface px-1.5 py-1 shadow-lg opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 ${menuOpen ? "pointer-events-auto opacity-100" : ""} ${actionPlacement === "top" ? "top-2" : "top-1/2 -translate-y-1/2"}`}>
      {isTrash ? <>
        <button type="button" disabled={trashExpired || !onRestoreItem} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!trashExpired) void onRestoreItem?.(item.id); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Khôi phục ${itemTitle(item)}`} title={trashExpired ? "Đã hết hạn khôi phục" : "Khôi phục"}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (onPermanentDeleteItem) void onPermanentDeleteItem(item.id); else void onDeleteItem?.(item); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" aria-label={`Xóa vĩnh viễn ${itemTitle(item)}`} title="Xóa vĩnh viễn">
          <Trash2 className="h-4 w-4" />
        </button>
      </> : <>
        {!compact && item.type !== "link" ? (
          <button type="button" disabled={folderActionPending} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openFolder(); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-wait disabled:opacity-60" aria-label={`Mở thư mục chứa ${itemTitle(item)}`} title={folderActionPending ? "Đang tải…" : "Mở thư mục"}>
            <FolderOpenIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void shareResource(item); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary" aria-label={`Chia sẻ ${itemTitle(item)}`} title="Chia sẻ">
          <ArrowUturnRightIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={toggleMenu} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary" aria-label={`Thêm tùy chọn cho ${itemTitle(item)}`} title="Thêm tùy chọn" aria-expanded={menuOpen}>
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </button>
      </>}
    </div>
    {!isTrash && menuOpen && menuPosition && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="fixed z-[10000] max-h-[calc(100dvh-1rem)] min-w-[16rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2 text-sm shadow-2xl" style={{ top: menuPosition.top, left: menuPosition.left }} onClick={(event) => event.stopPropagation()} role="menu">
          <>
            {!documentFile ? <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); openResource(); }}>Mở tài liệu</button> : null}
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); void shareResource(item); }}>Chia sẻ</button>
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); onViewOriginalMessage?.(item); }}>Xem tin nhắn gốc</button>
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-hover" onClick={() => { setMenuOpen(false); onShowInFolder?.(item); }}>Hiển thị trong thư mục</button>
            <div className="my-1 border-t border-border/70" />
            <button type="button" role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => { setMenuOpen(false); void onDeleteItem?.(item); }}>Xóa</button>
          </>
        </div>
      , document.body) : null}
    </>
  );
};

type ResourceRowProps = Omit<ResourceActionProps, "item"> & {
  item: CloudItem;
  senderName?: string;
  trashNow?: number;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
};

const CloudFileRow: React.FC<ResourceRowProps> = ({ item, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const name = itemTitle(item);
  const date = formatRelativeDate(new Date(item.createdAt));
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <FileTypeIcon
          type={getFileIconType(item.contentType, name)}
          fileName={name}
          className="h-10 w-10"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-5 text-text-primary" title={name}>{name}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-5 text-text-muted">{formatBytes(item.sizeBytes)}</span>
      </span>
      <span className="ml-2 max-w-[6rem] shrink-0 truncate text-right text-[12px] text-text-muted transition-opacity group-hover:opacity-0">{date}</span>
    </>
  );

  return (
    <div className="group relative rounded-lg hover:bg-surface-hover">
      {item.accessUrl ? (
        <a href={item.accessUrl} download={name} className="flex min-h-[64px] w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-hover">
          {content}
        </a>
      ) : (
        <div className="flex min-h-[64px] w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-hover">{content}</div>
      )}
      <ResourceActions item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
    </div>
  );
};

const CloudLinkRow: React.FC<ResourceRowProps & { senderName?: string }> = ({ item, senderName, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const url = item.url?.trim() ?? "";
  const label = linkLabel(item, url);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return (
    <div className="group relative rounded-lg hover:bg-surface-hover">
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-1 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-overlay text-text-primary"><Link2 className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-text-primary" title={label}>{label}</span><span className="block truncate text-sm text-primary" title={url}>{url}</span><span className="sr-only">{host}</span><span className="block truncate text-sm text-text-muted">{senderName ?? "Bạn"} · {formatCloudDateTime(item.createdAt, "vi-VN")}</span></span>
      </a>
      <ResourceActions item={item} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />
    </div>
  );

};

type GalleryTab = "media" | "files" | "links" | "text";

const formatSentDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Ngày gửi";
  return `Ngày ${date.getDate()} Tháng ${date.getMonth() + 1}`;
};

const trashRemainingLabel = (item: CloudItem, now: number): string => {
  const countdown = getTrashCountdown(getTrashExpiry(item.purgeAfter, item.deletedAt), now);
  if (countdown.hours > 0) return `Còn khoảng ${countdown.hours} giờ`;
  return `Còn khoảng ${countdown.minutes} phút`;
};

const ResourceGallery: React.FC<{
  title: "Kho lưu trữ" | "Thùng rác";
  tab: GalleryTab;
  allItems: CloudItem[];
  onClose: () => void;
  onOpenImage: (item: CloudItem) => void;
  onOpenVideo: (item: CloudItem) => void;
  onDeleteItem?: (item: CloudItem) => void | Promise<void>;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  onPermanentDeleteItem?: (itemId: string) => void | Promise<void>;
  onViewOriginalMessage?: (item: CloudItem) => void;
  onShowInFolder?: (item: CloudItem) => void;
}> = ({ title, tab: initialTab, allItems, onClose, onOpenImage, onOpenVideo, onDeleteItem, onRestoreTrashItem, onPermanentDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const [tab, setTab] = useState<GalleryTab>(initialTab);
  const isTrash = title === "Thùng rác";
  const [trashNow, setTrashNow] = useState(() => Date.now());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [calendarField, setCalendarField] = useState<"from" | "to" | null>(null);
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [suggestionPosition, setSuggestionPosition] = useState<{ top: number; left: number } | null>(null);
  const suggestionHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const selectionPointerDown = useRef(false);
  const selectionDragRef = useRef<{ anchorId: string; baseIds: Set<string> } | null>(null);

  useEffect(() => {
    if (!isTrash) return;
    const timer = window.setInterval(() => setTrashNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isTrash]);
  const tabItems = useMemo(() => {
    // Keep text messages and voice recordings together.  Hacom Chat treats
    // both as conversation messages rather than downloadable files, so the
    // Trash "Tin nhắn" tab must include both resource types.
    const type = tab === "media" ? ["image", "video"] : tab === "files" ? ["file"] : tab === "links" ? ["link"] : ["text", "audio"];
    return allItems.filter((item) => type.includes(item.type));
  }, [allItems, tab]);
  const filteredItems = useMemo(() => {
    if (isTrash) return tabItems.filter((item) => !isTrashItemExpired(item, trashNow));
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return tabItems.filter((item) => {
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
    });
  }, [fromDate, isTrash, tabItems, toDate, trashNow]);
  const groups = useMemo(() => {
    const sortedItems = [...filteredItems].sort((a, b) => {
      const aTime = isTrash ? getTrashSortTime(a) : Date.parse(a.createdAt);
      const bTime = isTrash ? getTrashSortTime(b) : Date.parse(b.createdAt);
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    if (isTrash) return sortedItems.length ? [["trash", sortedItems] as [string, CloudItem[]]] : [];
    const grouped = new Map<string, CloudItem[]>();
    sortedItems.forEach((item) => {
      const key = formatSentDate(item.createdAt);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    });
    return [...grouped.entries()];
  }, [filteredItems, isTrash]);
  const galleryItems = useMemo(
    () => groups.flatMap(([, group]) => group),
    [groups],
  );

  const tabLabel = tab === "media" ? "Ảnh/Video" : tab === "files" ? "Files" : tab === "links" ? "Links" : "Tin nhắn";
  const toggleSelection = (itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
  };
  const selectedItems = useMemo(
    () => allItems.filter((item) => selectedIds.has(item.id)),
    [allItems, selectedIds],
  );
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const shareSelectedItems = async () => {
    for (const item of selectedItems) await shareResource(item);
  };
  const downloadSelectedItems = async () => {
    for (const item of selectedItems) {
      const url = resourceUrl(item);
      if (url && item.type !== "link") await downloadResourceWithName(url, item.title?.trim() || itemTitle(item));
    }
  };
  const deleteSelectedItems = async () => {
    for (const item of selectedItems) {
      if (isTrash && onPermanentDeleteItem) await onPermanentDeleteItem(item.id);
      else await onDeleteItem?.(item);
    }
    exitSelectionMode();
  };
  const restoreSelectedItems = async () => {
    if (!isTrash || !onRestoreTrashItem) return;
    for (const item of selectedItems) await onRestoreTrashItem(item.id);
    exitSelectionMode();
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const startLongPress = (itemId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelLongPress();
    selectionPointerDown.current = true;
    longPressTriggered.current = false;
    const baseIds = new Set(selectedIds);
    baseIds.delete(itemId);
    if (selectionMode) {
      selectionDragRef.current = { anchorId: itemId, baseIds };
      return;
    }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressTriggered.current = true;
      selectionDragRef.current = { anchorId: itemId, baseIds };
      setSelectionMode(true);
      setSelectedIds(new Set([itemId]));
    }, 500);
  };
  const releaseSelectionPointer = () => {
    cancelLongPress();
    selectionPointerDown.current = false;
    selectionDragRef.current = null;
  };
  const handleMediaPointerEnter = (itemId: string) => {
    if (!selectionMode || !selectionPointerDown.current) return;
    const drag = selectionDragRef.current;
    if (!drag) return;
    const anchorIndex = galleryItems.findIndex((item) => item.id === drag.anchorId);
    const currentIndex = galleryItems.findIndex((item) => item.id === itemId);
    if (anchorIndex < 0 || currentIndex < 0) return;
    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    const range = galleryItems.slice(start, end + 1).map((item) => item.id);
    setSelectedIds(new Set([...drag.baseIds, ...range]));
  };
  const handleMediaClick = (item: CloudItem) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectionMode) {
      toggleSelection(item.id);
      return;
    }
    if (item.type === "video") onOpenVideo(item);
    else onOpenImage(item);
  };
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
    <section className="absolute inset-0 z-40 flex w-full flex-col overflow-hidden bg-surface shadow-2xl" aria-label={title}>
      <header className="flex min-h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border/70 px-5">
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
        <h2 className="flex-1 text-[16px] font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={selectionMode ? exitSelectionMode : toggleSelectionMode} className="inline-flex h-9 items-center rounded-md px-2 text-[13px] font-medium text-text-primary hover:bg-surface-hover">{selectionMode ? "Hủy" : "Chọn"}</button>
        </div>
      </header>
      <nav className="flex h-14 shrink-0 border-b border-border px-5" aria-label="Loại nội dung">
        {(isTrash
          ? ([['media', 'Ảnh/Video'], ['files', 'Files'], ['links', 'Links'], ['text', 'Tin nhắn']] as const)
          : ([['media', 'Ảnh/Video'], ['files', 'Files'], ['links', 'Links']] as const)
        ).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`flex flex-1 items-center justify-center border-b-2 text-base font-medium ${key === tab ? "border-primary text-primary" : "border-transparent text-text-primary"}`}>{label}</button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto bg-surface-muted pb-8">
        {!isTrash ? <div className="relative mx-5 my-4">
          <button type="button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} className="flex h-9 w-full items-center justify-between rounded-full bg-surface-overlay px-4 text-base text-text-secondary"><span>Ngày gửi</span><ChevronDown className={`h-5 w-5 transition-transform ${filterOpen ? "rotate-180" : ""}`} /></button>
          {filterOpen ? <div className="absolute left-3 right-3 top-11 z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain"><div className="relative rounded-xl border border-border bg-surface p-3 shadow-xl">
            <button type="button" onMouseEnter={(event) => showSuggestions(event.currentTarget)} onMouseLeave={hideSuggestionsSoon} onFocus={(event) => showSuggestions(event.currentTarget)} onClick={(event) => { if (suggestionsOpen) { setSuggestionsOpen(false); setSuggestionPosition(null); } else showSuggestions(event.currentTarget); }} className="flex w-full items-center justify-between border-b border-border/70 pb-4 text-left text-base text-text-primary"><span>Gợi ý thời gian</span><ChevronRight className={`h-5 w-5 transition-transform ${suggestionsOpen ? "rotate-90" : ""}`} /></button>
            <div className="pt-4"><p className="mb-3 text-base text-text-primary">Chọn khoảng thời gian</p><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => openCalendar("from")} className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "from" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}>{draftFromDate ? formatCalendarDate(draftFromDate) : fromDate ? formatCalendarDate(fromDate) : "Từ ngày"}<CalendarDays className="h-6 w-6 shrink-0 text-text-muted" /></button><button type="button" onClick={() => openCalendar("to")} className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "to" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}>{draftToDate ? formatCalendarDate(draftToDate) : toDate ? formatCalendarDate(toDate) : "Đến ngày"}<CalendarDays className="h-6 w-6 shrink-0 text-text-muted" /></button></div></div>
            {calendarField ? <CalendarPicker month={calendarMonth} fromDate={draftFromDate} toDate={draftToDate} onMonthChange={setCalendarMonth} onSelect={selectCalendarDate} onCancel={cancelCalendar} onConfirm={confirmCalendar} /> : null}
          </div></div> : null}
        </div> : null}
        {groups.length ? groups.map(([date, group]) => (
          <section
            key={date}
            className={isTrash
              ? "bg-surface px-5 pb-5 pt-4"
              : "mb-3 border-b-8 border-surface-muted bg-surface px-5 pb-5 pt-4"}
          >
            {!isTrash ? <h3 className="mb-5 text-lg font-semibold text-text-primary">{date}</h3> : null}
            {tab === "media" ? <div className="grid grid-cols-3 gap-3">{group.map((item) => <div key={item.id} className="group relative aspect-square"><button type="button" disabled={!item.accessUrl && !selectionMode} onPointerDown={(event) => startLongPress(item.id, event)} onPointerUp={releaseSelectionPointer} onPointerCancel={releaseSelectionPointer} onPointerLeave={cancelLongPress} onPointerEnter={() => handleMediaPointerEnter(item.id)} onClick={() => handleMediaClick(item)} className="group relative h-full w-full overflow-hidden rounded-md bg-surface-overlay disabled:cursor-default"><GalleryMedia item={item} />{isTrash ? <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{trashRemainingLabel(item, trashNow)}</span> : null}{selectionMode ? <SelectionCircle selected={selectedIds.has(item.id)} className="absolute left-2 top-2 z-10" /> : null}</button>{!selectionMode ? <ResourceActions compact placement="top" isTrash={isTrash} trashNow={trashNow} item={item} onRestoreItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}</div>)}</div> : null}
            {tab === "files" ? <div className="space-y-2">{group.map((item) => <GalleryFile key={item.id} item={item} trashNow={trashNow} selectionMode={selectionMode} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelection(item.id)} isTrash={isTrash} onRestoreItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : null}
            {tab === "links" ? <div className="space-y-2">{group.map((item) => <GalleryLink key={item.id} item={item} trashNow={trashNow} selectionMode={selectionMode} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelection(item.id)} isTrash={isTrash} onRestoreItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : null}
            {tab === "text" ? <div className="space-y-2">{group.map((item) => <GalleryText key={item.id} item={item} trashNow={trashNow} selectionMode={selectionMode} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelection(item.id)} isTrash={isTrash} onRestoreItem={onRestoreTrashItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} />)}</div> : null}
          </section>
        )) : <EmptyState icon={tab === "media" ? <ImageIcon /> : tab === "files" ? <FileText /> : tab === "links" ? <Link2 /> : <CloudItemIcon type="text" />} label={`Chưa có ${tabLabel.toLowerCase()}`} />}
      </div>
      {suggestionsOpen && suggestionPosition && typeof document !== "undefined" ? createPortal(<div className="fixed z-[1000] grid w-56 gap-1 rounded-xl border border-border bg-surface p-3 shadow-2xl" style={{ top: suggestionPosition.top, left: suggestionPosition.left }} onMouseEnter={keepSuggestionsOpen} onMouseLeave={hideSuggestionsSoon} role="menu">{[[7, "7 ngày trước"], [30, "30 ngày trước"], [90, "3 tháng trước"]].map(([days, label]) => <button key={days} type="button" onClick={() => chooseSuggestion(Number(days))} className="rounded-md px-2 py-2 text-left text-base text-text-secondary hover:bg-surface-hover" role="menuitem">{label}</button>)}</div>, document.body) : null}
      {selectionMode ? <div className="z-30 flex shrink-0 items-center gap-3 border-t border-border bg-surface px-5 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
        <span className="text-sm font-medium text-text-primary">{selectedIds.size} {tab === "media" ? "hình ảnh" : tab === "files" ? "tệp" : tab === "links" ? "liên kết" : "tin nhắn"}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={!selectedIds.size} onClick={() => void shareSelectedItems()} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40" aria-label="Chia sẻ mục đã chọn" title="Chia sẻ"><ArrowUturnRightIcon className="h-5 w-5" /></button>
          <button type="button" disabled={!selectedIds.size} onClick={() => void downloadSelectedItems()} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40" aria-label="Tải xuống mục đã chọn" title="Tải xuống"><Download className="h-5 w-5" /></button>
          {isTrash ? <button type="button" disabled={!selectedIds.size} onClick={() => void restoreSelectedItems()} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Khôi phục mục đã chọn" title="Khôi phục"><RotateCcw className="h-5 w-5" /></button> : null}
          <button type="button" disabled={!selectedIds.size} onClick={() => void deleteSelectedItems()} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Xóa mục đã chọn" title="Xóa"><Trash2 className="h-5 w-5" /></button>
          <button type="button" onClick={exitSelectionMode} className="ml-2 px-2 text-sm font-medium text-text-primary hover:underline">Hủy</button>
        </div>
      </div> : null}
    </section>
  );
};

const SelectionCircle: React.FC<{ selected: boolean; className?: string }> = ({ selected, className = "" }) => (
  <span
    aria-hidden="true"
    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border shadow-sm ${selected ? "border-primary bg-primary text-white" : "border-border bg-white text-transparent"} ${className}`}
  >
    {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
  </span>
);

const GalleryMedia: React.FC<{ item: CloudItem }> = ({ item }) => item.accessUrl ? item.type === "image" ? <img src={item.accessUrl} alt={itemTitle(item)} className="h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <><video src={item.accessUrl} className="h-full w-full object-cover" muted preload="metadata" /><span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"><Play className="h-5 w-5" fill="currentColor" /></span></span></> : <span className="absolute inset-0 flex items-center justify-center"><CloudItemIcon type={item.type} className="h-10 w-10" /></span>;

const TrashResourceMeta: React.FC<{ item: CloudItem; trashNow: number }> = ({ item, trashNow }) => (
  <span className="cloud-resource-trash-meta" aria-label={`${formatBytes(item.sizeBytes)}, ${trashRemainingLabel(item, trashNow)}`}>
    <span>{formatBytes(item.sizeBytes)}</span>
    <span aria-hidden="true">·</span>
    <span className="cloud-resource-trash-meta__remaining">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{trashRemainingLabel(item, trashNow)}</span>
    </span>
  </span>
);

const GalleryFile: React.FC<ResourceRowProps> = ({ item, trashNow = Date.now(), selectionMode = false, selected = false, onToggleSelect, isTrash = false, onRestoreItem, onPermanentDeleteItem, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => (
  <div className="group relative rounded-lg bg-surface-overlay">
    {selectionMode ? <button type="button" className="absolute left-3 top-1/2 z-20 -translate-y-1/2" aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${itemTitle(item)}`} onClick={onToggleSelect}><SelectionCircle selected={selected} /></button> : null}
    {item.accessUrl ? <a href={item.accessUrl} download={itemTitle(item)} onClick={selectionMode ? (event) => { event.preventDefault(); onToggleSelect?.(); } : undefined} className={`flex items-center gap-3 rounded-lg p-3 pr-28 ${selectionMode ? "pl-16" : ""}`}><CloudResourceThumbnail item={item} /><span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-text-primary" title={itemTitle(item)}>{itemTitle(item)}</span>{isTrash ? <TrashResourceMeta item={item} trashNow={trashNow} /> : <span className="flex items-center gap-1 text-sm text-text-muted"><span>{formatBytes(item.sizeBytes)}</span></span>}</span></a> : <div onClick={selectionMode ? onToggleSelect : undefined} className={`flex items-center gap-3 rounded-lg p-3 pr-28 ${selectionMode ? "pl-16" : ""}`}><CloudResourceThumbnail item={item} /><span className="min-w-0 flex-1"><span className="block truncate text-[15px] text-text-primary" title={itemTitle(item)}>{itemTitle(item)}</span>{isTrash ? <TrashResourceMeta item={item} trashNow={trashNow} /> : null}</span></div>}
    {!selectionMode ? <ResourceActions compact isTrash={isTrash} trashNow={trashNow} item={item} onRestoreItem={onRestoreItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
  </div>
);

const GalleryLink: React.FC<ResourceRowProps> = ({ item, trashNow = Date.now(), selectionMode = false, selected = false, onToggleSelect, isTrash = false, onRestoreItem, onPermanentDeleteItem, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const url = item.url?.trim() ?? "";
  const label = linkLabel(item, url);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return <div className="group relative rounded-lg bg-surface-overlay">
    {selectionMode ? <button type="button" className="absolute left-3 top-1/2 z-20 -translate-y-1/2" aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${label}`} onClick={onToggleSelect}><SelectionCircle selected={selected} /></button> : null}
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={selectionMode ? (event) => { event.preventDefault(); onToggleSelect?.(); } : undefined} className={`flex items-center gap-3 rounded-lg p-3 pr-28 ${selectionMode ? "pl-16" : ""}`}><CloudResourceThumbnail item={item} /><span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-text-primary" title={label}>{label}</span><span className="block truncate text-sm text-text-muted" title={host}>{host}</span>{isTrash ? <TrashResourceMeta item={item} trashNow={trashNow} /> : null}</span></a>
    {!selectionMode ? <ResourceActions compact isTrash={isTrash} trashNow={trashNow} item={item} onRestoreItem={onRestoreItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
  </div>;
};

const GalleryText: React.FC<ResourceRowProps> = ({ item, trashNow = Date.now(), selectionMode = false, selected = false, onToggleSelect, isTrash = false, onRestoreItem, onPermanentDeleteItem, onDeleteItem, onViewOriginalMessage, onShowInFolder }) => {
  const text = item.content?.trim() || itemTitle(item);
  const isAudio = item.type === "audio";
  const messageKind = isAudio ? "Tin nhắn thoại" : "Tin nhắn";
  return (
    <div className="group relative rounded-lg bg-surface-overlay">
      {selectionMode ? <button type="button" className="absolute left-3 top-1/2 z-20 -translate-y-1/2" aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${text}`} onClick={onToggleSelect}><SelectionCircle selected={selected} /></button> : null}
      <div className={`flex min-h-[62px] items-center gap-3 rounded-lg p-3 pr-28 ${selectionMode ? "pl-16" : ""}`}>
        <CloudItemIcon type={isAudio ? "audio" : "text"} className="h-9 w-9 shrink-0" />
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-text-primary" title={text}>{text}</span>{isTrash ? <TrashResourceMeta item={item} trashNow={trashNow} /> : <span className="cloud-resource-text-meta flex min-w-0 items-center gap-2 text-sm text-text-muted"><span className="shrink-0 whitespace-nowrap">{messageKind} · {formatBytes(item.sizeBytes)}</span></span>}</span>
      </div>
      {!selectionMode ? <ResourceActions compact isTrash={isTrash} trashNow={trashNow} item={item} onRestoreItem={onRestoreItem} onPermanentDeleteItem={onPermanentDeleteItem} onDeleteItem={onDeleteItem} onViewOriginalMessage={onViewOriginalMessage} onShowInFolder={onShowInFolder} /> : null}
    </div>
  );
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
  const previousMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const nextMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const todayValue = dateInputValue(new Date());

  return <div className="relative z-30 mx-auto mt-3 w-full max-w-[360px] max-h-[calc(100dvh-18rem)] min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 shadow-lg" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between px-1 pb-2 text-lg font-medium text-text-primary"><span>Tháng {month.getMonth() + 1}, {month.getFullYear()}</span><span className="flex gap-2"><button type="button" onClick={previousMonth} className="h-8 w-8 rounded-full text-2xl leading-none hover:bg-surface-hover" aria-label="Tháng trước">‹</button><button type="button" onClick={nextMonth} className="h-8 w-8 rounded-full text-2xl leading-none hover:bg-surface-hover" aria-label="Tháng sau">›</button></span></div>
    <div className="grid grid-cols-7 border-t border-border/70 pt-1 text-center text-sm font-medium text-text-secondary">{["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">{days.map((date) => {
      const value = dateInputValue(date);
      const inMonth = date.getMonth() === month.getMonth();
      const future = value > todayValue;
      const afterEndDate = Boolean(toDate) && value > toDate;
      const locked = future || afterEndDate;
      const selected = value === fromDate || value === toDate;
      const between = fromDate && toDate && value > fromDate && value < toDate;
      return <button key={value} type="button" disabled={locked} onClick={() => onSelect(value)} className={`relative h-7 rounded-md text-xs ${locked ? "cursor-not-allowed bg-surface-muted text-text-muted/45" : inMonth ? "text-text-primary" : "text-text-muted/60"} ${between && !locked ? "bg-primary/10" : ""} ${selected && !locked ? "bg-primary text-white" : !locked ? "hover:bg-surface-hover" : ""}`}>{date.getDate()}</button>;
    })}</div>
    <div className="sticky bottom-0 mt-2 flex justify-end gap-2 border-t border-border/70 bg-surface pt-2"><button type="button" onClick={onCancel} className="rounded-md bg-surface-overlay px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover">Hủy</button><button type="button" onClick={onConfirm} disabled={!fromDate && !toDate} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Xác nhận</button></div>
  </div>;
};

const ResourceSection: React.FC<{ label: string; count: number; children: React.ReactNode }> = ({ label, count, children }) => {
  // Match Hacom Chat: populated sections open by default, empty sections stay
  // collapsed so the panel remains visually divided without empty blocks.
  const [expanded, setExpanded] = useState(count > 0);
  const contentId = `cloud-resource-section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="bg-surface px-5 py-3">
      <button
        type="button"
        className="mb-2.5 flex w-full items-center justify-between text-left text-[16px] font-semibold text-text-primary transition-colors"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  );
};

const ViewAllButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 h-9 w-full rounded bg-[#e4e7ec] text-[14px] font-semibold text-text-primary transition-colors hover:bg-[#dde1e7]"
  >
    Xem tất cả
  </button>
);

const ResourceEmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-4 text-center text-sm text-text-muted">{children}</p>
);

const EmptyState: React.FC<{ icon: React.ReactElement<{ className?: string }>; label: string }> = ({ icon, label }) => <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-text-muted">{React.cloneElement(icon, { className: "h-7 w-7" })}<p className="text-xs leading-5">{label}</p></div>;
