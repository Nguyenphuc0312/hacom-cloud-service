import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowUturnRightIcon, CloudArrowUpIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline';
import { cloudApi, type CloudAsset } from '../api/cloudApi';
import wsManager from '../../../lib/socket';

const formatBytes = (value: string): string => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

type AssetType = '' | 'image' | 'video' | 'audio' | 'file';

type Preview = { asset: CloudAsset; url: string } | null;

const uploadToSignedUrl = (input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  file: File;
  onProgress: (percent: number) => void;
}): Promise<void> => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open(input.method || 'PUT', input.url);
  Object.entries(input.headers ?? {}).forEach(([key, value]) => request.setRequestHeader(key, value));
  request.upload.onprogress = (event) => {
    if (event.lengthComputable) input.onProgress(Math.round(event.loaded / event.total * 100));
  };
  request.onerror = () => reject(new Error('upload failed'));
  request.onload = () => request.status >= 200 && request.status < 300
    ? resolve()
    : reject(new Error(`upload failed with ${request.status}`));
  request.send(input.file);
});

const CloudPage: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [query, setQuery] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('');
  const [note, setNote] = useState('');
  const [quota, setQuota] = useState<{ limitBytes: string; usedBytes: string; reservedBytes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    try {
      setError(null);
      const [space, result] = await Promise.all([cloudApi.ensure(), cloudApi.list({ cursor, q: query || undefined, type: assetType || undefined })]);
      setQuota(space.quota);
      setAssets((current) => append ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
    } catch {
      setError('Không thể tải Cloud. Vui lòng thử lại.');
    }
  }, [assetType, query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    wsManager.on('cloud:asset:created', refresh);
    wsManager.on('cloud:asset:trashed', refresh);
    wsManager.on('cloud:quota:changed', refresh);
    return () => {
      wsManager.off?.('cloud:asset:created', refresh);
      wsManager.off?.('cloud:asset:trashed', refresh);
      wsManager.off?.('cloud:quota:changed', refresh);
    };
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true); setError(null); setUploadProgress(0);
    try {
      const reservation = await cloudApi.reserveUpload(file);
      await uploadToSignedUrl({
        url: reservation.uploadUrl,
        method: reservation.uploadMethod,
        headers: reservation.uploadHeaders,
        file,
        onProgress: setUploadProgress,
      });
      await cloudApi.completeUpload(reservation.uploadId);
      await load();
    } catch {
      setError('Tải tệp lên thất bại. Quota hoặc định dạng tệp có thể không hợp lệ.');
    } finally { setBusy(false); setUploadProgress(null); }
  };

  const createNote = async () => {
    if (!note.trim()) return;
    setBusy(true); setError(null);
    try { await cloudApi.note(note); setNote(''); await load(); }
    catch { setError('Không thể lưu ghi chú.'); }
    finally { setBusy(false); }
  };

  const download = async (asset: CloudAsset) => {
    try { window.open((await cloudApi.download(asset.id)).url, '_blank', 'noopener,noreferrer'); }
    catch { setError('Không thể tạo liên kết tải xuống.'); }
  };

  const openPreview = async (asset: CloudAsset) => {
    try {
      const { url } = await cloudApi.download(asset.id);
      setPreview({ asset, url });
    } catch {
      setError('Không thể tải bản xem trước.');
    }
  };

  const remove = async (asset: CloudAsset) => {
    try { await cloudApi.trash(asset.id); await load(); }
    catch { setError('Không thể chuyển tệp vào thùng rác.'); }
  };

  const forward = async (asset: CloudAsset) => {
    const targetConversationId = window.prompt('Nhập mã cuộc trò chuyện nhận tệp');
    if (!targetConversationId?.trim()) return;
    try { await cloudApi.forward(asset.id, targetConversationId.trim()); }
    catch { setError('Không thể chuyển tiếp tệp. Hãy kiểm tra quyền gửi trong cuộc trò chuyện đích.'); }
  };

  const used = quota ? Number(quota.usedBytes) + Number(quota.reservedBytes) : 0;
  const percent = quota && Number(quota.limitBytes) > 0 ? Math.min(100, used / Number(quota.limitBytes) * 100) : 0;

  const previewContent = preview && (preview.asset.mediaType === 'image'
    ? <img src={preview.url} alt={preview.asset.originalFilename} className="max-h-[70vh] max-w-full object-contain" />
    : preview.asset.mediaType === 'video'
      ? <video src={preview.url} controls className="max-h-[70vh] max-w-full" />
      : preview.asset.mediaType === 'audio'
        ? <audio src={preview.url} controls className="w-full" />
        : null);

  return <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Cloud của tôi</h1><p className="mt-1 text-sm text-slate-500">Ghi chú và tệp riêng tư, đồng bộ giữa các thiết bị.</p></div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><CloudArrowUpIcon className="h-5 w-5" />Tải tệp lên</button>
      <input ref={inputRef} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} />
    </div>
    {quota && <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex justify-between text-sm"><span>Đã dùng {formatBytes(String(used))}</span><span>{formatBytes(quota.limitBytes)}</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-700"><div className="h-full bg-indigo-600" style={{ width: `${percent}%` }} /></div>{uploadProgress !== null && <p className="mt-2 text-xs text-slate-500">Đang tải tệp: {uploadProgress}%</p>}</section>}
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Viết ghi chú cho chính bạn" className="min-h-24 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:bg-slate-950" /><div className="mt-3 flex justify-end"><button type="button" disabled={busy || !note.trim()} onClick={() => void createNote()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">Lưu ghi chú</button></div></section>
    <div className="mb-4 flex flex-wrap gap-2"><div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên tệp" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div><select aria-label="Lọc loại tệp" value={assetType} onChange={(event) => setAssetType(event.target.value as AssetType)} className="rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Tất cả loại</option><option value="image">Hình ảnh</option><option value="video">Video</option><option value="audio">Âm thanh</option><option value="file">Tài liệu</option></select></div>
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><ul className="divide-y divide-slate-100 dark:divide-slate-800">{assets.map((asset) => <li key={asset.id} className="flex items-center gap-3 p-4"><button type="button" onClick={() => void openPreview(asset)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium">{asset.originalFilename}</p><p className="mt-1 text-xs text-slate-500">{asset.mediaType} · {formatBytes(asset.sizeBytes)}</p></button><button type="button" onClick={() => void download(asset)} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label={`Tải ${asset.originalFilename}`}><ArrowDownTrayIcon className="h-5 w-5" /></button><button type="button" onClick={() => void forward(asset)} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label={`Chuyển tiếp ${asset.originalFilename}`}><ArrowUturnRightIcon className="h-5 w-5" /></button><button type="button" onClick={() => void remove(asset)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Xóa ${asset.originalFilename}`}><TrashIcon className="h-5 w-5" /></button></li>)}</ul>{assets.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Chưa có tệp nào trong Cloud.</p>}{nextCursor && <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800"><button type="button" disabled={busy} onClick={() => void load(nextCursor, true)} className="rounded-lg px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-60">Tải thêm</button></div>}</section>
    {preview && <div role="dialog" aria-label="Xem trước tệp" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setPreview(null)}><div className="max-w-4xl rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between gap-4"><p className="truncate text-sm font-medium">{preview.asset.originalFilename}</p><button type="button" onClick={() => setPreview(null)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">Đóng</button></div>{previewContent ?? <p className="text-sm text-slate-600 dark:text-slate-300">Không có bản xem trước cho loại tệp này. Hãy dùng nút tải xuống.</p>}</div></div>}
  </main>;
};

export default CloudPage;
