import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClickOutside } from "../../../hooks";
import {
  ArrowDownUp,
  Check,
  Download,
  File,
  FileImage,
  Forward,
  Grid3x2,
  List,
  Mic,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import { AppPage, AppPageHeader } from "../../../components/layout/AppPage";
import { SettingsPageShell } from "../../../components/settings/SettingsPageShell";
import { Checkbox, ConfirmDialog, Input, toast } from "../../../components/ui";
import { cloudApi, type CloudAsset, type CloudQuota } from "../api/cloudApi";
import { CloudStorageCard } from "../components/HacomCloudInfoSidebar";
import { extractApiError } from "../../../lib/apiContract";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import { formatRelativeDate } from "../../../utils/formatTime";
import { FileTypeIcon } from "../../../components/message/FileTypeIcon";
import { downloadResourceWithName } from "../../../utils/downloadFile";
import { readCachedCloudConversationId } from "../personalCloudPolicy";
import { ROUTE_PATHS } from "../../../router/paths";
import wsManager from "../../../lib/socket";
import { SafeImage } from "../../../components/common/SafeImage";
import { useBatchThumbnailUrl } from "../../../hooks/useBatchThumbnailUrl";
import { useInViewport } from "../../../hooks/useInViewport";
import { ForwardModal } from "../../../components/chat/ForwardModal";
import type { Message } from "../../../types";
import { MessageStatus, MessageType } from "../../../types";
import { useAuthStore } from "../../../stores";

type MediaFilter = "all" | "image" | "video" | "file" | "audio";
type SortKey = "date_desc" | "date_asc" | "size_desc" | "size_asc";
type ViewMode = "list" | "grid";

const MEDIA_TILES: { key: MediaFilter; label: string; icon: React.ReactNode; quotaKey?: keyof NonNullable<CloudQuota["usedByType"]> }[] = [
  { key: "image", label: "Ảnh", icon: <FileImage className="h-5 w-5" />, quotaKey: "image" },
  { key: "video", label: "Video", icon: <Video className="h-5 w-5" />, quotaKey: "video" },
  { key: "file", label: "File", icon: <File className="h-5 w-5" />, quotaKey: "file" },
  { key: "audio", label: "Tin nhắn thoại", icon: <Mic className="h-5 w-5" /> },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date_desc", label: "Thời gian gửi (mới → cũ)" },
  { key: "date_asc", label: "Thời gian gửi (cũ → mới)" },
  { key: "size_desc", label: "Dung lượng giảm dần" },
  { key: "size_asc", label: "Dung lượng tăng dần" },
];

const sortAssets = (assets: CloudAsset[], sort: SortKey): CloudAsset[] => {
  const sorted = [...assets];
  sorted.sort((a, b) => {
    switch (sort) {
      case "date_asc":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "size_desc":
        return Number(b.sizeBytes) - Number(a.sizeBytes);
      case "size_asc":
        return Number(a.sizeBytes) - Number(b.sizeBytes);
      case "date_desc":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
  return sorted;
};

const getAssetTypeLabel = (asset: CloudAsset): string => {
  const extension = asset.originalFilename.split(".").pop()?.trim();
  if (extension && extension !== asset.originalFilename && /^[a-z0-9]{1,5}$/i.test(extension)) {
    return extension.toUpperCase();
  }

  switch (asset.mediaType) {
    case "image": return "Ảnh";
    case "video": return "Video";
    case "audio": return "Âm thanh";
    default: return "Tệp";
  }
};

const getAssetMessageType = (asset: CloudAsset): MessageType => {
  if (asset.mediaType === "image") return MessageType.IMAGE;
  if (asset.mediaType === "video") return MessageType.VIDEO;
  return MessageType.FILE;
};

const buildCloudAssetForwardMessage = (
  conversationId: string,
  currentUserId: string,
  asset: CloudAsset,
): Message | null => {
  const attachmentId = asset.attachmentId;
  if (!asset.messageId || !attachmentId) return null;

  const type = getAssetMessageType(asset);
  return {
    id: asset.messageId,
    conversationId,
    senderId: currentUserId,
    content: "",
    type,
    status: MessageStatus.SENT,
    createdAt: asset.createdAt,
    updatedAt: asset.createdAt,
    attachments: [
      {
        id: attachmentId,
        type,
        fileName: asset.originalFilename,
        mimeType: asset.mimeType,
        fileSize: Number(asset.sizeBytes) || 0,
      },
    ],
  } as unknown as Message;
};

const CloudAssetThumbnail: React.FC<{
  asset: CloudAsset;
  conversationId: string | null;
  size?: "list" | "grid";
}> = ({ asset, conversationId, size = "list" }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const media = asset.mediaType === "image" || asset.mediaType === "video";
  const attachmentId = asset.attachmentId ?? "";
  const visible = useInViewport(containerRef, {
    rootMargin: "160px 0px",
    enabled: media && Boolean(conversationId && attachmentId),
  });
  const { urls } = useBatchThumbnailUrl(
    conversationId ?? undefined,
    media && attachmentId ? [attachmentId] : [],
    { autoFetch: media && visible && Boolean(conversationId && attachmentId) },
  );
  const thumbnailUrl = attachmentId ? urls[attachmentId]?.url : null;
  const dimensions = size === "list" ? "h-11 w-11" : "h-12 w-12";
  const fallback = (
    <span className="grid h-full w-full place-items-center bg-surface-hover text-text-muted">
      <FileTypeIcon
        type={getFileIconType(asset.mimeType, asset.originalFilename)}
        fileName={asset.originalFilename}
        variant="outline"
        className="h-7 w-7 shrink-0"
      />
    </span>
  );

  return (
    <span
      ref={containerRef}
      className={`relative block ${dimensions} shrink-0 overflow-hidden rounded-lg border border-border/60 bg-surface-hover`}
      aria-hidden="true"
    >
      {thumbnailUrl ? (
        <SafeImage
          src={thumbnailUrl}
          alt=""
          className="h-full w-full"
          objectFit={asset.mediaType === "image" ? "cover" : "contain"}
          fallback={fallback}
        />
      ) : fallback}
      {asset.mediaType === "video" && thumbnailUrl ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/15">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-text-primary shadow-sm">
            <Play className="ml-px h-3 w-3 fill-current" />
          </span>
        </span>
      ) : null}
    </span>
  );
};

const SortDropdown: React.FC<{ value: SortKey; onChange: (key: SortKey) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const label = SORT_OPTIONS.find((option) => option.key === value)?.label ?? "";
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setOpen(false), { active: open, escape: true });

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
        aria-label="Sắp xếp tệp"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowDownUp className="h-[18px] w-[18px] shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg" role="menu">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              onClick={() => { onChange(option.key); setOpen(false); }}
              className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/30"
            >
              {option.label}
              {option.key === value && <Check className="h-4 w-4 text-brand-solid" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const RowMenu: React.FC<{
  asset: CloudAsset;
  onDownload: () => void;
  onForward: () => void;
  onTrash: () => void;
}> = ({ asset, onDownload, onForward, onTrash }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setOpen(false), { active: open, escape: true });

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
        aria-label={`Tùy chọn tệp ${asset.originalFilename}`}
        aria-expanded={open}
        title="Tùy chọn tệp"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-44 rounded-xl border border-border bg-surface p-1.5 shadow-lg" role="menu">
          <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/30" onClick={() => { onDownload(); setOpen(false); }}>
            <Download className="h-4 w-4" />Lưu về máy
          </button>
          <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/30" onClick={() => { onForward(); setOpen(false); }}>
            <Forward className="h-4 w-4" />Chia sẻ
          </button>
          <div className="my-1 border-t border-border/70" />
          <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-danger/25" onClick={() => { onTrash(); setOpen(false); }}>
            <Trash2 className="h-4 w-4" />Xóa
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * "Xem và quản lý Hacom Cloud" — trang riêng đầy đủ, khớp bố cục Zalo My Documents:
 * cột trái là thanh dung lượng + nâng cấp, cột phải là 4 ô lọc theo loại, bảng có
 * sort + đổi list/grid, và chế độ chọn nhiều để tải/xóa hàng loạt.
 */
export const CloudManageView: React.FC<{
  quota: CloudQuota | null;
  assets: CloudAsset[];
  onChanged: () => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  conversationId?: string | null;
}> = ({ quota, assets, onChanged, loading = false, error = null, onRetry, conversationId }) => {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");
  const cachedConversationId = useMemo(() => readCachedCloudConversationId(), []);
  const cloudConversationId = conversationId ?? cachedConversationId;
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => assets.filter((asset) => asset.status === "available"), [assets]);
  const filtered = useMemo(() => {
    const byType = filter === "all" ? available : available.filter((asset) => asset.mediaType === filter);
    const byQuery = query.trim()
      ? byType.filter((asset) => asset.originalFilename.toLowerCase().includes(query.trim().toLowerCase()))
      : byType;
    return sortAssets(byQuery, sort);
  }, [available, filter, query, sort]);

  const selected = useMemo(() => filtered.filter((asset) => selectedIds.has(asset.id)), [filtered, selectedIds]);
  const selectedBytes = useMemo(() => selected.reduce((sum, asset) => sum + (Number(asset.sizeBytes) || 0), 0), [selected]);

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelected = (assetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((current) =>
      current.size === filtered.length ? new Set() : new Set(filtered.map((asset) => asset.id)),
    );
  };

  const downloadAsset = async (asset: CloudAsset) => {
    try {
      const result = await cloudApi.download(asset.id);
      await downloadResourceWithName(result.url, asset.originalFilename);
    } catch (error) {
      toast.error(extractApiError(error).message);
    }
  };

  const trashAsset = async (asset: CloudAsset) => {
    try {
      await cloudApi.trash(asset.id);
      await onChanged();
      toast.action(`Đã xóa ${asset.originalFilename}`, "Hoàn tác", () => {
        void cloudApi.restore(asset.id).then(onChanged).catch((error) => toast.error(extractApiError(error).message));
      });
    } catch (error) {
      toast.error(extractApiError(error).message);
    }
  };

  const forwardAsset = useCallback((asset: CloudAsset) => {
    if (!cloudConversationId || !currentUserId) {
      toast.error("Không thể chia sẻ mục này");
      return;
    }
    const message = buildCloudAssetForwardMessage(cloudConversationId, currentUserId, asset);
    if (!message) {
      toast.error("Mục này chưa sẵn sàng để chia sẻ");
      return;
    }
    setForwardMessage(message);
  }, [cloudConversationId, currentUserId]);

  const downloadSelected = async () => {
    for (const asset of selected) {
      // ponytail: tải tuần tự — trình duyệt tự chặn nhiều download "cùng lúc" từ script,
      // song song không nhanh hơn mà dễ bị chặn popup.
      await downloadAsset(asset);
    }
  };

  const viewOriginalMessage = () => {
    if (cloudConversationId) navigate(`${ROUTE_PATHS.CHAT}/${cloudConversationId}`);
  };

  const trashSelected = async () => {
    setBusy(true);
    try {
      let failed = 0;
      for (const asset of selected) {
        try {
          await cloudApi.trash(asset.id);
        } catch {
          failed += 1;
        }
      }
      await onChanged();
      exitSelectMode();
      setConfirmTrash(false);
      if (failed > 0) toast.warning(`Đã xóa ${selected.length - failed}/${selected.length} mục, ${failed} mục lỗi`);
      else toast.success(`Đã xóa ${selected.length} mục`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppPage>
      <AppPageHeader
        title="Hacom Cloud"
        subtitle="Lưu trữ và truy cập nhanh nội dung quan trọng của bạn"
        onBack={() => navigate(-1)}
      />
      {/* ponytail: Zalo bán gói nâng cấp dung lượng, Hacom Cloud không có — bỏ thẻ
          "Nâng cấp" thay vì dựng nút dẫn tới tính năng chưa tồn tại. */}
      <SettingsPageShell
        header={null}
        sidebar={
          <div className="hidden h-full min-h-0 flex-col gap-4 overflow-y-auto md:flex">
            <CloudStorageCard quota={quota} error={error} onRetry={onRetry} />
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-background p-4 sm:p-5">
          {/* 4 ô lọc theo loại, giống Zalo My Documents */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {loading ? MEDIA_TILES.map((tile) => (
              <div key={tile.key} className="skeleton h-[72px] rounded-xl" />
            )) : MEDIA_TILES.map((tile) => {
              const bytes = tile.quotaKey ? quota?.usedByType?.[tile.quotaKey] : undefined;
              const active = filter === tile.key;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setFilter(active ? "all" : tile.key)}
                  aria-pressed={active}
                  className={`flex h-[72px] min-w-0 items-center gap-3 rounded-xl border px-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 ${
                    active ? "border-brand-solid/45 bg-brand-soft/35" : "border-border bg-surface/40 hover:border-border-strong hover:bg-surface-hover"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-brand-soft text-brand-solid" : "bg-surface-hover text-text-muted"}`}>
                    {tile.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">{tile.label}</span>
                    {bytes !== undefined && <span className="block text-xs text-text-muted">{formatFileSize(Number(bytes) || 0)}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Header: mặc định "Chọn" hoặc thanh hành động khi đang chọn */}
          {selectMode ? (
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
              <span className="text-sm font-medium text-text-primary">
                Đã chọn {selected.length} mục ({formatFileSize(selectedBytes)})
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={!selected.length} onClick={() => void downloadSelected()} className="rounded text-[13px] font-medium text-brand-solid hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Lưu về máy
                </button>
                <button type="button" disabled={!selected.length || !cloudConversationId} onClick={viewOriginalMessage} className="rounded text-[13px] font-medium text-brand-solid hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Xem tin nhắn gốc
                </button>
                <button type="button" disabled={!selected.length} onClick={() => setConfirmTrash(true)} className="rounded text-[13px] font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/25 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Xóa
                </button>
                <button type="button" onClick={exitSelectMode} className="rounded text-[13px] font-medium text-text-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30">
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="min-w-0 text-sm font-semibold text-text-primary">Tất cả dữ liệu Hacom Cloud</h2>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm tệp"
                  aria-label="Tìm tệp trong Hacom Cloud"
                  leftIcon={<Search className="h-[18px] w-[18px]" />}
                  containerClassName="w-full sm:w-[260px] sm:max-w-[260px]"
                  className="h-10 rounded-[10px] text-[13px]"
                />
                <SortDropdown value={sort} onChange={setSort} />
                <div className="hidden sm:block">
                  <div className="flex h-10 items-center gap-1 rounded-[10px] border border-border bg-surface p-1" role="group" aria-label="Kiểu hiển thị tệp">
                    <button type="button" onClick={() => setView("list")} aria-label="Chuyển sang dạng danh sách" aria-pressed={view === "list"} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 ${view === "list" ? "bg-brand-soft text-brand-solid" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"}`}>
                      <List className="h-[18px] w-[18px]" />
                    </button>
                    <button type="button" onClick={() => setView("grid")} aria-label="Chuyển sang dạng lưới" aria-pressed={view === "grid"} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 ${view === "grid" ? "bg-brand-soft text-brand-solid" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"}`}>
                      <Grid3x2 className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && !selectMode && filtered.length > 0 && (
            <div className="flex min-h-6 items-center px-1">
              <Checkbox
                checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                onChange={() => { setSelectMode(true); toggleSelectAll(); }}
                label="Chọn"
                containerClassName="w-auto"
              />
            </div>
          )}

          {/* Bảng / lưới nội dung */}
          <div className="scrollbar-stable min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {error ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <File className="h-8 w-8 text-text-muted" />
                <p className="text-sm font-medium text-text-primary">Không thể tải danh sách tệp</p>
                <p className="text-xs text-text-muted">Vui lòng kiểm tra kết nối và thử lại.</p>
                {onRetry ? (
                  <button type="button" onClick={onRetry} className="mt-1 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-brand-solid transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30">
                    <RefreshCw className="h-4 w-4" />Thử lại
                  </button>
                ) : null}
              </div>
            ) : loading ? (
              <div aria-label="Đang tải danh sách tệp" className="skeleton-stage space-y-px">
                <div className="skeleton h-11 rounded-md" />
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex h-[68px] items-center gap-3 border-b border-border/60 px-3">
                    <div className="skeleton h-11 w-11 shrink-0 rounded-lg" />
                    <div className="skeleton h-3.5 w-2/5 rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-hover text-text-muted"><File className="h-6 w-6" /></span>
                <span className="text-sm font-medium text-text-primary">{query.trim() ? "Không tìm thấy tệp phù hợp" : "Chưa có tệp nào"}</span>
                <span className="max-w-sm text-xs text-text-muted">{query.trim() ? "Hãy thử từ khóa khác." : "Tải tệp lên Hacom Cloud để lưu trữ và truy cập nhanh."}</span>
              </div>
            ) : view === "list" ? (
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col className="w-12" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="h-11 border-b border-border bg-surface-hover/35 text-left text-xs font-semibold text-text-secondary">
                    <th className="px-2" />
                    <th className="px-2 font-semibold">Tên</th>
                    <th className="px-2 font-semibold">Kích thước</th>
                    <th className="px-2 font-semibold">Ngày gửi</th>
                    <th className="px-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset) => {
                    const selectedRow = selectedIds.has(asset.id);
                    return (
                      <tr key={asset.id} className={`group h-[68px] border-b border-border/60 transition-colors ${selectedRow ? "bg-brand-soft/30" : "hover:bg-surface-hover/70"}`}>
                        <td className="px-2 align-middle">
                          {selectMode && (
                            <Checkbox checked={selectedRow} onChange={() => toggleSelected(asset.id)} aria-label={`Chọn ${asset.originalFilename}`} containerClassName="w-auto" />
                          )}
                        </td>
                        <td className="min-w-0 overflow-hidden px-2 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <CloudAssetThumbnail asset={asset} conversationId={cloudConversationId} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-text-primary" title={asset.originalFilename}>{asset.originalFilename}</span>
                              <span className="mt-0.5 block truncate text-xs text-text-muted">{getAssetTypeLabel(asset)}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-2 align-middle text-[13px] tabular-nums text-text-muted">{formatFileSize(Number(asset.sizeBytes) || 0)}</td>
                        <td className="px-2 align-middle text-[13px] tabular-nums text-text-muted">{formatRelativeDate(new Date(asset.createdAt))}</td>
                        <td className="px-2 align-middle">
                          {!selectMode && (
                            <RowMenu
                              asset={asset}
                              onDownload={() => void downloadAsset(asset)}
                              onForward={() => forwardAsset(asset)}
                              onTrash={() => void trashAsset(asset)}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {filtered.map((asset) => (
                  <div key={asset.id} className={`group relative aspect-square min-w-0 rounded-xl border transition-colors ${selectedIds.has(asset.id) ? "border-brand-solid/45 bg-brand-soft/30" : "border-border/60 hover:bg-surface-hover"}`}>
                    {selectMode && (
                      <span className="absolute left-2 top-2 z-10">
                        <Checkbox checked={selectedIds.has(asset.id)} onChange={() => toggleSelected(asset.id)} aria-label={`Chọn ${asset.originalFilename}`} containerClassName="w-auto" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => (selectMode ? toggleSelected(asset.id) : void downloadAsset(asset))}
                      aria-label={`${selectMode ? "Chọn" : "Tải"} ${asset.originalFilename}`}
                      aria-pressed={selectMode ? selectedIds.has(asset.id) : undefined}
                      className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/30"
                    >
                      <CloudAssetThumbnail asset={asset} conversationId={cloudConversationId} size="grid" />
                      <span className="line-clamp-2 w-full break-words text-center text-xs font-medium text-text-primary">{asset.originalFilename}</span>
                      <span className="text-[11px] tabular-nums text-text-muted">{formatFileSize(Number(asset.sizeBytes) || 0)}</span>
                    </button>
                    {!selectMode && (
                      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <RowMenu
                          asset={asset}
                          onDownload={() => void downloadAsset(asset)}
                          onForward={() => forwardAsset(asset)}
                          onTrash={() => void trashAsset(asset)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SettingsPageShell>
      <ConfirmDialog
        isOpen={confirmTrash}
        onClose={() => setConfirmTrash(false)}
        onConfirm={() => void trashSelected()}
        title="Xóa các mục đã chọn"
        message={`${selected.length} mục sẽ được chuyển vào thùng rác.`}
        confirmText="Xóa"
        variant="danger"
        isLoading={busy}
      />
      {forwardMessage && currentUserId ? (
        <ForwardModal
          messages={[forwardMessage]}
          currentUserId={currentUserId}
          onClose={() => setForwardMessage(null)}
        />
      ) : null}
    </AppPage>
  );
};

/** Route entry cho /cloud/manage — tự tải quota + assets, CloudManageView chỉ nhận props. */
export const CloudManagePage: React.FC = () => {
  const [quota, setQuota] = useState<CloudQuota | null>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [space, list] = await Promise.all([
        cloudApi.ensure(),
        cloudApi.list({ includeTrashed: false, limit: 200 }),
      ]);
      setConversationId(space.conversationId);
      setQuota(space.quota);
      setAssets(list.items);
      setLoadError(null);
    } catch {
      setLoadError("Không thể tải dữ liệu Hacom Cloud.");
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void refresh();
  }, [refresh]);

  // Initial async fetch; state changes occur only after the network promise settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const sync = () => { void refresh(); };
    wsManager.on("cloud:asset:created", sync);
    wsManager.on("cloud:asset:trashed", sync);
    wsManager.on("cloud:asset:restored", sync);
    wsManager.on("cloud:quota:changed", sync);
    return () => {
      wsManager.off("cloud:asset:created", sync);
      wsManager.off("cloud:asset:trashed", sync);
      wsManager.off("cloud:asset:restored", sync);
      wsManager.off("cloud:quota:changed", sync);
    };
  }, [refresh]);

  return (
    <CloudManageView
      quota={quota}
      assets={assets}
      onChanged={refresh}
      loading={loading}
      error={loadError}
      onRetry={retry}
      conversationId={conversationId}
    />
  );
};

export default CloudManagePage;
