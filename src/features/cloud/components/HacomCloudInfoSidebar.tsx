import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  File,
  FileImage,
  FileText,
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
import { PersonalCloudAvatar } from "./PersonalCloudAvatar";

const formatBytes = (value: string | number) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let sized = bytes;
  while (sized >= 1024 && index < units.length - 1) {
    sized /= 1024;
    index += 1;
  }
  return `${sized >= 10 || index === 0 ? Math.round(sized) : sized.toFixed(1)} ${units[index]}`;
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (Number.isNaN(hours)) return "";
  if (hours < 1) return "Vừa xong";
  if (hours < 24) return `${hours} giờ trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

export const truncateFileNamePreservingExtension = (name: string, maxLength = 34) => {
  if (name.length <= maxLength) return name;
  const extensionIndex = name.lastIndexOf(".");
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
  const base = extension ? name.slice(0, extensionIndex) : name;
  const available = Math.max(1, maxLength - extension.length - 3);
  return `${base.slice(0, available)}...${extension}`;
};

const isDocumentLikePreview = (asset: CloudAsset) =>
  /drawio|diagram|screenshot|document|pdf/i.test(asset.originalFilename) || asset.mimeType.includes("pdf");

const fileIcon = (asset: CloudAsset) => {
  if (asset.mediaType === "image") return <FileImage className="h-5 w-5 text-sky-600" />;
  if (asset.mediaType === "video") return <Video className="h-5 w-5 text-violet-600" />;
  if (asset.mimeType.includes("pdf")) return <FileText className="h-5 w-5 text-red-600" />;
  return <File className="h-5 w-5 text-text-muted" />;
};

const CloudEmptyState: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg bg-surface-hover/60 px-4 py-5 text-center text-sm text-text-muted">
    {icon}
    <span>{text}</span>
  </div>
);

export const StorageUsageBar: React.FC<{ usedBytes: string; limitBytes: string; availableBytes?: string }> = ({ usedBytes, limitBytes, availableBytes }) => {
  const used = Number(usedBytes);
  const limit = Number(limitBytes);
  const percent = limit > 0 ? Math.max(0, Math.min(100, used / limit * 100)) : 0;
  const visualPercent = percent > 0 ? Math.max(3, percent) : 0;
  const color = percent >= 95 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-brand-solid";
  const displayPercent = percent > 0 && percent < 0.1 ? "< 0,1%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;

  return (
    <div className="mt-3">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-hover"
        role="progressbar"
        aria-label="Dung lượng đã sử dụng"
        aria-valuemin={0}
        aria-valuemax={limit || 0}
        aria-valuenow={Math.min(used, limit || used)}
        aria-valuetext={`${formatBytes(used)} trên ${formatBytes(limit)} đã dùng, ${displayPercent}`}
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${visualPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-text-muted">Còn trống {formatBytes(availableBytes ?? Math.max(0, limit - used))}</p>
    </div>
  );
};

export const CloudStorageCard: React.FC<{
  quota: CloudQuota | null;
  onManage: () => void;
}> = ({ quota, onManage }) => {
  if (!quota) {
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
      <p className="mt-2 text-base font-semibold">{formatBytes(used)} <span className="text-sm font-normal text-text-muted">đã dùng</span></p>
      <p className="text-xs text-text-muted">trên tổng dung lượng {formatBytes(quota.limitBytes)}</p>
      <StorageUsageBar usedBytes={used} limitBytes={quota.limitBytes} availableBytes={quota.availableBytes} />
      {reservedNumber > 0 && <p className="mt-1 text-xs text-text-muted">Đang tải lên: {formatBytes(reservedNumber)} · Còn có thể dùng {formatBytes(quota.availableBytes)}</p>}
      <button
        type="button"
        onClick={onManage}
        className="mt-4 flex h-10 w-full items-center gap-2 rounded-lg border border-brand-solid/25 bg-brand-soft/50 px-3 text-left text-sm font-medium text-brand-solid transition-colors hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-solid"
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">Xem và quản lý Hacom Cloud</span>
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
};

export const CloudSidebarSection: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => {
  const [open, setOpen] = useState(true);
  const contentId = useId();

  return (
    <section>
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-xs text-text-muted">{count}</span>
        <ChevronDown className={`ml-auto h-[18px] w-[18px] text-text-muted transition-transform duration-200 ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
      </button>
      {open && <div id={contentId} className="mt-2">{children}</div>}
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

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, [open]);

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
        <span title={asset.originalFilename} className="block truncate text-sm">{truncateFileNamePreservingExtension(asset.originalFilename)}</span>
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

export const CloudIdentity: React.FC = () => (
  <div className="flex min-h-[72px] items-center gap-3">
    <PersonalCloudAvatar size="md" className="rounded-xl" />
    <div className="min-w-0">
      <h2 className="text-base font-semibold">Cloud của tôi</h2>
      <p className="mt-0.5 text-[13px] leading-5 text-text-muted">Lưu trữ và truy cập nhanh nội dung quan trọng của bạn</p>
    </div>
  </div>
);

const CloudManagerDialog: React.FC<{
  assets: CloudAsset[];
  onClose: () => void;
  onPreview: (asset: CloudAsset) => void;
  onForward?: (asset: CloudAsset) => void;
  onTrash: (asset: CloudAsset) => void;
}> = ({ assets, onClose, onPreview, onForward, onTrash }) => {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const filtered = assets.filter((asset) => asset.originalFilename.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Quản lý Hacom Cloud">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-border/70 p-4"><h2 className="font-semibold">Quản lý Hacom Cloud</h2><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover" aria-label="Đóng"><X className="h-5 w-5" /></button></header>
        <div className="p-4"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tệp" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-solid" /></div>
        <ul className="min-h-0 overflow-y-auto px-4 pb-4">{filtered.length ? filtered.map((asset) => <CloudFileRow key={asset.id} asset={asset} onPreview={onPreview} onForward={onForward} onTrash={onTrash} />) : <CloudEmptyState icon={<File className="h-6 w-6" />} text="Không tìm thấy tệp phù hợp" />}</ul>
      </div>
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
  onPreview: (asset: CloudAsset) => void;
  onForward?: (asset: CloudAsset) => void;
}> = ({ open, onClose, quota, assets, conversationId, loading = false, error, onChanged, onRetry, onPreview, onForward }) => {
  const [managerOpen, setManagerOpen] = useState(false);
  const available = useMemo(() => assets.filter((asset) => asset.status === "available"), [assets]);
  const trashed = useMemo(() => assets.filter((asset) => asset.status === "trashed" || asset.status === "purge_failed"), [assets]);
  const media = useMemo(() => available.filter((asset) => asset.mediaType === "image" || asset.mediaType === "video"), [available]);
  const trash = async (asset: CloudAsset) => {
    await cloudApi.trash(asset.id);
    await onChanged();
  };
  const restore = async (asset: CloudAsset) => {
    await cloudApi.restore(asset.id);
    await onChanged();
  };

  return (
    <>
      <aside className={`${open ? "translate-x-0 lg:w-[388px] lg:min-w-[360px] lg:max-w-[420px] lg:border-l" : "translate-x-full lg:w-0 lg:min-w-0 lg:border-l-0"} fixed inset-y-0 right-0 z-40 flex w-full overflow-hidden border-l border-border/70 bg-surface shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:shrink-0 lg:shadow-none lg:transition-[width]`} aria-hidden={!open}>
        <div className="flex h-full w-full flex-col">
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-surface px-5">
            <strong className="text-[17px] font-semibold">Thông tin Hacom Cloud</strong>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid" onClick={onClose} aria-label="Đóng thông tin Hacom Cloud"><X className="h-5 w-5" /></button>
          </header>
          {loading ? (
            <div className="space-y-4 p-4" aria-label="Đang tải thông tin Hacom Cloud"><div className="h-[72px] animate-pulse rounded-xl bg-surface-hover" /><div className="h-44 animate-pulse rounded-xl bg-surface-hover" /><div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((item) => <div key={item} className="aspect-square animate-pulse rounded-lg bg-surface-hover" />)}</div>{[1, 2, 3].map((item) => <div key={item} className="h-[60px] animate-pulse rounded-lg bg-surface-hover" />)}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 pr-5 pb-6" style={{ scrollbarGutter: "stable" }}>
              <div className="space-y-4">
                <CloudIdentity />
                <CloudStorageCard quota={quota} onManage={() => setManagerOpen(true)} />
                <CloudSidebarSection title="Ảnh và video" count={media.length}>{error ? <CloudSectionError text="Không thể tải ảnh và video" onRetry={() => onRetry?.()} /> : <RecentMediaGrid assets={media} conversationId={conversationId} onOpen={onPreview} />}</CloudSidebarSection>
                <CloudSidebarSection title="Tệp gần đây" count={available.length}>{error ? <CloudSectionError text="Không thể tải tệp gần đây" onRetry={() => onRetry?.()} /> : <RecentFileList assets={available} onPreview={onPreview} onForward={onForward} onTrash={trash} onManage={() => setManagerOpen(true)} />}</CloudSidebarSection>
                <CloudSidebarSection title="Thùng rác" count={trashed.length}>
                  {trashed.length ? <ul className="space-y-1">{trashed.slice(0, 5).map((asset) => <li key={asset.id} className="flex min-h-[52px] items-center gap-3 rounded-lg p-2 hover:bg-surface-hover"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-hover">{fileIcon(asset)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm" title={asset.originalFilename}>{truncateFileNamePreservingExtension(asset.originalFilename)}</span><span className="text-xs text-text-muted">{formatBytes(asset.sizeBytes)}</span></span><button type="button" onClick={() => void restore(asset)} className="flex h-8 w-8 items-center justify-center rounded-md text-brand-solid hover:bg-surface" aria-label={`Khôi phục ${asset.originalFilename}`}><RotateCcw className="h-4 w-4" /></button></li>)}</ul> : <CloudEmptyState icon={<Trash2 className="h-6 w-6" />} text="Thùng rác đang trống" />}
                </CloudSidebarSection>
              </div>
            </div>
          )}
        </div>
      </aside>
      {managerOpen && <CloudManagerDialog assets={available} onClose={() => setManagerOpen(false)} onPreview={onPreview} onForward={onForward} onTrash={trash} />}
    </>
  );
};
