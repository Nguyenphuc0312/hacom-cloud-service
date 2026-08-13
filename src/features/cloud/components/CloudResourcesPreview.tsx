import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  ImageIcon,
  Link2,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { ImagePreviewModal } from "../../../components/modals/ImagePreviewModal";
import { VideoPlayerModal } from "../../../components/info/shared-resources/VideoPlayerModal";
import type { CloudItem } from "../types";
import { formatBytes, getCloudItemTitle } from "../utils/cloudFormat";
import { getCachedCloudFileAccess } from "../utils/cloudFileAccessCache";

interface CloudResourcesPreviewProps {
  items: CloudItem[];
  trashItems?: CloudItem[];
  onViewTrash?: () => void;
  onRestoreTrashItem?: (itemId: string) => void | Promise<void>;
  userId?: string;
  senderName?: string;
  senderAvatar?: string;
}

const itemTitle = (item: CloudItem): string =>
  getCloudItemTitle(item, { text: "Nội dung", link: "Liên kết", file: "Tệp" });

export const CloudResourcesPreview: React.FC<CloudResourcesPreviewProps> = ({
  items,
  trashItems = [],
  onViewTrash,
  onRestoreTrashItem,
  userId,
  senderName,
  senderAvatar,
}) => {
  const [galleryTab, setGalleryTab] = useState<GalleryTab | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [video, setVideo] = useState<CloudItem | null>(null);
  const [accessById, setAccessById] = useState<Record<string, { url: string; expiresAt: string }>>({});

  const resolvedItems = useMemo(
    () => items.map((item) => ({ ...item, accessUrl: accessById[item.id]?.url ?? item.accessUrl })),
    [accessById, items],
  );
  const media = useMemo(() => resolvedItems.filter((item) => item.type === "image" || item.type === "video"), [resolvedItems]);
  const files = useMemo(() => resolvedItems.filter((item) => item.type === "file"), [resolvedItems]);
  const links = useMemo(() => resolvedItems.filter((item) => item.type === "link"), [resolvedItems]);
  const images = useMemo(
    () => media.filter((item) => item.type === "image" && item.accessUrl).map((item) => ({ url: item.accessUrl!, alt: itemTitle(item), senderName, senderAvatar, sentAt: item.createdAt, groupKey: item.id })),
    [media, senderAvatar, senderName],
  );

  useEffect(() => {
    if (!userId) return;
    const candidates = [...media, ...files].filter((item) => {
      if (item.status !== "ready") return false;
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
  }, [accessById, files, media, userId]);

  const openImage = (item: CloudItem) => {
    if (!item.accessUrl) return;
    const index = images.findIndex((image) => image.url === item.accessUrl);
    if (index >= 0) setLightboxIndex(index);
  };

  return (
    <>
      <div className="overflow-hidden bg-surface">
        <ResourceSection label="Ảnh/Video" count={media.length}>
          {media.length ? <>
            <div className="grid grid-cols-3 gap-1.5">
              {media.slice(0, 6).map((item) => (
                <button key={item.id} type="button" disabled={!item.accessUrl} onClick={() => item.type === "video" ? setVideo(item) : openImage(item)} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-overlay disabled:cursor-default" aria-label={itemTitle(item)}>
                  {item.accessUrl ? item.type === "image" ? <img src={item.accessUrl} alt={itemTitle(item)} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" /> : <video src={item.accessUrl} className="h-full w-full object-cover" muted preload="metadata" /> : <ImageIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-text-muted" />}
                  {item.type === "video" ? <span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-sm"><Play className="h-5 w-5" fill="currentColor" /></span></span> : null}
                </button>
              ))}
            </div>
            {media.length >= 4 ? <button type="button" onClick={() => setGalleryTab("media")} className="mt-3 w-full rounded-md bg-surface-overlay py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover">Xem tất cả</button> : null}
          </> : <EmptyState icon={<ImageIcon />} label="Chưa có ảnh hoặc video được chia sẻ trong hội thoại này" />}
        </ResourceSection>

        <ResourceSection label="File" count={files.length}>
          {files.length ? <div className="space-y-1.5">{files.slice(0, 3).map((item) => {
            const content = <><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-text-muted"><FileText className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-text-primary">{itemTitle(item)}</span><span className="text-[11px] text-text-muted">{formatBytes(item.sizeBytes)}</span></span></>;
            return item.accessUrl ? <a key={item.id} href={item.accessUrl} download={itemTitle(item)} className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-hover">{content}</a> : <div key={item.id} className="flex items-center gap-2 rounded-lg p-2">{content}</div>;
          })}</div> : <EmptyState icon={<FileText />} label="Chưa có File được chia sẻ trong hội thoại này" />}
          {files.length >= 4 ? <button type="button" onClick={() => setGalleryTab("files")} className="mt-3 w-full rounded-md bg-surface-overlay py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover">Xem tất cả</button> : null}
        </ResourceSection>

        <ResourceSection label="Link" count={links.length}>
          {links.length ? <div className="space-y-1.5">{links.slice(0, 3).map((item) => { const url = item.url?.trim() ?? ""; let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ } return <a key={item.id} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-hover"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-text-primary">{itemTitle(item)}</span><span className="block truncate text-[11px] text-text-muted">{host}</span></span></a>; })}</div> : <EmptyState icon={<Link2 />} label="Chưa có link nào được chia sẻ" />}
          {links.length >= 4 ? <button type="button" onClick={() => setGalleryTab("links")} className="mt-3 w-full rounded-md bg-surface-overlay py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover">Xem tất cả</button> : null}
        </ResourceSection>

        <section className="border-t border-border">
          <div className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-text-primary">
            <span className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-text-muted" />Thùng rác</span>
            <span className="text-xs font-normal text-text-muted">{trashItems.length}</span>
          </div>
          <div className="px-4 pb-4">
            {trashItems.length ? <>
              <div className="flex items-center justify-between py-2 text-xs text-text-muted">
                <span>{trashItems.length} mục</span>
                <button type="button" className="font-medium text-primary" onClick={onViewTrash}>Chọn</button>
              </div>
              {trashItems.slice(0, 3).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-surface-overlay px-3 py-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-semibold text-emerald-600">{item.type === "image" ? "PNG" : item.type === "video" ? "MP4" : "FILE"}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-text-primary">{itemTitle(item)}</span><span className="text-xs text-text-muted">{formatBytes(item.sizeBytes)}</span></span><button type="button" onClick={() => void onRestoreTrashItem?.(item.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10" aria-label={`Khôi phục ${itemTitle(item)}`}><RotateCcw className="h-4 w-4" /></button></div>)}
              {trashItems.length >= 4 ? <button type="button" onClick={onViewTrash} className="mt-3 w-full rounded-md bg-surface-overlay py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover">Xem tất cả</button> : null}
            </> : <p className="py-3 text-sm text-text-muted">Thùng rác đang trống</p>}
          </div>
        </section>
      </div>
      {galleryTab ? <ResourceGallery tab={galleryTab} allItems={resolvedItems} onClose={() => setGalleryTab(null)} onOpenImage={openImage} onOpenVideo={setVideo} /> : null}
      <ImagePreviewModal isOpen={lightboxIndex !== null} onClose={() => setLightboxIndex(null)} images={images} initialIndex={lightboxIndex ?? 0} />
      <VideoPlayerModal isOpen={video !== null} onClose={() => setVideo(null)} url={video?.accessUrl ?? null} fileName={video ? itemTitle(video) : undefined} />
    </>
  );
};

type GalleryTab = "media" | "files" | "links";

const formatSentDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Ngày gửi";
  return `Ngày ${date.getDate()} Tháng ${date.getMonth() + 1}`;
};

const ResourceGallery: React.FC<{
  tab: GalleryTab;
  allItems: CloudItem[];
  onClose: () => void;
  onOpenImage: (item: CloudItem) => void;
  onOpenVideo: (item: CloudItem) => void;
}> = ({ tab: initialTab, allItems, onClose, onOpenImage, onOpenVideo }) => {
  const [tab, setTab] = useState<GalleryTab>(initialTab);
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
  const tabItems = useMemo(() => {
    const type = tab === "media" ? ["image", "video"] : tab === "files" ? ["file"] : ["link"];
    return allItems.filter((item) => type.includes(item.type));
  }, [allItems, tab]);
  const filteredItems = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return tabItems.filter((item) => {
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
    });
  }, [fromDate, tabItems, toDate]);
  const groups = useMemo(() => {
    const grouped = new Map<string, CloudItem[]>();
    [...filteredItems].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).forEach((item) => {
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
    <section className="absolute inset-0 z-40 flex w-full flex-col overflow-hidden bg-surface shadow-2xl" aria-label="Kho lưu trữ">
      <header className="flex min-h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border/70 px-5">
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
        <h2 className="flex-1 text-[16px] font-semibold text-text-primary">Kho lưu trữ</h2>
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-md px-2 text-[13px] font-medium text-text-primary hover:bg-surface-hover">Chọn</button>
      </header>
      <nav className="flex h-14 shrink-0 border-b border-border px-5" aria-label="Loại nội dung">
        {([['media', 'Ảnh/Video'], ['files', 'Files'], ['links', 'Links']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`flex flex-1 items-center justify-center border-b-2 text-base font-medium ${key === tab ? "border-primary text-primary" : "border-transparent text-text-primary"}`}>{label}</button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto bg-surface-muted pb-8">
        <div className="relative mx-5 my-4">
          <button type="button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} className="flex h-9 w-full items-center justify-between rounded-full bg-surface-overlay px-4 text-base text-text-secondary"><span>Ngày gửi</span><ChevronDown className={`h-5 w-5 transition-transform ${filterOpen ? "rotate-180" : ""}`} /></button>
          {filterOpen ? <div className="absolute left-3 right-3 top-11 z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain"><div className="relative rounded-xl border border-border bg-surface p-3 shadow-xl">
            <button type="button" onMouseEnter={(event) => showSuggestions(event.currentTarget)} onMouseLeave={hideSuggestionsSoon} onFocus={(event) => showSuggestions(event.currentTarget)} onClick={(event) => { if (suggestionsOpen) { setSuggestionsOpen(false); setSuggestionPosition(null); } else showSuggestions(event.currentTarget); }} className="flex w-full items-center justify-between border-b border-border/70 pb-4 text-left text-base text-text-primary"><span>Gợi ý thời gian</span><ChevronRight className={`h-5 w-5 transition-transform ${suggestionsOpen ? "rotate-90" : ""}`} /></button>
            <div className="pt-4"><p className="mb-3 text-base text-text-primary">Chọn khoảng thời gian</p><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => openCalendar("from")} className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "from" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}>{draftFromDate ? formatCalendarDate(draftFromDate) : fromDate ? formatCalendarDate(fromDate) : "Từ ngày"}<CalendarDays className="h-6 w-6 shrink-0 text-text-muted" /></button><button type="button" onClick={() => openCalendar("to")} className={`flex h-14 items-center justify-between rounded-lg border px-3 text-left text-base text-text-secondary ${calendarField === "to" ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary"}`}>{draftToDate ? formatCalendarDate(draftToDate) : toDate ? formatCalendarDate(toDate) : "Đến ngày"}<CalendarDays className="h-6 w-6 shrink-0 text-text-muted" /></button></div></div>
            {calendarField ? <CalendarPicker month={calendarMonth} fromDate={draftFromDate} toDate={draftToDate} onMonthChange={setCalendarMonth} onSelect={selectCalendarDate} onCancel={cancelCalendar} onConfirm={confirmCalendar} /> : null}
          </div></div> : null}
        </div>
        {groups.length ? groups.map(([date, group]) => (
          <section key={date} className="mb-3 border-b-8 border-surface-muted bg-surface px-5 pb-5 pt-4">
            <h3 className="mb-5 text-lg font-semibold text-text-primary">{date}</h3>
            {tab === "media" ? <div className="grid grid-cols-3 gap-3">{group.map((item) => <button key={item.id} type="button" disabled={!item.accessUrl} onClick={() => item.type === "video" ? onOpenVideo(item) : onOpenImage(item)} className="group relative aspect-square overflow-hidden rounded-md bg-surface-overlay disabled:cursor-default"><GalleryMedia item={item} /></button>)}</div> : null}
            {tab === "files" ? <div className="space-y-2">{group.map((item) => <GalleryFile key={item.id} item={item} />)}</div> : null}
            {tab === "links" ? <div className="space-y-2">{group.map((item) => <GalleryLink key={item.id} item={item} />)}</div> : null}
          </section>
        )) : <EmptyState icon={tab === "media" ? <ImageIcon /> : tab === "files" ? <FileText /> : <Link2 />} label={`Chưa có ${tabLabel.toLowerCase()}`} />}
      </div>
      {suggestionsOpen && suggestionPosition && typeof document !== "undefined" ? createPortal(<div className="fixed z-[1000] grid w-56 gap-1 rounded-xl border border-border bg-surface p-3 shadow-2xl" style={{ top: suggestionPosition.top, left: suggestionPosition.left }} onMouseEnter={keepSuggestionsOpen} onMouseLeave={hideSuggestionsSoon} role="menu">{[[7, "7 ngày trước"], [30, "30 ngày trước"], [90, "3 tháng trước"]].map(([days, label]) => <button key={days} type="button" onClick={() => chooseSuggestion(Number(days))} className="rounded-md px-2 py-2 text-left text-base text-text-secondary hover:bg-surface-hover" role="menuitem">{label}</button>)}</div>, document.body) : null}
    </section>
  );
};

const GalleryMedia: React.FC<{ item: CloudItem }> = ({ item }) => item.accessUrl ? item.type === "image" ? <img src={item.accessUrl} alt={itemTitle(item)} className="h-full w-full object-cover" loading="lazy" /> : <><video src={item.accessUrl} className="h-full w-full object-cover" muted preload="metadata" /><span className="absolute inset-0 flex items-center justify-center bg-black/15"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"><Play className="h-5 w-5" fill="currentColor" /></span></span></> : <ImageIcon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-text-muted" />;

const GalleryFile: React.FC<{ item: CloudItem }> = ({ item }) => item.accessUrl ? <a href={item.accessUrl} download={itemTitle(item)} className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3"><FileText className="h-7 w-7 text-text-muted" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{itemTitle(item)}</span><span className="text-xs text-text-muted">{formatBytes(item.sizeBytes)}</span></span></a> : <div className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3"><FileText className="h-7 w-7 text-text-muted" /><span className="truncate text-sm text-text-primary">{itemTitle(item)}</span></div>;

const GalleryLink: React.FC<{ item: CloudItem }> = ({ item }) => {
  const url = item.url?.trim() ?? "";
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{itemTitle(item)}</span><span className="block truncate text-xs text-text-muted">{host}</span></span></a>;
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

const ResourceSection: React.FC<{ label: string; count: number; children: React.ReactNode }> = ({ label, count, children }) => (
  <section className="border-t border-border first:border-t-0">
    <div className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-text-primary"><span>{label}</span><span className="text-xs font-normal text-text-muted">{count}</span></div>
    <div className="border-t border-border/70 px-4 py-3">{children}</div>
  </section>
);

const EmptyState: React.FC<{ icon: React.ReactElement<{ className?: string }>; label: string }> = ({ icon, label }) => <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-text-muted">{React.cloneElement(icon, { className: "h-7 w-7" })}<p className="text-xs leading-5">{label}</p></div>;
