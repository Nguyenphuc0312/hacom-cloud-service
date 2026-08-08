import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClickOutside } from "../../../hooks";
import {
  ArrowDownUp,
  Check,
  Download,
  File,
  FileImage,
  Grid3x2,
  List,
  Mic,
  MoreHorizontal,
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
import { PageSpinner } from "../../../components/ui/Spinner";

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
        className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-text-secondary hover:bg-surface-hover"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowDownUp className="h-4 w-4" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg" role="menu">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              onClick={() => { onChange(option.key); setOpen(false); }}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-surface-hover"
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

const RowMenu: React.FC<{ asset: CloudAsset; onDownload: () => void; onTrash: () => void }> = ({ asset, onDownload, onTrash }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setOpen(false), { active: open, escape: true });

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary"
        aria-label={`Thao tác với ${asset.originalFilename}`}
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg" role="menu">
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => { onDownload(); setOpen(false); }}>
            <Download className="h-4 w-4" />Lưu về máy
          </button>
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-surface-hover" onClick={() => { onTrash(); setOpen(false); }}>
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
}> = ({ quota, assets, onChanged }) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const downloadSelected = async () => {
    for (const asset of selected) {
      // ponytail: tải tuần tự — trình duyệt tự chặn nhiều download "cùng lúc" từ script,
      // song song không nhanh hơn mà dễ bị chặn popup.
      // eslint-disable-next-line no-await-in-loop
      await downloadAsset(asset);
    }
  };

  const viewOriginalMessage = () => {
    const conversationId = readCachedCloudConversationId();
    if (conversationId) navigate(`${ROUTE_PATHS.CHAT}/${conversationId}`);
  };

  const trashSelected = async () => {
    setBusy(true);
    try {
      let failed = 0;
      for (const asset of selected) {
        try {
          // eslint-disable-next-line no-await-in-loop
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
            <CloudStorageCard quota={quota} />
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-background p-4 sm:p-6">
          {/* 4 ô lọc theo loại, giống Zalo My Documents */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MEDIA_TILES.map((tile) => {
              const bytes = tile.quotaKey ? quota?.usedByType?.[tile.quotaKey] : undefined;
              const active = filter === tile.key;
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setFilter(active ? "all" : tile.key)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-brand-solid bg-brand-soft/40" : "border-border hover:bg-surface-hover"
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-brand-solid text-white" : "bg-surface-hover text-text-muted"}`}>
                    {tile.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text-primary">{tile.label}</span>
                    {bytes !== undefined && <span className="block text-xs text-text-muted">{formatFileSize(Number(bytes) || 0)}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Header: mặc định "Chọn" hoặc thanh hành động khi đang chọn */}
          {selectMode ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <span className="text-sm font-medium text-text-primary">
                Đã chọn {selected.length} mục ({formatFileSize(selectedBytes)})
              </span>
              <div className="flex items-center gap-4">
                <button type="button" disabled={!selected.length} onClick={() => void downloadSelected()} className="text-sm font-medium text-brand-solid hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Lưu về máy
                </button>
                <button type="button" disabled={!selected.length} onClick={viewOriginalMessage} className="text-sm font-medium text-brand-solid hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Xem tin nhắn gốc
                </button>
                <button type="button" disabled={!selected.length} onClick={() => setConfirmTrash(true)} className="text-sm font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                  Xóa
                </button>
                <button type="button" onClick={exitSelectMode} className="text-sm font-medium text-text-muted hover:underline">
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text-primary">Tất cả dữ liệu Hacom Cloud</h2>
              <div className="flex flex-1 items-center justify-end gap-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tệp" aria-label="Tìm tệp trong Hacom Cloud" className="max-w-[220px]" />
                <SortDropdown value={sort} onChange={setSort} />
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                    <button type="button" onClick={() => setView("list")} aria-label="Xem dạng danh sách" className={`flex h-7 w-7 items-center justify-center rounded-md ${view === "list" ? "bg-brand-soft text-brand-solid" : "text-text-muted hover:bg-surface-hover"}`}>
                      <List className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setView("grid")} aria-label="Xem dạng lưới" className={`flex h-7 w-7 items-center justify-center rounded-md ${view === "grid" ? "bg-brand-soft text-brand-solid" : "text-text-muted hover:bg-surface-hover"}`}>
                      <Grid3x2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectMode && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-text-muted">
              <Checkbox
                checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                onChange={() => { setSelectMode(true); toggleSelectAll(); }}
                className="h-4 w-4"
              />
              Chọn
            </label>
          )}

          {/* Bảng / lưới nội dung */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-text-muted">
                <File className="h-8 w-8" />
                <span>{query.trim() ? "Không tìm thấy tệp phù hợp" : "Chưa có dữ liệu"}</span>
              </div>
            ) : view === "list" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">Tên</th>
                    <th className="w-28 px-2 py-2 font-medium">Kích thước</th>
                    <th className="w-32 px-2 py-2 font-medium">Ngày gửi</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset) => (
                    <tr key={asset.id} className="group border-b border-border/60 hover:bg-surface-hover">
                      <td className="px-2 py-2">
                        {selectMode && (
                          <Checkbox checked={selectedIds.has(asset.id)} onChange={() => toggleSelected(asset.id)} aria-label={`Chọn ${asset.originalFilename}`} className="h-4 w-4" />
                        )}
                      </td>
                      <td className="min-w-0 px-2 py-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <FileTypeIcon type={getFileIconType(asset.mimeType, asset.originalFilename)} className="h-6 w-6 shrink-0" />
                          <span className="truncate" title={asset.originalFilename}>{asset.originalFilename}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-text-muted">{formatFileSize(Number(asset.sizeBytes) || 0)}</td>
                      <td className="px-2 py-2 text-text-muted">{formatRelativeDate(new Date(asset.createdAt))}</td>
                      <td className="px-2 py-2">
                        {!selectMode && <RowMenu asset={asset} onDownload={() => void downloadAsset(asset)} onTrash={() => void trashAsset(asset)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {filtered.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => (selectMode ? toggleSelected(asset.id) : void downloadAsset(asset))}
                    className="group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border/60 p-2 hover:bg-surface-hover"
                  >
                    {selectMode && (
                      <span className="absolute left-2 top-2">
                        <Checkbox checked={selectedIds.has(asset.id)} onChange={() => toggleSelected(asset.id)} aria-label={`Chọn ${asset.originalFilename}`} className="h-4 w-4" />
                      </span>
                    )}
                    <FileTypeIcon type={getFileIconType(asset.mimeType, asset.originalFilename)} className="h-8 w-8" />
                    <span className="line-clamp-2 w-full break-words text-center text-xs">{asset.originalFilename}</span>
                    <span className="text-[11px] text-text-muted">{formatFileSize(Number(asset.sizeBytes) || 0)}</span>
                  </button>
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
    </AppPage>
  );
};

/** Route entry cho /cloud/manage — tự tải quota + assets, CloudManageView chỉ nhận props. */
export const CloudManagePage: React.FC = () => {
  const [quota, setQuota] = useState<CloudQuota | null>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [space, list] = await Promise.all([
        cloudApi.ensure(),
        cloudApi.list({ includeTrashed: false, limit: 200 }),
      ]);
      setQuota(space.quota);
      setAssets(list.items);
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) return <PageSpinner />;
  return <CloudManageView quota={quota} assets={assets} onChanged={refresh} />;
};

export default CloudManagePage;
