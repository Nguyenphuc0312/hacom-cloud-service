import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ChartPie,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudUpload,
  Download,
  ExternalLink,
  Grid2X2,
  List,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DocumentDuplicateIcon,
  DocumentIcon,
  DocumentTextIcon,
  LinkIcon,
  MicrophoneIcon,
  PhotoIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../stores/authStore";
import { useToast } from "../../../stores";
import { resolveCloudUserId } from "../utils/cloudIdentity";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import { formatBytes, getCloudItemPreview, getCloudItemTitle } from "../utils/cloudFormat";
import { downloadResourceWithName } from "../../../utils/downloadFile";
import { CloudItemIcon } from "../components/CloudItemIcon";
import { CloudQuotaRequestDialog } from "../components/CloudQuotaRequestDialog";
import { CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import type { CloudItem } from "../types";
import { ROUTE_PATHS } from "../../../router/paths";
import "../styles/cloud.css";

type Filter = "all" | CloudItem["type"];

const ITEMS_PER_PAGE = 50;
const downloadableTypes: CloudItem["type"][] = ["image", "video", "file", "audio"];

const typeLabel: Record<CloudItem["type"], string> = {
  image: "Ảnh",
  video: "Video",
  file: "File",
  audio: "Tin nhắn thoại",
  link: "Liên kết",
  text: "Văn bản",
};

const typeBadgeClass: Record<CloudItem["type"], string> = {
  image: "bg-blue-50 text-blue-700",
  video: "bg-emerald-50 text-emerald-700",
  file: "bg-indigo-50 text-indigo-700",
  audio: "bg-violet-50 text-violet-700",
  link: "bg-amber-50 text-amber-700",
  text: "bg-orange-50 text-orange-700",
};

const typeIcon: Record<CloudItem["type"], React.ReactNode> = {
  image: <PhotoIcon className="h-5 w-5" aria-hidden />,
  video: <VideoCameraIcon className="h-5 w-5" aria-hidden />,
  file: <DocumentIcon className="h-5 w-5" aria-hidden />,
  audio: <MicrophoneIcon className="h-5 w-5" aria-hidden />,
  link: <LinkIcon className="h-5 w-5" aria-hidden />,
  text: <DocumentTextIcon className="h-5 w-5" aria-hidden />,
};

const titleFor = (item: CloudItem) =>
  getCloudItemTitle(item, {
    text: "Văn bản chưa đặt tên",
    link: "Liên kết chưa đặt tên",
    file: "Tệp chưa đặt tên",
  });

const formatSentDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const isDownloadable = (item: CloudItem) =>
  downloadableTypes.includes(item.type) && Boolean(item.accessUrl);

export default function CloudManagePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const authUser = useAuthStore((state) => state.user);
  const userId = resolveCloudUserId(authUser?.id);
  const workspace = useCloudWorkspace(userId);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return workspace.items
      .filter((item) => filter === "all" || item.type === filter)
      .filter((item) => {
        if (!normalized) return true;
        return `${titleFor(item)} ${typeLabel[item.type]} ${getCloudItemPreview(item)}`
          .toLocaleLowerCase()
          .includes(normalized);
      })
      .sort((left, right) => {
        const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return newestFirst ? -delta : delta;
      });
  }, [filter, newestFirst, query, workspace.items]);

  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const allPageSelected =
    paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.has(item.id));

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, newestFirst, query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  useEffect(() => {
    const visibleIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const bytesFor = (kind: CloudItem["type"]) =>
    workspace.items
      .filter((item) => item.type === kind)
      .reduce((total, item) => total + item.sizeBytes, 0);

  const cards: Array<{ type: Filter; label: string; icon: React.ReactNode }> = [
    { type: "all", label: "Tất cả", icon: <DocumentDuplicateIcon className="h-6 w-6" aria-hidden /> },
    { type: "image", label: "Ảnh", icon: typeIcon.image },
    { type: "video", label: "Video", icon: typeIcon.video },
    { type: "file", label: "File", icon: typeIcon.file },
    { type: "audio", label: "Tin nhắn thoại", icon: typeIcon.audio },
  ];

  const toggleSelected = useCallback((itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const togglePageSelection = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) paginatedItems.forEach((item) => next.delete(item.id));
      else paginatedItems.forEach((item) => next.add(item.id));
      return next;
    });
  }, [allPageSelected, paginatedItems]);

  const handleDownload = useCallback(async (item: CloudItem) => {
    if (!isDownloadable(item)) {
      toast.info("Mục này không có tệp để tải xuống.");
      return;
    }
    await downloadResourceWithName(item.accessUrl!, titleFor(item));
  }, [toast]);

  const handleDownloadSelected = useCallback(async () => {
    const downloadable = selectedItems.filter(isDownloadable);
    if (!downloadable.length) {
      toast.info("Không có tệp khả dụng trong các mục đã chọn.");
      return;
    }
    for (const item of downloadable) await downloadResourceWithName(item.accessUrl!, titleFor(item));
    toast.success(`Đã bắt đầu tải ${downloadable.length} tệp.`);
  }, [selectedItems, toast]);

  const handleTrash = useCallback(async (item: CloudItem) => {
    try {
      await workspace.trashItem(item.id);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setOpenMenuId(null);
      toast.success("Đã chuyển vào Thùng rác.");
    } catch {
      toast.error("Không thể chuyển mục này vào Thùng rác.");
    }
  }, [toast, workspace]);

  const handleTrashSelected = useCallback(async () => {
    if (!selectedItems.length) return;
    if (selectedItems.length > 1 && typeof window !== "undefined" && !window.confirm(`Chuyển ${selectedItems.length} mục vào Thùng rác?`)) return;
    try {
      for (const item of selectedItems) await workspace.trashItem(item.id);
      setSelectedIds(new Set());
      toast.success(`Đã chuyển ${selectedItems.length} mục vào Thùng rác.`);
    } catch {
      toast.error("Một số mục chưa thể chuyển vào Thùng rác.");
    }
  }, [selectedItems, toast, workspace]);

  const handleOpen = useCallback((item: CloudItem) => {
    if (item.type === "link" && item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (item.accessUrl && item.type !== "text") {
      window.open(item.accessUrl, "_blank", "noopener,noreferrer");
      return;
    }
    toast.info("Nội dung văn bản được hiển thị trong cuộc trò chuyện Cloud.");
  }, [toast]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const validFiles = files.filter((file) => file.size > 0 && file.size <= CLOUD_MAX_UPLOAD_BYTES);
    const rejected = files.length - validFiles.length;
    if (rejected) toast.warning(`${rejected} tệp không hợp lệ (rỗng hoặc vượt quá 100 MB).`);
    if (!validFiles.length) return;
    setIsUploading(true);
    let uploaded = 0;
    try {
      for (const file of validFiles) {
        await workspace.uploadFile(file);
        uploaded += 1;
      }
      toast.success(`Đã tải lên ${uploaded} tệp.`);
    } catch {
      toast.error(uploaded ? `Đã tải lên ${uploaded}/${validFiles.length} tệp.` : "Không thể tải tệp lên Cloud.");
    } finally {
      setIsUploading(false);
    }
  }, [toast, workspace]);

  return (
    <main className="cloud-manage-page h-screen overflow-y-auto bg-[hsl(var(--chat-shell-bg))] text-text-primary">
      <header className="app-page-header flex min-h-[var(--app-header-height)] items-center gap-3 border-b border-border/70 bg-surface px-4 py-2.5 sm:px-6">
        <button type="button" onClick={() => navigate(ROUTE_PATHS.CLOUD)} className="app-page-back-button shrink-0" aria-label="Quay lại My Documents"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
        <div className="min-w-0"><h1 className="truncate text-lg font-semibold leading-6 text-text-primary">Hacom Cloud</h1><p className="truncate text-sm text-text-secondary">Lưu trữ và truy cập nhanh nội dung quan trọng của bạn</p></div>
      </header>

      <div className="grid min-h-[calc(100vh-var(--app-header-height))] w-full grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12 lg:px-5 lg:py-6">
        <div className="space-y-4">
          <aside className="h-fit rounded-2xl border border-border/70 bg-surface p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-text-primary">Dung lượng lưu trữ</h2><span className="text-xs text-text-secondary">{workspace.quota && workspace.quota.limitBytes > 0 ? `${((workspace.quota.usedBytes / workspace.quota.limitBytes) * 100).toFixed(1)}%` : "0%"}</span></div><p className="mt-4 text-xl font-semibold text-text-primary">{formatBytes(workspace.quota?.usedBytes ?? 0)} <span className="text-sm font-normal text-text-secondary">đã dùng</span></p><p className="mt-1 text-xs text-text-secondary">trên tổng dung lượng {formatBytes(workspace.quota?.limitBytes ?? 0)}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${workspace.quota && workspace.quota.limitBytes > 0 ? Math.min(100, workspace.quota.usedBytes / workspace.quota.limitBytes * 100) : 0}%` }} /></div><p className="mt-3 text-xs text-text-secondary">Còn trống {formatBytes(workspace.quota?.availableBytes ?? 0)}</p></aside>
          <aside className="flex min-h-[300px] flex-col justify-end rounded-2xl bg-[#DCEBFF] p-5 text-center"><div className="my-auto"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#2F80ED] text-white shadow-sm"><Cloud className="h-7 w-7" aria-hidden /></span><h2 className="text-lg font-semibold leading-6 text-[#0B1730]">Nâng cấp dung lượng<span className="block">My Documents</span></h2><div className="mt-6 space-y-3 text-left text-sm text-[#334155]"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B1730]"><ChartPie className="h-5 w-5" aria-hidden /></span><span>Không gian lưu trữ lên đến 10 GB</span></div><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B1730]"><CloudUpload className="h-5 w-5" aria-hidden /></span><span>Tự động bảo toàn dữ liệu trò chuyện</span></div><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B1730]"><Check className="h-5 w-5" aria-hidden /></span><span>Truy cập nhanh, an toàn mọi lúc</span></div></div></div><button type="button" onClick={() => setIsUpgradeOpen(true)} className="mt-5 h-10 w-full rounded-lg bg-[#0D6EFD] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0B63E5]">Thêm dung lượng</button></aside>
        </div>

        <section className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{cards.map((card) => { const count = card.type === "all" ? workspace.items.length : workspace.items.filter((item) => item.type === card.type).length; const bytes = card.type === "all" ? workspace.items.reduce((total, item) => total + item.sizeBytes, 0) : bytesFor(card.type); return <button type="button" key={card.type} onClick={() => setFilter(filter === card.type ? "all" : card.type)} className={`flex min-h-[88px] items-center gap-3 rounded-2xl border bg-surface px-4 text-left transition-colors ${filter === card.type ? "border-[#1976D2]/70 bg-[#EFF6FF]" : "border-border/70 hover:bg-surface-overlay"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-secondary">{card.icon}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold leading-tight text-text-primary">{card.label}</span><span className="mt-1 block text-xs text-text-secondary">{formatBytes(bytes)} · {count} mục</span></span></button>; })}</div>

          <div className="space-y-4"><h2 className="text-lg font-semibold text-text-primary">{filter === "all" ? "Tất cả" : typeLabel[filter]} dữ liệu Hacom Cloud</h2><div className="flex flex-wrap items-center gap-3"><label className="relative flex h-11 min-w-[260px] flex-1 items-center rounded-lg border border-border/70 bg-surface px-3 text-text-secondary transition-colors focus-within:border-[#1976D2]/70 focus-within:ring-2 focus-within:ring-[#1976D2]/15"><Search className="mr-2 h-5 w-5 shrink-0" aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm nội dung, tên file, loại file..." aria-label="Tìm kiếm nội dung" className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" /></label><input ref={uploadInputRef} type="file" multiple className="hidden" onChange={handleUpload} aria-hidden="true" /><button type="button" disabled={isUploading} onClick={() => uploadInputRef.current?.click()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0D6EFD] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0B63E5] disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-4 w-4" aria-hidden />{isUploading ? "Đang tải…" : "Tải lên"}</button><button type="button" onClick={() => setNewestFirst((value) => !value)} className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-surface px-4 text-sm text-text-secondary transition-colors hover:bg-surface-overlay" aria-label={`Sắp xếp: ${newestFirst ? "mới nhất trước" : "cũ nhất trước"}`}><ArrowDownUp className="h-4 w-4" aria-hidden /> {newestFirst ? "Mới nhất" : "Cũ nhất"}</button><div className="flex h-11 shrink-0 items-center rounded-lg border border-border/70 bg-surface p-0.5" role="group" aria-label="Chế độ hiển thị"><button type="button" onClick={() => setGrid(false)} className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${!grid ? "bg-surface-muted text-[#1976D2] shadow-sm" : "text-text-secondary hover:bg-surface-overlay"}`} aria-label="Chế độ danh sách" aria-pressed={!grid}><List className="h-5 w-5" aria-hidden /></button><button type="button" onClick={() => setGrid(true)} className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${grid ? "bg-surface-muted text-[#1976D2] shadow-sm" : "text-text-secondary hover:bg-surface-overlay"}`} aria-label="Chế độ lưới" aria-pressed={grid}><Grid2X2 className="h-5 w-5" aria-hidden /></button></div></div></div>

          {selectedIds.size > 0 ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"><span className="text-sm font-medium text-text-primary">Đã chọn {selectedIds.size} mục</span><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => void handleDownloadSelected()} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-text-secondary hover:bg-surface"><Download className="h-4 w-4" aria-hidden />Tải xuống</button><button type="button" onClick={() => void handleTrashSelected()} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden />Thùng rác</button><button type="button" onClick={() => setSelectedIds(new Set())} className="h-9 px-2 text-sm text-text-secondary hover:underline">Hủy</button></div></div> : null}

          {workspace.isLoading ? <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border/70 bg-surface text-sm text-text-secondary">Đang tải dữ liệu…</div> : items.length === 0 ? <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary"><DocumentIcon className="h-6 w-6" aria-hidden /></span><h3 className="mt-4 text-base font-semibold text-text-primary">Chưa có nội dung</h3><p className="mt-2 text-sm text-text-secondary">Tải nội dung lên Hacom Cloud để lưu trữ và truy cập nhanh.</p></div> : grid ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{paginatedItems.map((item) => <ManageGridCard key={item.id} item={item} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelected(item.id)} onOpen={() => handleOpen(item)} onDownload={() => void handleDownload(item)} onTrash={() => void handleTrash(item)} />)}</div> : <div className="overflow-x-auto rounded-2xl border border-border/70 bg-surface"><div className="min-w-[1100px]"><div className="grid grid-cols-[36px_minmax(0,1fr)_180px_180px_220px_160px] items-center border-b border-border/70 px-4 py-3 text-xs font-semibold text-text-secondary"><label className="flex items-center"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="Chọn tất cả mục trên trang" className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" /></label><span>Tên</span><span>Loại</span><span>Kích thước</span><span>Ngày gửi</span><span>Thao tác</span></div>{paginatedItems.map((item) => <ManageTableRow key={item.id} item={item} selected={selectedIds.has(item.id)} menuOpen={openMenuId === item.id} onToggleSelect={() => toggleSelected(item.id)} onOpen={() => handleOpen(item)} onDownload={() => void handleDownload(item)} onTrash={() => void handleTrash(item)} onToggleMenu={() => setOpenMenuId((id) => id === item.id ? null : item.id)} />)}</div></div>}

          <nav className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-surface px-4 py-3 text-sm text-text-secondary" aria-label="Phân trang dữ liệu Hacom Cloud"><span>Hiển thị {items.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}–{Math.min(currentPage * ITEMS_PER_PAGE, items.length)} của {items.length} mục</span><div className="ml-auto flex items-center gap-1"><button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((page) => <button type="button" key={page} onClick={() => setCurrentPage(page)} className={`h-8 min-w-8 rounded-lg px-2 ${page === currentPage ? "bg-primary text-white" : "hover:bg-surface-overlay"}`} aria-current={page === currentPage ? "page" : undefined}>{page}</button>)}<button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang sau"><ChevronRight className="h-4 w-4" aria-hidden /></button></div></nav>
        </section>
      </div>
      <CloudQuotaRequestDialog isOpen={isUpgradeOpen} quota={workspace.quota} currentRequest={workspace.quotaRequest} isLoading={workspace.isRequestingQuota} onClose={() => setIsUpgradeOpen(false)} onSubmit={workspace.requestQuota} />
    </main>
  );
}

type ManageItemProps = { item: CloudItem; selected: boolean; onToggleSelect: () => void; onOpen: () => void; onDownload: () => void; onTrash: () => void };

const ManageTableRow: React.FC<ManageItemProps & { menuOpen: boolean; onToggleMenu: () => void }> = ({ item, selected, onToggleSelect, onOpen, onDownload, onTrash, menuOpen, onToggleMenu }) => (
  <article className={`relative grid min-h-[76px] grid-cols-[36px_minmax(0,1fr)_180px_180px_220px_160px] items-center border-b border-border/70 px-4 py-4 last:border-b-0 transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface-overlay"}`}>
    <label className="flex items-center"><input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${titleFor(item)}`} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" /></label>
    <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left"><CloudItemIcon type={item.type} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-text-primary">{titleFor(item)}</span><span className="mt-0.5 block truncate text-xs text-text-secondary">{getCloudItemPreview(item) || "Chưa có mô tả"}</span></span></button>
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-medium ${typeBadgeClass[item.type]}`}>{typeLabel[item.type]}</span><span className="text-xs text-text-secondary">{formatBytes(item.sizeBytes)}</span><span className="text-xs text-text-secondary">{formatSentDate(item.createdAt)}</span>
    <div className="relative flex items-center gap-1"><button type="button" disabled={!isDownloadable(item)} onClick={onDownload} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" aria-label="Tải xuống"><Download className="h-4 w-4" aria-hidden /></button><button type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-haspopup="menu" className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${menuOpen ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-text-secondary hover:bg-surface-muted"}`} aria-label="Thao tác khác"><MoreHorizontal className="h-4 w-4" aria-hidden /></button>{menuOpen ? <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-surface p-2 shadow-[0_12px_30px_rgba(15,23,42,0.14)]" role="menu"><button type="button" onClick={onOpen} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-muted" role="menuitem"><ExternalLink className="h-4 w-4 text-text-secondary" aria-hidden />Mở nội dung</button><div className="my-1 border-t border-border/70" /><button type="button" onClick={onTrash} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50" role="menuitem"><Trash2 className="h-4 w-4" aria-hidden />Chuyển vào Thùng rác</button></div> : null}</div>
  </article>
);

const ManageGridCard: React.FC<ManageItemProps> = ({ item, selected, onToggleSelect, onOpen, onDownload, onTrash }) => (
  <article className={`relative rounded-2xl border p-4 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border/70 hover:bg-surface-overlay"}`}><div className="flex items-start gap-3"><label className="mt-1 flex items-center"><input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${titleFor(item)}`} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" /></label><button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left"><CloudItemIcon type={item.type} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-text-primary">{titleFor(item)}</span><span className="mt-1 block text-xs text-text-secondary">{typeLabel[item.type]} · {formatBytes(item.sizeBytes)}</span></span></button></div><div className="mt-4 flex items-center justify-end gap-1"><button type="button" disabled={!isDownloadable(item)} onClick={onDownload} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" aria-label="Tải xuống"><Download className="h-4 w-4" aria-hidden /></button><button type="button" onClick={onTrash} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600" aria-label="Chuyển vào Thùng rác"><Trash2 className="h-4 w-4" aria-hidden /></button></div></article>
);
