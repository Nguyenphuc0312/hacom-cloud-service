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

const CloudPage: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [quota, setQuota] = useState<{ limitBytes: string; usedBytes: string; reservedBytes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [space, result] = await Promise.all([cloudApi.ensure(), cloudApi.list({ q: query || undefined })]);
      setQuota(space.quota);
      setAssets(result.items);
    } catch {
      setError('Không thể tải Cloud. Vui lòng thử lại.');
    }
  }, [query]);

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
    setBusy(true); setError(null);
    try {
      const reservation = await cloudApi.reserveUpload(file);
      await fetch(reservation.uploadUrl, {
        method: reservation.uploadMethod || 'PUT',
        headers: reservation.uploadHeaders,
        body: file,
      }).then((response) => { if (!response.ok) throw new Error('upload failed'); });
      await cloudApi.completeUpload(reservation.uploadId);
      await load();
    } catch {
      setError('Tải tệp lên thất bại. Quota hoặc định dạng tệp có thể không hợp lệ.');
    } finally { setBusy(false); }
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

  return <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Cloud của tôi</h1><p className="mt-1 text-sm text-slate-500">Ghi chú và tệp riêng tư, đồng bộ giữa các thiết bị.</p></div>
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><CloudArrowUpIcon className="h-5 w-5" />Tải tệp lên</button>
      <input ref={inputRef} className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} />
    </div>
    {quota && <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex justify-between text-sm"><span>Đã dùng {formatBytes(String(used))}</span><span>{formatBytes(quota.limitBytes)}</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-700"><div className="h-full bg-indigo-600" style={{ width: `${percent}%` }} /></div></section>}
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Viết ghi chú cho chính bạn" className="min-h-24 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:bg-slate-950" /><div className="mt-3 flex justify-end"><button type="button" disabled={busy || !note.trim()} onClick={() => void createNote()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">Lưu ghi chú</button></div></section>
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên tệp" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div>
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><ul className="divide-y divide-slate-100 dark:divide-slate-800">{assets.map((asset) => <li key={asset.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{asset.originalFilename}</p><p className="mt-1 text-xs text-slate-500">{asset.mediaType} · {formatBytes(asset.sizeBytes)}</p></div><button type="button" onClick={() => void download(asset)} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label={`Tải ${asset.originalFilename}`}><ArrowDownTrayIcon className="h-5 w-5" /></button><button type="button" onClick={() => void forward(asset)} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label={`Chuyển tiếp ${asset.originalFilename}`}><ArrowUturnRightIcon className="h-5 w-5" /></button><button type="button" onClick={() => void remove(asset)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Xóa ${asset.originalFilename}`}><TrashIcon className="h-5 w-5" /></button></li>)}</ul>{assets.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Chưa có tệp nào trong Cloud.</p>}</section>
  </main>;
};

export default CloudPage;
