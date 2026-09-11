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
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
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
import { useCloudWorkspace, type CloudWorkspaceOptions } from "../hooks/useCloudWorkspace";
import { formatBytes, getCloudItemPreview, getCloudItemTitle } from "../utils/cloudFormat";
import { downloadResourceWithName } from "../../../utils/downloadFile";
import { CloudItemIcon } from "../components/CloudItemIcon";
import { CloudQuotaRequestDialog } from "../components/CloudQuotaRequestDialog";
import { CLOUD_MAX_UPLOAD_BYTES } from "../constants";
import type { CloudItem } from "../types";
import { ROUTE_PATHS } from "../../../router/paths";
import "../styles/cloud.css";

type Filter = "all" | CloudItem["type"];
type SortChoice = "newest" | "oldest" | "titleAsc" | "titleDesc" | "sizeLarge" | "sizeSmall";

interface ManageFilters {
  type: Filter;
  from?: string;
  to?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
}

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

const workspaceErrorMessage = (error: { code: string; status: number; message: string } | null): string => {
  if (!error) return "";
  if (error.code === "INVALID_FILTER") {
    return "Bộ lọc nâng cao chưa được API Cloud hiện tại hỗ trợ. Hãy khởi động backend Cloud mới rồi thử lại.";
  }
  if (error.code === "CLOUD_AUTH_REQUIRED" || error.status === 401 || error.status === 403) {
    return "Phiên đăng nhập Cloud đã hết hạn. Hãy đăng nhập lại rồi thử lại.";
  }
  if (error.code === "CLOUD_UNAVAILABLE" || error.status >= 500 || error.status === 0) {
    return "Không thể kết nối Hacom Cloud lúc này. Kiểm tra API local rồi thử lại.";
  }
  return error.message || "Không thể tải dữ liệu Hacom Cloud.";
};

const sortOptions: Array<{ value: SortChoice; label: string; sort: CloudWorkspaceOptions["sort"]; order: CloudWorkspaceOptions["order"] }> = [
  { value: "newest", label: "Mới nhất", sort: "created_at", order: "desc" },
  { value: "oldest", label: "Cũ nhất", sort: "created_at", order: "asc" },
  { value: "titleAsc", label: "Tên A → Z", sort: "title", order: "asc" },
  { value: "titleDesc", label: "Tên Z → A", sort: "title", order: "desc" },
  { value: "sizeLarge", label: "Dung lượng lớn nhất", sort: "size_bytes", order: "desc" },
  { value: "sizeSmall", label: "Dung lượng nhỏ nhất", sort: "size_bytes", order: "asc" },
];

const sizeOptions: Array<{ value: string; label: string; minSizeBytes?: number; maxSizeBytes?: number }> = [
  { value: "all", label: "Mọi dung lượng" },
  { value: "small", label: "Nhỏ hơn 1 MB", minSizeBytes: 1, maxSizeBytes: 999_999 },
  { value: "medium", label: "1 – dưới 10 MB", minSizeBytes: 1_000_000, maxSizeBytes: 9_999_999 },
  { value: "large", label: "10 – dưới 50 MB", minSizeBytes: 10_000_000, maxSizeBytes: 49_999_999 },
  { value: "huge", label: "Từ 50 MB trở lên", minSizeBytes: 50_000_000 },
];

const datePreset = (preset: "today" | "7days" | "30days"): Pick<ManageFilters, "from" | "to"> => {
  const end = new Date();
  const start = new Date(end);
  if (preset === "today") start.setHours(0, 0, 0, 0);
  else {
    start.setDate(start.getDate() - (preset === "7days" ? 6 : 29));
    start.setHours(0, 0, 0, 0);
  }
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
};

const filterCount = (filters: ManageFilters): number =>
  Number(filters.type !== "all") + Number(Boolean(filters.from || filters.to)) + Number(filters.minSizeBytes !== undefined || filters.maxSizeBytes !== undefined);

export default function CloudManagePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const authUser = useAuthStore((state) => state.user);
  const userId = resolveCloudUserId(authUser?.id);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [appliedFilters, setAppliedFilters] = useState<ManageFilters>({ type: "all" });
  const [draftFilters, setDraftFilters] = useState<ManageFilters>({ type: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortChoice, setSortChoice] = useState<SortChoice>("newest");
  const selectedSort = sortOptions.find((option) => option.value === sortChoice) ?? sortOptions[0];
  const workspaceOptions = useMemo<CloudWorkspaceOptions>(() => ({
    query: debouncedQuery,
    type: appliedFilters.type === "all" ? undefined : appliedFilters.type,
    from: appliedFilters.from,
    to: appliedFilters.to,
    minSizeBytes: appliedFilters.minSizeBytes,
    maxSizeBytes: appliedFilters.maxSizeBytes,
    // The legacy Cloud API already defaults to newest-first. Omitting the
    // default pair keeps the management view compatible while the new API is
    // being rolled out; non-default choices still use server-side sorting.
    sort: sortChoice === "newest" ? undefined : selectedSort.sort,
    order: sortChoice === "newest" ? undefined : selectedSort.order,
    limit: ITEMS_PER_PAGE,
  }), [appliedFilters, debouncedQuery, selectedSort.order, selectedSort.sort, sortChoice]);
  const workspace = useCloudWorkspace(userId, workspaceOptions);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [grid, setGrid] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const items = workspace.items;
  const hasLoaded = workspace.hasLoadedSuccessfully;
  const errorMessage = workspaceErrorMessage(workspace.error);
  const loadedPageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const pageCount = Math.max(1, loadedPageCount + (workspace.nextCursor ? 1 : 0));
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

  const goToPage = useCallback((page: number) => {
    if (page > loadedPageCount && workspace.nextCursor) {
      void workspace.loadMore();
    }
    setCurrentPage(page);
  }, [loadedPageCount, workspace.loadMore, workspace.nextCursor]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, debouncedQuery, sortChoice]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setSelectedIds(new Set());
    setOpenMenuId(null);
  }, [appliedFilters, debouncedQuery, sortChoice]);

  useEffect(() => {
    const visibleIds = new Set(items.map((item) => item.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenuOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenMenuId(null);
        return;
      }
      if (!target.closest("[data-cloud-resource-menu-popup], [data-cloud-resource-menu-trigger]")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("pointerdown", closeMenuOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeMenuOnOutsidePointer);
  }, [openMenuId]);

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
        <button type="button" onClick={() => navigate(ROUTE_PATHS.CLOUD)} className="app-page-back-button shrink-0" aria-label="Quay lại Cloud của tôi"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
        <div className="min-w-0"><h1 className="truncate text-lg font-semibold leading-6 text-text-primary">Hacom Cloud</h1><p className="truncate text-sm text-text-secondary">Lưu trữ và truy cập nhanh nội dung quan trọng của bạn</p></div>
      </header>

      <div className="cloud-manage-layout grid min-h-[calc(100vh-var(--app-header-height))] w-full grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5 lg:px-5 lg:py-6">
        <div className="cloud-manage-sidebar">
          <aside className="cloud-manage-storage-card h-fit rounded-2xl border border-border/70 bg-surface p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-text-primary">Dung lượng lưu trữ</h2><span className="text-xs text-text-secondary">{hasLoaded && workspace.quota && workspace.quota.limitBytes > 0 ? `${((workspace.quota.usedBytes / workspace.quota.limitBytes) * 100).toFixed(1)}%` : "—"}</span></div><p className="mt-4 text-xl font-semibold text-text-primary">{hasLoaded && workspace.quota ? formatBytes(workspace.quota.usedBytes) : "—"} {hasLoaded && workspace.quota ? <span className="text-sm font-normal text-text-secondary">đã dùng</span> : null}</p><p className="mt-1 text-xs text-text-secondary">{hasLoaded && workspace.quota ? `trên tổng dung lượng ${formatBytes(workspace.quota.limitBytes)}` : "Đang chờ dữ liệu Cloud"}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${hasLoaded && workspace.quota && workspace.quota.limitBytes > 0 ? Math.min(100, workspace.quota.usedBytes / workspace.quota.limitBytes * 100) : 0}%` }} /></div><p className="mt-3 text-xs text-text-secondary">{hasLoaded && workspace.quota ? `Còn trống ${formatBytes(workspace.quota.availableBytes)}` : "Chưa có số liệu"}</p></aside>
          <aside className="cloud-manage-upgrade-card flex min-h-[300px] flex-col justify-end rounded-2xl p-5 text-center"><div className="my-auto"><span className="cloud-manage-upgrade-card__icon mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full shadow-sm"><Cloud className="h-7 w-7" aria-hidden /></span><h2 className="text-lg font-semibold leading-6 text-text-primary">Nâng cấp dung lượng<span className="block">Cloud của tôi</span></h2><div className="mt-6 space-y-3 text-left text-sm text-text-secondary"><div className="flex items-center gap-2.5"><span className="cloud-manage-upgrade-card__benefit-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><ChartPie className="h-5 w-5" aria-hidden /></span><span>Không gian lưu trữ lên đến 10 GB</span></div><div className="flex items-center gap-2.5"><span className="cloud-manage-upgrade-card__benefit-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><CloudUpload className="h-5 w-5" aria-hidden /></span><span>Tự động bảo toàn dữ liệu trò chuyện</span></div><div className="flex items-center gap-2.5"><span className="cloud-manage-upgrade-card__benefit-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Check className="h-5 w-5" aria-hidden /></span><span>Truy cập nhanh, an toàn mọi lúc</span></div></div></div><button type="button" onClick={() => setIsUpgradeOpen(true)} className="mt-5 h-10 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover">Thêm dung lượng</button></aside>
        </div>

        <section className="cloud-manage-content min-w-0">
          <div className="cloud-manage-overview space-y-5">
            {errorMessage ? <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${workspace.hasLoadedSuccessfully ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`} role="alert"><span className="min-w-0 flex-1">{errorMessage}{workspace.isDataStale ? " Kết quả đang hiển thị là lần tải thành công gần nhất." : ""}</span><button type="button" onClick={() => void workspace.refresh()} className="shrink-0 font-semibold underline underline-offset-2">Thử lại</button></div> : null}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{cards.map((card) => { const aggregate = card.type === "all" ? { count: workspace.summary?.totalCount ?? workspace.items.length, bytes: workspace.summary?.totalBytes ?? workspace.items.reduce((total, item) => total + item.sizeBytes, 0) } : workspace.summary?.byType[card.type]; const count = aggregate?.count ?? (card.type === "all" ? workspace.items.length : workspace.items.filter((item) => item.type === card.type).length); const bytes = aggregate?.bytes ?? (card.type === "all" ? 0 : bytesFor(card.type)); return <button type="button" key={card.type} onClick={() => { const next = filter === card.type ? "all" : card.type; setFilter(next); setAppliedFilters((current) => ({ ...current, type: next })); setDraftFilters((current) => ({ ...current, type: next })); }} className={`flex min-h-[88px] items-center gap-3 rounded-2xl border bg-surface px-4 text-left transition-colors ${filter === card.type ? "border-[#1976D2]/70 bg-[#EFF6FF]" : "border-border/70 hover:bg-surface-overlay"}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-secondary">{card.icon}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold leading-tight text-text-primary">{card.label}</span><span className="mt-1 block text-xs text-text-secondary">{formatBytes(bytes)} · {count} mục</span></span></button>; })}</div>
          </div>

          <div className="cloud-manage-toolbar space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-text-primary">{filter === "all" ? "Tất cả" : typeLabel[filter]} dữ liệu Hacom Cloud</h2><span className="text-xs text-text-secondary">{workspace.summary ? `${workspace.summary.totalCount} mục` : ""}</span></div><div className="flex flex-wrap items-center gap-3"><label className="relative flex h-11 min-w-[260px] flex-1 items-center rounded-lg border border-border/70 bg-surface px-3 text-text-secondary transition-colors focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/15"><Search className="mr-2 h-5 w-5 shrink-0" aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm nội dung, tên file, loại file..." aria-label="Tìm kiếm nội dung" className="cloud-manage-search-input min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted" /></label><input ref={uploadInputRef} type="file" multiple className="hidden" onChange={handleUpload} aria-hidden="true" /><button type="button" disabled={isUploading} onClick={() => uploadInputRef.current?.click()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-4 w-4" aria-hidden />{isUploading ? "Đang tải…" : "Tải lên"}</button><label className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 text-sm text-text-secondary"><ArrowDownUp className="h-4 w-4" aria-hidden /><span className="sr-only">Sắp xếp</span><select value={sortChoice} onChange={(event) => setSortChoice(event.target.value as SortChoice)} className="bg-transparent text-sm text-text-primary outline-none"><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="titleAsc">Tên A → Z</option><option value="titleDesc">Tên Z → A</option><option value="sizeLarge">Dung lượng lớn nhất</option><option value="sizeSmall">Dung lượng nhỏ nhất</option></select></label><div className="relative"><button type="button" onClick={() => { setDraftFilters(appliedFilters); setFilterOpen((open) => !open); }} className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${filterCount(appliedFilters) ? "border-primary/50 bg-primary/5 text-primary" : "border-border/70 bg-surface text-text-secondary hover:bg-surface-overlay"}`} aria-expanded={filterOpen} aria-haspopup="dialog"><SlidersHorizontal className="h-4 w-4" aria-hidden />Bộ lọc{filterCount(appliedFilters) ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-white">{filterCount(appliedFilters)}</span> : null}</button>{filterOpen ? <CloudFilterPopover filters={draftFilters} onChange={setDraftFilters} onApply={() => { setFilter(draftFilters.type); setAppliedFilters(draftFilters); setFilterOpen(false); }} onReset={() => setDraftFilters({ type: "all" })} onClose={() => setFilterOpen(false)} /> : null}</div><div className="flex h-11 shrink-0 items-center rounded-lg border border-border/70 bg-surface p-0.5" role="group" aria-label="Chế độ hiển thị"><button type="button" onClick={() => setGrid(false)} className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${!grid ? "bg-surface-muted text-primary shadow-sm" : "text-text-secondary hover:bg-surface-overlay"}`} aria-label="Chế độ danh sách" aria-pressed={!grid}><List className="h-5 w-5" aria-hidden /></button><button type="button" onClick={() => setGrid(true)} className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${grid ? "bg-surface-muted text-primary shadow-sm" : "text-text-secondary hover:bg-surface-overlay"}`} aria-label="Chế độ lưới" aria-pressed={grid}><Grid2X2 className="h-5 w-5" aria-hidden /></button></div></div>{debouncedQuery.length > 0 && debouncedQuery.length < 3 ? <p className="text-xs text-text-secondary">Nhập ít nhất 3 ký tự để tìm trong nội dung Cloud.</p> : null}{filterCount(appliedFilters) || query ? <div className="flex flex-wrap items-center gap-2">{appliedFilters.type !== "all" ? <FilterChip label={typeLabel[appliedFilters.type]} onRemove={() => { const next = { ...appliedFilters, type: "all" as Filter }; setAppliedFilters(next); setDraftFilters(next); setFilter("all"); }} /> : null}{appliedFilters.from || appliedFilters.to ? <FilterChip label="Khoảng thời gian" onRemove={() => { const next = { ...appliedFilters, from: undefined, to: undefined }; setAppliedFilters(next); setDraftFilters(next); }} /> : null}{appliedFilters.minSizeBytes !== undefined || appliedFilters.maxSizeBytes !== undefined ? <FilterChip label="Dung lượng" onRemove={() => { const next = { ...appliedFilters, minSizeBytes: undefined, maxSizeBytes: undefined }; setAppliedFilters(next); setDraftFilters(next); }} /> : null}{query ? <FilterChip label={`Tìm: ${query}`} onRemove={() => setQuery("")} /> : null}<button type="button" onClick={() => { setQuery(""); setAppliedFilters({ type: "all" }); setDraftFilters({ type: "all" }); setFilter("all"); }} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-primary hover:bg-primary/10">Xóa tất cả</button></div> : null}</div>

          <div className="cloud-manage-data-stack">
            {selectedIds.size > 0 ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"><span className="text-sm font-medium text-text-primary">Đã chọn {selectedIds.size} mục</span><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => void handleDownloadSelected()} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-text-secondary hover:bg-surface"><Download className="h-4 w-4" aria-hidden />Tải xuống</button><button type="button" onClick={() => void handleTrashSelected()} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden />Thùng rác</button><button type="button" onClick={() => setSelectedIds(new Set())} className="h-9 px-2 text-sm text-text-secondary hover:underline">Hủy</button></div></div> : null}

            {workspace.isLoading ? <div className="cloud-manage-resource-panel flex min-h-[360px] items-center justify-center rounded-2xl border border-border/70 bg-surface text-sm text-text-secondary">Đang tải dữ liệu…</div> : workspace.error && items.length === 0 ? <div className="cloud-manage-resource-panel flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-surface px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><X className="h-6 w-6" aria-hidden /></span><h3 className="mt-4 text-base font-semibold text-text-primary">Không thể tải dữ liệu</h3><p className="mt-2 max-w-md text-sm text-text-secondary">{errorMessage}</p><button type="button" onClick={() => void workspace.refresh()} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse hover:bg-primary-hover">Thử lại</button></div> : items.length === 0 ? <div className="cloud-manage-resource-panel flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-border/70 bg-surface text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary"><DocumentIcon className="h-6 w-6" aria-hidden /></span><h3 className="mt-4 text-base font-semibold text-text-primary">Chưa có nội dung</h3><p className="mt-2 text-sm text-text-secondary">Tải nội dung lên Hacom Cloud để lưu trữ và truy cập nhanh.</p></div> : grid ? <div className="cloud-manage-resource-panel cloud-manage-resource-panel--grid grid grid-cols-1 gap-3 overflow-auto rounded-2xl border border-border/70 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3">{paginatedItems.map((item) => <ManageGridCard key={item.id} item={item} selected={selectedIds.has(item.id)} onToggleSelect={() => toggleSelected(item.id)} onOpen={() => handleOpen(item)} onDownload={() => void handleDownload(item)} onTrash={() => void handleTrash(item)} />)}</div> : <div className="cloud-manage-resource-panel cloud-manage-resource-panel--table overflow-x-auto rounded-2xl border border-border/70 bg-surface"><div className="min-w-[1100px]"><div className="grid grid-cols-[36px_minmax(0,1fr)_180px_180px_220px_160px] items-center border-b border-border/70 px-4 py-3 text-xs font-semibold text-text-secondary"><label className="flex items-center"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="Chọn tất cả mục trên trang" className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" /></label><span>Tên</span><span>Loại</span><span>Kích thước</span><span>Ngày gửi</span><span>Thao tác</span></div>{paginatedItems.map((item) => <ManageTableRow key={item.id} item={item} selected={selectedIds.has(item.id)} menuOpen={openMenuId === item.id} onToggleSelect={() => toggleSelected(item.id)} onOpen={() => handleOpen(item)} onDownload={() => void handleDownload(item)} onTrash={() => void handleTrash(item)} onToggleMenu={() => setOpenMenuId((id) => id === item.id ? null : item.id)} />)}</div></div>}
          </div>

          <nav className="cloud-manage-pagination flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-surface px-4 py-3 text-sm text-text-secondary" aria-label="Phân trang dữ liệu Hacom Cloud"><span>Hiển thị {items.length ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}–{Math.min(currentPage * ITEMS_PER_PAGE, items.length)} của {workspace.summary && !filterCount(appliedFilters) && !debouncedQuery ? workspace.summary.totalCount : items.length}{workspace.nextCursor ? "+" : ""} mục</span><div className="ml-auto flex items-center gap-1"><button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang trước"><ChevronLeft className="h-4 w-4" aria-hidden /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((page) => <button type="button" key={page} onClick={() => goToPage(page)} className={`h-8 min-w-8 rounded-lg px-2 ${page === currentPage ? "bg-primary text-white" : "hover:bg-surface-overlay"}`} aria-current={page === currentPage ? "page" : undefined}>{page}</button>)}<button type="button" disabled={currentPage >= pageCount} onClick={() => goToPage(Math.min(pageCount, currentPage + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang sau"><ChevronRight className="h-4 w-4" aria-hidden /></button></div></nav>
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
    <div className="relative flex items-center gap-1"><button type="button" disabled={!isDownloadable(item)} onClick={onDownload} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" aria-label="Tải xuống"><Download className="h-4 w-4" aria-hidden /></button><button type="button" data-cloud-resource-menu-trigger="true" onClick={onToggleMenu} aria-expanded={menuOpen} aria-haspopup="menu" className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${menuOpen ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-text-secondary hover:bg-surface-muted"}`} aria-label="Thao tác khác"><MoreHorizontal className="h-4 w-4" aria-hidden /></button>{menuOpen ? <div data-cloud-resource-menu-popup="true" className="absolute right-0 top-11 z-20 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-[0_12px_30px_rgba(15,23,42,0.14)]" role="menu"><button type="button" onClick={onOpen} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-muted" role="menuitem"><ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />Mở nội dung</button><div className="my-1 border-t border-border/70" /><button type="button" onClick={onTrash} className="flex h-10 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50" role="menuitem"><Trash2 className="h-4 w-4 shrink-0" aria-hidden />Chuyển vào Thùng rác</button></div> : null}</div>
  </article>
);

const ManageGridCard: React.FC<ManageItemProps> = ({ item, selected, onToggleSelect, onOpen, onDownload, onTrash }) => (
  <article className={`relative rounded-2xl border p-4 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border/70 hover:bg-surface-overlay"}`}><div className="flex items-start gap-3"><label className="mt-1 flex items-center"><input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`${selected ? "Bỏ chọn" : "Chọn"} ${titleFor(item)}`} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" /></label><button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left"><CloudItemIcon type={item.type} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-text-primary">{titleFor(item)}</span><span className="mt-1 block text-xs text-text-secondary">{typeLabel[item.type]} · {formatBytes(item.sizeBytes)}</span></span></button></div><div className="mt-4 flex items-center justify-end gap-1"><button type="button" disabled={!isDownloadable(item)} onClick={onDownload} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-30" aria-label="Tải xuống"><Download className="h-4 w-4" aria-hidden /></button><button type="button" onClick={onTrash} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600" aria-label="Chuyển vào Thùng rác"><Trash2 className="h-4 w-4" aria-hidden /></button></div></article>
);

const FilterChip: React.FC<{ label: string; onRemove?: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 text-xs font-medium text-primary">
    {label}
    {onRemove ? <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-primary/15" aria-label={`Bỏ lọc ${label}`}><X className="h-3.5 w-3.5" aria-hidden /></button> : null}
  </span>
);

const CloudFilterPopover: React.FC<{
  filters: ManageFilters;
  onChange: (filters: ManageFilters) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
}> = ({ filters, onChange, onApply, onReset, onClose }) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      if (popoverRef.current && event.target instanceof Node && !popoverRef.current.contains(event.target)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("pointerdown", handleOutside); document.removeEventListener("keydown", handleKey); };
  }, [onClose]);
  const sizeKey = sizeOptions.find((option) => option.minSizeBytes === filters.minSizeBytes && option.maxSizeBytes === filters.maxSizeBytes)?.value ?? "all";
  const dateInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const dateInput = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const updateDate = (key: "from" | "to", value: string) => onChange({ ...filters, [key]: value ? new Date(`${value}T${key === "from" ? "00:00:00" : "23:59:59.999"}`).toISOString() : undefined });
  return <div ref={popoverRef} className="absolute right-0 top-12 z-30 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_45px_rgba(15,23,42,0.18)]" role="dialog" aria-label="Bộ lọc Cloud">
    <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-text-primary">Bộ lọc nâng cao</h3><p className="mt-0.5 text-xs text-text-secondary">Lọc chính xác nội dung trong toàn bộ Cloud</p></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-overlay" aria-label="Đóng bộ lọc"><X className="h-4 w-4" aria-hidden /></button></div>
    <div className="mt-4 space-y-4">
      <fieldset><legend className="mb-2 text-xs font-semibold text-text-secondary">Loại nội dung</legend><div className="grid grid-cols-2 gap-1.5">{(["all", "image", "video", "file", "audio", "text", "link"] as Filter[]).map((type) => <button type="button" key={type} onClick={() => onChange({ ...filters, type })} className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${filters.type === type ? "border-primary/50 bg-primary/8 font-medium text-primary" : "border-border/70 text-text-secondary hover:bg-surface-overlay"}`}>{type === "all" ? "Tất cả" : typeLabel[type]}</button>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold text-text-secondary">Ngày gửi</legend><div className="flex flex-wrap gap-1.5">{([{ value: "today", label: "Hôm nay" }, { value: "7days", label: "7 ngày qua" }, { value: "30days", label: "30 ngày qua" }] as const).map((preset) => <button type="button" key={preset.value} onClick={() => onChange({ ...filters, ...datePreset(preset.value) })} className="rounded-full border border-border/70 px-2.5 py-1.5 text-xs text-text-secondary hover:border-primary/40 hover:text-primary">{preset.label}</button>)}<button type="button" onClick={() => onChange({ ...filters, from: undefined, to: undefined })} className="rounded-full border border-border/70 px-2.5 py-1.5 text-xs text-text-secondary hover:border-primary/40 hover:text-primary">Bất kỳ ngày nào</button></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-text-secondary">Từ<input type="date" value={dateInput(filters.from)} onChange={(event) => updateDate("from", event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border/70 bg-background px-2 text-xs text-text-primary outline-none focus:border-primary/60" /></label><label className="text-xs text-text-secondary">Đến<input type="date" value={dateInput(filters.to)} onChange={(event) => updateDate("to", event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border/70 bg-background px-2 text-xs text-text-primary outline-none focus:border-primary/60" /></label></div></fieldset>
      <label className="block text-xs font-semibold text-text-secondary">Dung lượng<select value={sizeKey} onChange={(event) => { const option = sizeOptions.find((candidate) => candidate.value === event.target.value) ?? sizeOptions[0]; onChange({ ...filters, minSizeBytes: option.minSizeBytes, maxSizeBytes: option.maxSizeBytes }); }} className="mt-2 h-10 w-full rounded-lg border border-border/70 bg-background px-2.5 text-sm font-normal text-text-primary outline-none focus:border-primary/60">{sizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    {dateInvalid ? <p className="mt-2 text-xs text-red-600">Ngày bắt đầu phải trước ngày kết thúc.</p> : null}<div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3"><button type="button" onClick={onReset} className="text-xs font-medium text-text-secondary hover:text-primary">Đặt lại</button><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-overlay">Hủy</button><button type="button" disabled={dateInvalid} onClick={onApply} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Áp dụng</button></div></div>
  </div>;
};
