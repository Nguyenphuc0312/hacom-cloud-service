import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClickOutside } from "../../../hooks";
import {
  Check,
  Download,
  File,
  FileImage,
  FolderOpen,
  Forward,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { CloudAsset, CloudQuota } from "../api/cloudApi";
import { cloudApi } from "../api/cloudApi";
import { usePreviewUrl } from "../../../hooks/usePreviewUrl";
import { toast } from "../../../components/ui";
import { extractApiError } from "../../../lib/apiContract";
import { PersonalCloudAvatar } from "./PersonalCloudAvatar";
import { CloudSharedResources } from "./CloudSharedResources";
import { CollapsibleSection } from "../../../components/info/CollapsibleSection";
import { FileTypeIcon } from "../../../components/message/FileTypeIcon";
import { ConfirmDialog } from "../../../components/ui";
import { formatFileSize, getFileIconType } from "../../../utils/formatFileSize";
import { formatRelativeTime } from "../../../utils/formatTime";
import { truncateFilenameEnd } from "../../../utils/truncateFilename";
import { ROUTE_PATHS } from "../../../router/paths";

/** API trả dung lượng dạng chuỗi (bigint) nên phải ép số trước khi đưa vào
 *  formatFileSize dùng chung; giá trị hỏng thì hiện "—" thay vì "0 B". */
const formatBytes = (value: string | number) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  return formatFileSize(bytes);
};

const formatWhen = (value: string) => formatRelativeTime(new Date(value));

const isDocumentLikePreview = (asset: CloudAsset) =>
  /drawio|diagram|screenshot|document|pdf/i.test(asset.originalFilename) || asset.mimeType.includes("pdf");

const fileIcon = (asset: CloudAsset) => (
  <FileTypeIcon
    type={getFileIconType(asset.mimeType, asset.originalFilename)}
    fileName={asset.originalFilename}
    variant="outline"
    className="h-5 w-5"
  />
);

const CloudEmptyState: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg bg-surface-hover/60 px-4 py-5 text-center text-sm text-text-muted">
    {icon}
    <span>{text}</span>
  </div>
);

/**
 * Thanh dung lượng nhiều khúc theo loại nội dung (kiểu Zalo). Mỗi khúc có màu riêng
 * và luôn kèm nhãn chữ ở chú thích — không dựa vào mỗi màu để truyền đạt thông tin.
 */
const USAGE_SEGMENTS = [
  { key: "image", label: "Ảnh", className: "bg-[#F26D21]" },
  { key: "video", label: "Video", className: "bg-[#1E9E52]" },
  { key: "file", label: "File", className: "bg-[#F2C230]" },
  { key: "other", label: "Khác", className: "bg-[#1565C0]" },
] as const;

export const StorageUsageBar: React.FC<{
  usedBytes: string;
  limitBytes: string;
  availableBytes?: string;
  usedByType?: { image: string; video: string; file: string; other: string };
}> = ({ usedBytes, limitBytes, availableBytes, usedByType }) => {
  const used = Number(usedBytes);
  const limit = Number(limitBytes);
  const percent = limit > 0 ? Math.max(0, Math.min(100, used / limit * 100)) : 0;
  const visualPercent = percent > 0 ? Math.max(3, percent) : 0;
  const color = percent >= 95 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-brand-solid";
  const displayPercent = percent > 0 && percent < 0.1 ? "< 0,1%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;

  // Phần đã dùng nhưng không rơi vào loại nào (API cũ chưa trả usedByType) vẫn phải
  // hiện, nếu không thanh sẽ ngắn hơn con số "đã dùng" ngay bên trên.
  const typed = usedByType
    ? USAGE_SEGMENTS.map((segment) => ({ ...segment, bytes: Number(usedByType[segment.key]) || 0 }))
    : [];
  const typedTotal = typed.reduce((sum, segment) => sum + segment.bytes, 0);
  const segments = (usedByType
    ? typed.map((segment) =>
        segment.key === "other"
          ? { ...segment, bytes: segment.bytes + Math.max(0, used - typedTotal) }
          : segment,
      )
    : []
  ).filter((segment) => segment.bytes > 0);
  const nearFull = percent >= 95;

  return (
    <div className="mt-3">
      <div
        className={`flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-hover`}
        role="progressbar"
        aria-label="Dung lượng đã sử dụng"
        aria-valuemin={0}
        aria-valuemax={limit || 0}
        aria-valuenow={Math.min(used, limit || used)}
        aria-valuetext={`${formatBytes(used)} trên ${formatBytes(limit)} đã dùng, ${displayPercent}`}
      >
        {segments.length > 1 ? (
          segments.map((segment) => (
            <div
              key={segment.key}
              className={nearFull ? "bg-danger" : segment.className}
              // Khúc rất nhỏ vẫn phải thấy được nên có bề rộng tối thiểu.
              style={{ width: `${Math.max(1.5, limit > 0 ? (segment.bytes / limit) * 100 : 0)}%` }}
            />
          ))
        ) : (
          <div className={`h-full rounded-full ${color}`} style={{ width: `${visualPercent}%` }} />
        )}
      </div>
      {segments.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`} aria-hidden="true" />
              <span>{segment.label}</span>
              <span className="text-text-primary">{formatBytes(segment.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-muted">Còn trống {formatBytes(availableBytes ?? Math.max(0, limit - used))}</p>
    </div>
  );
};

export const CloudStorageCard: React.FC<{
  quota: CloudQuota | null;
  /** Bỏ trống khi card này đã nằm sẵn trong trang quản lý — không cần nút quay lại chính nó. */
  onManage?: () => void;
  error?: string | null;
  onRetry?: () => void;
}> = ({ quota, onManage, error, onRetry }) => {
  if (!quota) {
    if (error) {
      return (
        <section className="rounded-xl border border-border/70 bg-surface-hover/35 p-4">
          <h3 className="text-sm font-semibold text-text-primary">Dung lượng lưu trữ</h3>
          <p className="mt-2 text-xs text-text-muted">Không thể tải thông tin dung lượng.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 text-sm font-medium text-brand-solid hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid"
            >
              Thử lại
            </button>
          ) : null}
        </section>
      );
    }
    return <div className="h-[174px] animate-pulse rounded-xl border border-border/70 bg-surface-hover/50" aria-label="Đang tải dung lượng lưu trữ" />;
  }

  const used = quota.usedBytes;
  const limit = Number(quota.limitBytes);
  const usedNumber = Number(used);
  const reservedNumber = Number(quota.reservedBytes);
  const percent = limit > 0 ? usedNumber / limit * 100 : 0;

  return (
    <section className="rounded-xl border border-border/70 bg-surface-hover/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Dung lượng lưu trữ</h3>
        <span className="text-xs text-text-muted">{percent > 0 && percent < 0.1 ? "< 0,1%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-text-primary">{formatBytes(used)} <span className="text-sm font-normal text-text-muted">đã dùng</span></p>
      <p className="text-xs text-text-muted">trên tổng dung lượng {formatBytes(quota.limitBytes)}</p>
      <StorageUsageBar usedBytes={used} limitBytes={quota.limitBytes} availableBytes={quota.availableBytes} usedByType={quota.usedByType} />
      {reservedNumber > 0 && <p className="mt-1 text-xs text-text-muted">Đang tải lên: {formatBytes(reservedNumber)} · Còn có thể dùng {formatBytes(quota.availableBytes)}</p>}
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="mt-4 flex h-10 w-full items-center gap-2 rounded-lg border border-brand-solid/25 bg-brand-soft/50 px-3 text-left text-sm font-medium text-brand-solid transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-solid"
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Xem và quản lý Hacom Cloud</span>
          <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
};

const CloudMediaTile: React.FC<{ asset: CloudAsset; conversationId: string; onOpen: (asset: CloudAsset) => void }> = ({ asset, conversationId, onOpen }) => {
  const { url } = usePreviewUrl(conversationId, asset.attachmentId ?? "", { autoFetch: Boolean(asset.attachmentId) });
  const documentLike = isDocumentLikePreview(asset);

  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-[#f5f6f8] p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-solid"
      aria-label={`Mở ${asset.originalFilename}`}
    >
      {url && asset.mediaType === "image" ? (
        <img src={url} alt="" className={`h-full w-full rounded-[5px] ${documentLike ? "object-contain" : "object-cover"}`} />
      ) : (
        <span className="flex h-full items-center justify-center">
          {asset.mediaType === "video" ? <Video className="h-6 w-6 text-text-muted" /> : <FileImage className="h-6 w-6 text-text-muted" />}
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/15">
        {asset.mediaType === "video" && <Play className="h-6 w-6 fill-white text-white" aria-hidden="true" />}
      </span>
    </button>
  );
};

export const RecentMediaGrid: React.FC<{ assets: CloudAsset[]; conversationId: string; onOpen: (asset: CloudAsset) => void }> = ({ assets, conversationId, onOpen }) => {
  if (!assets.length) return <CloudEmptyState icon={<FileImage className="h-6 w-6" />} text="Chưa có ảnh hoặc video" />;
  return <div className="grid grid-cols-3 gap-2">{assets.slice(0, 6).map((asset) => <CloudMediaTile key={asset.id} asset={asset} conversationId={conversationId} onOpen={onOpen} />)}</div>;
};

const CloudSectionError: React.FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => (
  <div className="rounded-lg bg-surface-hover/60 px-3 py-4 text-center text-sm text-text-muted">
    <p>{text}</p>
    <button type="button" className="mt-2 text-sm font-medium text-brand-solid hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid" onClick={onRetry}>Thử lại</button>
  </div>
);

const CloudFileMenu: React.FC<{
  asset: CloudAsset;
  onPreview: () => void;
  onForward?: () => void;
  onTrash: () => void;
}> = ({ asset, onPreview, onForward, onTrash }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setOpen(false), { active: open, escape: true });

  const download = async () => {
    const result = await cloudApi.download(asset.id);
    window.open(result.url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid" onClick={() => setOpen((current) => !current)} aria-label={`Thao tác với ${asset.originalFilename}`} aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg" role="menu">
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => { onPreview(); setOpen(false); }}>Xem trước</button>
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => void download()}><Download className="h-4 w-4" />Tải xuống</button>
          {onForward && <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover" onClick={() => { onForward(); setOpen(false); }}><Forward className="h-4 w-4" />Chuyển tiếp</button>}
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-surface-hover" onClick={() => { onTrash(); setOpen(false); }}><Trash2 className="h-4 w-4" />Xóa</button>
        </div>
      )}
    </div>
  );
};

export const CloudFileRow: React.FC<{
  asset: CloudAsset;
  onPreview: (asset: CloudAsset) => void;
  onForward?: (asset: CloudAsset) => void;
  onTrash: (asset: CloudAsset) => void;
}> = ({ asset, onPreview, onForward, onTrash }) => (
  <li className="group flex min-h-[60px] min-w-0 items-center gap-2 rounded-lg p-2 transition-colors hover:bg-surface-hover">
    <button type="button" onClick={() => onPreview(asset)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-hover">{fileIcon(asset)}</span>
      <span className="min-w-0">
        <span title={asset.originalFilename} className="block truncate text-sm">{truncateFilenameEnd(asset.originalFilename, 34)}</span>
        <span className="block truncate text-xs text-text-muted">{formatBytes(asset.sizeBytes)} · {formatWhen(asset.createdAt)}</span>
      </span>
    </button>
    <CloudFileMenu asset={asset} onPreview={() => onPreview(asset)} onForward={asset.messageId && onForward ? () => onForward(asset) : undefined} onTrash={() => onTrash(asset)} />
  </li>
);

export const RecentFileList: React.FC<{
  assets: CloudAsset[];
  onPreview: (asset: CloudAsset) => void;
  onForward?: (asset: CloudAsset) => void;
  onTrash: (asset: CloudAsset) => void;
  onManage: () => void;
}> = ({ assets, onPreview, onForward, onTrash, onManage }) => {
  if (!assets.length) return <CloudEmptyState icon={<File className="h-6 w-6" />} text="Chưa có tệp nào được lưu" />;
  return (
    <>
      <ul className="space-y-1">{assets.slice(0, 5).map((asset) => <CloudFileRow key={asset.id} asset={asset} onPreview={onPreview} onForward={onForward} onTrash={onTrash} />)}</ul>
      {assets.length > 5 && <button type="button" className="mt-2 px-2 text-sm font-medium text-brand-solid hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid" onClick={onManage}>Xem tất cả tệp</button>}
    </>
  );
};

/** Hero Cloud: ghim hội thoại nằm trong menu `...` ở danh sách hội thoại. */
export const CloudIdentity: React.FC = () => {
  return (
    <div className="flex flex-col items-center bg-surface px-5 pb-5 pt-6 text-center">
      <div className="mb-4">
        <PersonalCloudAvatar size="lg" />
      </div>
      <h2 className="text-base font-bold text-text-primary">Cloud của tôi</h2>
      <p className="mt-1 text-xs text-text-muted">Lưu trữ và truy cập nhanh nội dung quan trọng của bạn</p>
    </div>
  );
};

export const HacomCloudInfoSidebar: React.FC<{
  open: boolean;
  onClose: () => void;
  quota: CloudQuota | null;
  assets: CloudAsset[];
  conversationId: string;
  loading?: boolean;
  error?: string | null;
  onChanged: () => Promise<void> | void;
  onRetry?: () => void;
}> = ({ open, onClose, quota, assets, conversationId, loading = false, error, onChanged, onRetry }) => {
  const navigate = useNavigate();
  // Zalo My Documents: "Chọn" bật chế độ chọn (checkbox mọc trên từng dòng + thanh hành
  // động thay header) chứ không phải checkbox nằm sẵn cạnh "Chọn tất cả" mọi lúc.
  const [trashSelectMode, setTrashSelectMode] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const trashed = useMemo(() => assets.filter((asset) => asset.status === "trashed" || asset.status === "purge_failed"), [assets]);
  const trashedTotalBytes = useMemo(
    () => trashed.reduce((sum, asset) => sum + (Number(asset.sizeBytes) || 0), 0),
    [trashed],
  );

  const restore = async (asset: CloudAsset) => {
    await cloudApi.restore(asset.id);
    await onChanged();
    toast.success("Đã khôi phục " + truncateFilenameEnd(asset.originalFilename, 28));
  };
  const emptyTrash = async () => {
    setEmptyingTrash(true);
    try {
      const result = await cloudApi.emptyTrash();
      await onChanged();
      setTrashSelectMode(false);
      setConfirmEmptyTrash(false);
      if (result.failed > 0) {
        toast.warning(`Đã xóa vĩnh viễn ${result.purged}/${result.claimed} mục, ${result.failed} mục lỗi`);
      } else if (result.purged > 0) {
        toast.success(`Đã xóa vĩnh viễn ${result.purged} mục khỏi thùng rác`);
      } else {
        toast.info("Thùng rác đang trống");
      }
    } catch (error) {
      toast.error(extractApiError(error).message);
    } finally {
      setEmptyingTrash(false);
    }
  };

  return (
    <>
      <aside className="flex h-full w-full min-w-0 overflow-hidden bg-surface" aria-hidden={!open}>
        <div className="flex h-full w-full flex-col">
          <header className="app-page-header sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2.5">
            <h3 className="text-title-sm text-text-primary">Thông tin Hacom Cloud</h3>
            <button type="button" className="icon-button-surface h-9 w-9" onClick={onClose} aria-label="Đóng thông tin Hacom Cloud"><X className="h-5 w-5" /></button>
          </header>
          {loading ? (
            <div className="space-y-4 p-4" aria-label="Đang tải thông tin Hacom Cloud"><div className="h-[72px] animate-pulse rounded-xl bg-surface-hover" /><div className="h-44 animate-pulse rounded-xl bg-surface-hover" /><div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((item) => <div key={item} className="aspect-square animate-pulse rounded-lg bg-surface-hover" />)}</div>{[1, 2, 3].map((item) => <div key={item} className="h-[60px] animate-pulse rounded-lg bg-surface-hover" />)}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6" style={{ scrollbarGutter: "stable" }}>
              <CloudIdentity />
              <div className="space-y-4 px-4 pr-5">
                <CloudStorageCard quota={quota} onManage={() => navigate(ROUTE_PATHS.CLOUD_MANAGE)} />
                {/* Kho lưu trữ dùng ĐÚNG component của panel thông tin nhóm: tab ngang
                    Ảnh/Video · File · Link, có số đếm và "Xem tất cả". Trong đó thao tác
                    chuyển tiếp/tải giống hệt bên ngoài, nên không cần mục "Tệp trong Cloud"
                    riêng nữa (chốt với user 07-08-26). */}
                {conversationId ? (
                  <React.Suspense fallback={<div className="h-44 animate-pulse rounded-xl bg-surface-hover" />}>
                    <CloudSharedResources conversationId={conversationId} />
                  </React.Suspense>
                ) : null}
                <CollapsibleSection
                  title="Thùng rác"
                  icon={<Trash2 className="h-[18px] w-[18px]" />}
                  badge={<span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs text-text-muted">{trashed.length}</span>}
                >
                  <div className="p-2">
                    {error ? (
                      <CloudSectionError text="Không thể tải thùng rác" onRetry={() => onRetry?.()} />
                    ) : trashed.length ? (
                      <>
                        {/* Giống thanh "Chọn"/"Đã chọn N mục" của Zalo My Documents: header
                            đổi hẳn sang chế độ chọn thay vì để checkbox nằm cạnh nút mọi lúc. */}
                        <div className="flex items-center justify-between px-2 pb-2">
                          {trashSelectMode ? (
                            <>
                              <span className="text-xs font-medium text-text-primary">
                                Đã chọn {trashed.length} mục ({formatBytes(trashedTotalBytes)})
                              </span>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setConfirmEmptyTrash(true)}
                                  className="text-xs font-medium text-danger hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid"
                                >
                                  Xóa vĩnh viễn
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTrashSelectMode(false)}
                                  className="text-xs font-medium text-text-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid"
                                >
                                  Hủy
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-text-muted">{trashed.length} mục</span>
                              <button
                                type="button"
                                onClick={() => setTrashSelectMode(true)}
                                className="text-xs font-medium text-brand-solid hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid"
                              >
                                Chọn
                              </button>
                            </>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {trashed.slice(0, 5).map((asset) => (
                            <li key={asset.id} className="flex min-h-[52px] items-center gap-3 rounded-lg p-2 hover:bg-surface-hover">
                              {trashSelectMode && (
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-solid text-white" aria-hidden="true">
                                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                </span>
                              )}
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-hover">{fileIcon(asset)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm" title={asset.originalFilename}>{truncateFilenameEnd(asset.originalFilename, 34)}</span>
                                <span className="text-xs text-text-muted">{formatBytes(asset.sizeBytes)}</span>
                              </span>
                              {!trashSelectMode && (
                                <button type="button" onClick={() => void restore(asset)} className="flex h-8 w-8 items-center justify-center rounded-md text-brand-solid hover:bg-surface" aria-label={`Khôi phục ${asset.originalFilename}`}><RotateCcw className="h-4 w-4" /></button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <CloudEmptyState icon={<Trash2 className="h-6 w-6" />} text="Thùng rác đang trống" />
                    )}
                  </div>
                </CollapsibleSection>
              </div>
            </div>
          )}
        </div>
      </aside>
      <ConfirmDialog
        isOpen={confirmEmptyTrash}
        onClose={() => setConfirmEmptyTrash(false)}
        onConfirm={() => void emptyTrash()}
        title="Dọn thùng rác"
        message={`${trashed.length} mục sẽ bị xóa vĩnh viễn và không thể khôi phục. Bạn có chắc chắn?`}
        confirmText="Xóa vĩnh viễn"
        variant="danger"
        isLoading={emptyingTrash}
      />
    </>
  );
};
