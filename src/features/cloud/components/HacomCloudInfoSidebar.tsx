import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, FileImage, FileText, FolderOpen, Forward, Link as LinkIcon, Play, Trash2, Video, X } from "lucide-react";
import type { CloudAsset, CloudQuota } from "../api/cloudApi";
import { extractCloudLinks, type CloudLink } from "../extractCloudLinks";
import { cloudApi } from "../api/cloudApi";
import { usePreviewUrl } from "../../../hooks/usePreviewUrl";
import { PersonalCloudAvatar } from "./PersonalCloudAvatar";

const formatBytes = (value: string | number) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let sized = bytes;
  while (sized >= 1024 && index < units.length - 1) { sized /= 1024; index += 1; }
  return `${sized >= 10 || index === 0 ? Math.round(sized) : sized.toFixed(1)} ${units[index]}`;
};
const formatWhen = (value: string | Date) => {
  const date = new Date(value);
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  return Number.isNaN(hours) ? "" : hours < 1 ? "Vừa xong" : hours < 24 ? `${hours} giờ trước` : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};
const fileIcon = (asset: CloudAsset) => asset.mediaType === "image" ? <FileImage className="h-5 w-5 text-sky-600" /> : asset.mediaType === "video" ? <Video className="h-5 w-5 text-violet-600" /> : asset.mimeType.includes("pdf") ? <FileText className="h-5 w-5 text-red-600" /> : <File className="h-5 w-5 text-text-muted" />;

/**
 * Thanh dung lượng nhiều khúc theo loại nội dung (kiểu Zalo). Mỗi khúc dùng màu
 * riêng và luôn kèm nhãn chữ ở chú thích bên dưới — không dựa vào mỗi màu để
 * truyền đạt thông tin.
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
  usedByType?: { image: string; video: string; file: string; other: string };
}> = ({ usedBytes, limitBytes, usedByType }) => {
  const used = Number(usedBytes);
  const limit = Number(limitBytes);
  const percent = limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0;

  // Phần đã dùng nhưng không rơi vào loại nào (BE cũ chưa trả usedByType) vẫn phải
  // hiện ra, nếu không thanh sẽ ngắn hơn con số "đã dùng" ngay bên trên.
  const typed = usedByType
    ? USAGE_SEGMENTS.map((segment) => ({ ...segment, bytes: Number(usedByType[segment.key]) || 0 }))
    : [];
  const typedTotal = typed.reduce((sum, segment) => sum + segment.bytes, 0);
  const segments = usedByType
    ? typed.map((segment) =>
        segment.key === "other"
          ? { ...segment, bytes: segment.bytes + Math.max(0, used - typedTotal) }
          : segment,
      )
    : [{ key: "other" as const, label: "Đã dùng", className: "bg-brand-solid", bytes: used }];

  const shown = segments.filter((segment) => segment.bytes > 0);
  const nearFull = percent >= 95;

  return (
    <>
      <div
        className="mt-3 flex h-2 gap-px overflow-hidden rounded-full bg-surface-hover"
        role="progressbar"
        aria-label="Dung lượng đã sử dụng"
        aria-valuemin={0}
        aria-valuemax={limit || 0}
        aria-valuenow={Math.min(used, limit || used)}
        aria-valuetext={`${formatBytes(used)} trên ${formatBytes(limit)} đã dùng`}
      >
        {shown.map((segment) => (
          <div
            key={segment.key}
            className={nearFull ? "bg-danger" : segment.className}
            // Khúc rất nhỏ vẫn phải thấy được, nên có bề rộng tối thiểu.
            style={{ width: `${Math.max(1.5, limit > 0 ? (segment.bytes / limit) * 100 : 0)}%` }}
          />
        ))}
      </div>

      {shown.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {shown.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`} aria-hidden="true" />
              <span>{segment.label}</span>
              <span className="text-text-primary">{formatBytes(segment.bytes)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-between gap-2 text-xs text-text-muted">
        <span>Còn lại {formatBytes(Math.max(0, limit - used))}</span>
        <span>{percent > 0 && percent < 0.1 ? "<0,1%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`}</span>
      </div>
    </>
  );
};
export const CloudStorageCard: React.FC<{ quota: CloudQuota | null; onManage: () => void }> = ({ quota, onManage }) => {
  if (!quota) return <div className="rounded-xl border border-border/70 p-4 text-sm text-text-muted">Đang tải dung lượng lưu trữ…</div>;
  const used = String(Number(quota.usedBytes) + Number(quota.reservedBytes));
  return <section className="rounded-xl border border-border/70 bg-surface p-4 shadow-sm"><h3 className="text-sm font-semibold">Dung lượng lưu trữ</h3><p className="mt-1 text-sm">{formatBytes(used)} <span className="text-text-muted">/ {formatBytes(quota.limitBytes)}</span></p><StorageUsageBar usedBytes={used} limitBytes={quota.limitBytes} usedByType={quota.usedByType} /><button type="button" onClick={onManage} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-solid hover:underline"><FolderOpen className="h-4 w-4" />Xem và quản lý Hacom Cloud</button></section>;
};
export const SidebarSection: React.FC<{ title: string; count?: number; children: React.ReactNode }> = ({ title, count, children }) => {
  const key = `hacom-cloud-sidebar:${title}`; const [open, setOpen] = useState(() => sessionStorage.getItem(key) !== "closed");
  const toggle = () => setOpen((current) => { sessionStorage.setItem(key, current ? "closed" : "open"); return !current; });
  return <section className="border-t border-border/70 pt-4"><button type="button" className="flex w-full items-center justify-between text-left" onClick={toggle} aria-expanded={open}><span className="text-sm font-semibold">{title}{typeof count === "number" && <span className="ml-1 text-text-muted">({count})</span>}</span>{open ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}</button>{open && <div className="mt-3">{children}</div>}</section>;
};
export const CloudEmptyState: React.FC<{ text: string }> = ({ text }) => <p className="rounded-lg bg-surface-hover px-3 py-4 text-center text-sm text-text-muted">{text}</p>;
export const CloudSidebarSkeleton: React.FC = () => <div className="space-y-4 p-4" aria-label="Đang tải thông tin Hacom Cloud"><div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-surface-hover" />{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-surface-hover" />)}</div>;
const CloudMediaTile: React.FC<{ asset: CloudAsset; conversationId: string; onOpen: (asset: CloudAsset) => void }> = ({ asset, conversationId, onOpen }) => { const { url } = usePreviewUrl(conversationId, asset.attachmentId ?? "", { autoFetch: Boolean(asset.attachmentId) }); return <button type="button" onClick={() => onOpen(asset)} className="relative aspect-square overflow-hidden rounded-lg bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-solid" aria-label={`Mở ${asset.originalFilename}`}>{url && asset.mediaType === "image" ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center">{asset.mediaType === "video" ? <Video className="h-6 w-6 text-text-muted" /> : <FileImage className="h-6 w-6 text-text-muted" />}</span>}{asset.mediaType === "video" && <span className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="h-6 w-6 fill-white text-white" /></span>}</button>; };
export const RecentMediaGrid: React.FC<{ assets: CloudAsset[]; conversationId: string; onOpen: (asset: CloudAsset) => void }> = ({ assets, conversationId, onOpen }) => !assets.length ? <CloudEmptyState text="Chưa có ảnh hoặc video gần đây" /> : <div className="grid grid-cols-3 gap-2">{assets.slice(0, 6).map((asset) => <CloudMediaTile key={asset.id} asset={asset} conversationId={conversationId} onOpen={onOpen} />)}</div>;
export const CloudFileRow: React.FC<{ asset: CloudAsset; onPreview: (asset: CloudAsset) => void; onForward?: (asset: CloudAsset) => void; onTrash: (asset: CloudAsset) => void }> = ({ asset, onPreview, onForward, onTrash }) => <li className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-hover"><button type="button" onClick={() => onPreview(asset)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="shrink-0">{fileIcon(asset)}</span><span className="min-w-0"><span title={asset.originalFilename} className="block truncate text-sm">{asset.originalFilename}</span><span className="block text-xs text-text-muted">{formatBytes(asset.sizeBytes)} · {formatWhen(asset.createdAt)}</span></span></button><span className="flex shrink-0">{asset.messageId && onForward && <button type="button" aria-label={`Chuyển tiếp ${asset.originalFilename}`} onClick={() => onForward(asset)} className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"><Forward className="h-4 w-4" /></button>}<button type="button" aria-label={`Chuyển ${asset.originalFilename} vào thùng rác`} onClick={() => onTrash(asset)} className="rounded p-1.5 text-text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button></span></li>;
export const RecentFileList: React.FC<{ assets: CloudAsset[]; onPreview: (asset: CloudAsset) => void; onForward?: (asset: CloudAsset) => void; onTrash: (asset: CloudAsset) => void; onManage: () => void }> = ({ assets, onPreview, onForward, onTrash, onManage }) => !assets.length ? <CloudEmptyState text="Chưa có tệp nào trong Hacom Cloud" /> : <><ul className="divide-y divide-border/50">{assets.slice(0, 5).map((asset) => <CloudFileRow key={asset.id} asset={asset} onPreview={onPreview} onForward={onForward} onTrash={onTrash} />)}</ul><button type="button" className="mt-3 text-sm font-medium text-brand-solid hover:underline" onClick={onManage}>Xem tất cả tệp</button></>;
export const CloudLinkList: React.FC<{ links: CloudLink[] }> = ({ links }) =>
  !links.length ? (
    <CloudEmptyState text="Chưa có liên kết nào trong Hacom Cloud" />
  ) : (
    <ul className="space-y-1">
      {links.slice(0, 5).map((link) => (
        <li key={`${link.messageId}:${link.url}`}>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-hover"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-hover">
              <LinkIcon className="h-4 w-4 text-text-muted" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm">{link.url}</span>
              <span className="block truncate text-xs text-text-muted">
                {link.host}
                {link.createdAt ? ` · ${formatWhen(link.createdAt)}` : ""}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );

export const CloudIdentity: React.FC = () => <div className="px-4 pb-5 pt-6 text-center"><PersonalCloudAvatar size="lg" className="mx-auto" /><h2 className="mt-3 text-base font-semibold">Cloud của tôi</h2><p className="mx-auto mt-1 max-w-[18rem] text-sm leading-5 text-text-muted">Lưu trữ và truy cập nhanh các nội dung quan trọng của bạn</p></div>;
const CloudManagerDialog: React.FC<{ assets: CloudAsset[]; onClose: () => void; onPreview: (asset: CloudAsset) => void; onForward?: (asset: CloudAsset) => void; onTrash: (asset: CloudAsset) => void }> = ({ assets, onClose, onPreview, onForward, onTrash }) => { const [query, setQuery] = useState(""); useEffect(() => { const key = (event: KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]); const filtered = assets.filter((asset) => asset.originalFilename.toLowerCase().includes(query.toLowerCase())); return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Quản lý Hacom Cloud"><div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl bg-surface shadow-xl"><header className="flex items-center justify-between border-b border-border/70 p-4"><h2 className="font-semibold">Quản lý Hacom Cloud</h2><button type="button" onClick={onClose} className="rounded p-1 hover:bg-surface-hover" aria-label="Đóng"><X className="h-5 w-5" /></button></header><div className="p-4"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tệp" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-solid" /></div><ul className="min-h-0 overflow-y-auto px-4 pb-4">{filtered.length ? filtered.map((asset) => <CloudFileRow key={asset.id} asset={asset} onPreview={onPreview} onForward={onForward} onTrash={onTrash} />) : <CloudEmptyState text="Không tìm thấy tệp phù hợp" />}</ul></div></div>; };
export const HacomCloudInfoSidebar: React.FC<{ open: boolean; onClose: () => void; quota: CloudQuota | null; assets: CloudAsset[]; conversationId: string; loading?: boolean; onChanged: () => Promise<void> | void; onPreview: (asset: CloudAsset) => void; onForward?: (asset: CloudAsset) => void; messages?: { id: string; content?: string | null; createdAt?: string | Date }[] }> = ({ open, onClose, quota, assets, conversationId, loading = false, onChanged, onPreview, onForward, messages }) => { const [managerOpen, setManagerOpen] = useState(false); const available = useMemo(() => assets.filter((asset) => asset.status === "available"), [assets]); const media = useMemo(() => available.filter((asset) => asset.mediaType === "image" || asset.mediaType === "video").slice(0, 6), [available]); const links = useMemo(() => extractCloudLinks(messages ?? []), [messages]); const trash = async (asset: CloudAsset) => { await cloudApi.trash(asset.id); await onChanged(); }; return <><aside className={`${open ? "translate-x-0 lg:w-[var(--app-inspector-width)] lg:border-l" : "translate-x-full lg:w-0 lg:border-l-0"} fixed inset-y-0 right-0 z-40 flex w-[min(100vw,400px)] overflow-hidden border-l border-border/70 bg-surface shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:shrink-0 lg:shadow-none lg:transition-[width]`} aria-hidden={!open} inert={!open || undefined}><div className="flex h-full w-full flex-col lg:w-[var(--app-inspector-width)]"><header className="shrink-0 border-b border-border/70 px-4"><div className="flex min-h-[var(--app-header-height)] items-center justify-between"><strong>Thông tin Hacom Cloud</strong><button type="button" className="rounded p-1 hover:bg-surface-hover" onClick={onClose} aria-label="Đóng thông tin Hacom Cloud"><X className="h-5 w-5" /></button></div></header>{loading ? <CloudSidebarSkeleton /> : <div className="min-h-0 flex-1 overflow-y-auto"><CloudIdentity /><div className="space-y-4 px-4 pb-6"><CloudStorageCard quota={quota} onManage={() => setManagerOpen(true)} /><SidebarSection title="Ảnh và video gần đây" count={media.length}><RecentMediaGrid assets={media} conversationId={conversationId} onOpen={onPreview} /></SidebarSection><SidebarSection title="Tệp gần đây" count={available.length}><RecentFileList assets={available} onPreview={onPreview} onForward={onForward} onTrash={trash} onManage={() => setManagerOpen(true)} /></SidebarSection><SidebarSection title="Link" count={links.length}><CloudLinkList links={links} /></SidebarSection></div></div>}</div></aside>{managerOpen && <CloudManagerDialog assets={available} onClose={() => setManagerOpen(false)} onPreview={onPreview} onForward={onForward} onTrash={trash} />}</>; };
