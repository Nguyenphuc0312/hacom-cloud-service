/**
 * CalendarAttachmentZone — khu vực đính kèm file/ảnh trong form lịch.
 *
 * Hai loại attachment cùng sống trong 1 danh sách:
 *  - LOCAL (vừa chọn): có `file` (File object) + objectURL preview, chưa upload.
 *  - REMOTE (đã upload trước, hiện khi EDIT): có `remoteFileId` + `downloadUrl`,
 *    KHÔNG có `file`. Giữ nguyên khi sửa lịch → không mất file.
 *
 * Parent chịu trách nhiệm upload file local khi submit và ghép fileId (remote + mới)
 * gửi BE (xem uploadCalendarAttachment.ts).
 */

import React from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { FileType } from "@hacom/chat-shared-types/chat";
import { FileTypeIcon } from "../message/FileTypeIcon";
import { getMimePreviewType } from "../../utils/mimeRegistry";
import { getIconTypeFromPreviewType } from "../../utils/filePreviewUtils";
import { truncateFilename } from "../../utils/truncateFilename";
import { FilePreviewModal } from "../modals/FilePreviewModal";
import { useFilePreview, type PreviewTarget } from "../../hooks/useFilePreview";

export interface CalendarLocalAttachment {
  id: string; // `local-…` cho file mới, hoặc = remoteFileId cho file đã upload
  /** File object — chỉ có với attachment LOCAL (chưa upload). */
  file?: File;
  previewUrl: string | null; // objectURL (local ảnh) hoặc downloadUrl (remote ảnh)
  name: string;
  sizeBytes: number;
  mimeType: string;
  /** fileId đã upload (REMOTE) — có nghĩa attachment này đã lưu ở BE. */
  remoteFileId?: string;
  /** URL tải/preview cho attachment REMOTE. */
  downloadUrl?: string;
}

interface Props {
  attachments: CalendarLocalAttachment[];
  onChange: (next: CalendarLocalAttachment[]) => void;
  maxFiles?: number; // default 10
  maxMB?: number; // per-file, default 50
}

const isImage = (mime: string) => mime.startsWith("image/");

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * CalendarAttachmentList — danh sách attachment đã lưu (read-only) cho NGƯỜI XEM
 * ở màn chi tiết event. Mỗi file là 1 card:
 *  - Ảnh → thumbnail, bấm "Xem" mở full-res ở tab mới.
 *  - PDF → icon đỏ, "Xem" mở inline (trình duyệt render PDF).
 *  - Word/Excel/PowerPoint/khác → icon theo loại (getMimePreviewType), "Tải".
 * Mọi file đều có nút "Tải" (download).
 */
export interface CalendarViewAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl?: string | null;
}

/**
 * Loại file FilePreviewModal xem inline được trong app (không chỉ tải).
 * Gồm cả Word/Excel/PowerPoint (DocumentPreview render qua Office Online viewer)
 * và text/csv/archive — mọi loại trừ "unknown" đều có viewer riêng.
 */
const isInlineViewable = (previewType: string): boolean => previewType !== "unknown";

const AttachmentCard: React.FC<{
  a: CalendarViewAttachment;
  /** Mở xem inline trong app (lightbox). undefined = file không xem inline được → chỉ tải. */
  onView?: () => void;
}> = ({ a, onView }) => {
  const previewType = getMimePreviewType(a.mimeType, a.filename);
  const iconType = getIconTypeFromPreviewType(previewType);
  const image = previewType === "image";
  const thumb = image ? a.thumbnailUrl || a.url : null;

  return (
    <div className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface-overlay p-2 transition-colors hover:border-[#1976D2]/40">
      {/* Thumbnail ảnh / icon theo loại file — bấm để xem inline trong app */}
      {thumb ? (
        <button
          type="button"
          onClick={onView}
          title={`Xem ${a.filename}`}
          className="shrink-0 cursor-pointer"
        >
          <img
            src={thumb}
            alt={a.filename}
            loading="lazy"
            className="h-12 w-12 rounded-md object-cover ring-1 ring-border transition group-hover:ring-[#1976D2]/50"
          />
        </button>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-hover">
          <FileTypeIcon type={iconType} className="h-6 w-6" />
        </div>
      )}

      {/* Tên + kích thước — cắt giữa giữ đuôi (….pdf). KHÔNG dùng `truncate` (CSS
          ellipsis cắt cuối sẽ ăn mất đuôi); helper đã giới hạn độ dài rồi. */}
      <div className="min-w-0 flex-1">
        <p
          className="overflow-hidden whitespace-nowrap text-sm font-medium text-text-primary"
          title={a.filename}
        >
          {truncateFilename(a.filename, 34)}
        </p>
        <p className="text-[11px] uppercase tracking-wide text-text-muted">
          {(a.filename.split(".").pop() || previewType).toString()} · {formatSize(a.sizeBytes)}
        </p>
      </div>

      {/* Actions: Xem (inline trong app) + Tải */}
      <div className="flex shrink-0 items-center gap-1">
        {onView && (
          <button
            type="button"
            onClick={onView}
            title="Xem"
            aria-label={`Xem ${a.filename}`}
            className="rounded-md p-1.5 text-text-muted hover:bg-[#1976D2]/10 hover:text-[#1565C0]"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
        )}
        <a
          href={a.url}
          download={a.filename}
          title="Tải xuống"
          aria-label={`Tải ${a.filename}`}
          className="rounded-md p-1.5 text-text-muted hover:bg-[#1976D2]/10 hover:text-[#1565C0]"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

/** Map attachment lịch → PreviewTarget cho FilePreviewModal (dùng `url` sẵn có). */
const toPreviewTarget = (a: CalendarViewAttachment): PreviewTarget => {
  const previewType = getMimePreviewType(a.mimeType, a.filename);
  return {
    // Không thuộc hội thoại nào → conversationId rỗng; hook sẽ dùng thẳng `url`.
    conversationId: "",
    previewType,
    attachment: {
      id: a.fileId,
      type: FileType.OTHER,
      url: a.url,
      downloadUrl: a.url,
      thumbnailUrl: a.thumbnailUrl ?? undefined,
      fileName: a.filename,
      fileSize: a.sizeBytes,
      mimeType: a.mimeType,
    },
  };
};

export const CalendarAttachmentList: React.FC<{ attachments: CalendarViewAttachment[] }> = ({
  attachments,
}) => {
  const preview = useFilePreview();

  if (attachments.length === 0) return null;

  // File (không phải ảnh) lên đầu, ảnh xuống dưới — mỗi thứ 1 dòng.
  const ordered = [...attachments].sort((x, y) => {
    const xi = getMimePreviewType(x.mimeType, x.filename) === "image" ? 1 : 0;
    const yi = getMimePreviewType(y.mimeType, y.filename) === "image" ? 1 : 0;
    return xi - yi;
  });

  // Gallery = các file xem inline được (ảnh/pdf/video/audio) → điều hướng qua lại trong lightbox.
  const gallery = ordered
    .filter((a) => isInlineViewable(getMimePreviewType(a.mimeType, a.filename)))
    .map(toPreviewTarget);

  return (
    <>
      <div className="flex flex-col gap-2">
        {ordered.map((a) => {
          const canView = isInlineViewable(getMimePreviewType(a.mimeType, a.filename));
          return (
            <AttachmentCard
              key={a.fileId}
              a={a}
              onView={
                canView
                  ? () => preview.open(toPreviewTarget(a), gallery)
                  : undefined
              }
            />
          );
        })}
      </div>

      <FilePreviewModal
        isOpen={preview.isOpen}
        onClose={preview.close}
        current={preview.current}
        currentIndex={preview.currentIndex}
        totalItems={preview.totalItems}
        secureUrl={preview.secureUrl}
        isLoadingUrl={preview.isLoadingUrl}
        urlError={preview.urlError}
        hasPrev={preview.hasPrev}
        hasNext={preview.hasNext}
        onPrev={preview.prev}
        onNext={preview.next}
        onRefreshUrl={preview.refreshUrl}
      />
    </>
  );
};

export const CalendarAttachmentZone: React.FC<Props> = ({
  attachments,
  onChange,
  maxFiles = 10,
  maxMB = 50,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);

  // Revoke objectURLs khi unmount — CHỈ với local (có file); remote dùng
  // downloadUrl thật, không phải objectURL nên không revoke.
  React.useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.file && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // ponytail: stale-dep intentional — only revoke on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const errs: string[] = [];
    const maxBytes = maxMB * 1024 * 1024;

    const toAdd: CalendarLocalAttachment[] = [];
    for (const file of arr) {
      if (attachments.length + toAdd.length >= maxFiles) {
        errs.push(`Tối đa ${maxFiles} file.`);
        break;
      }
      if (file.size > maxBytes) {
        errs.push(`"${file.name}" vượt ${maxMB} MB.`);
        continue;
      }
      const dup = attachments.some((a) => a.name === file.name && a.sizeBytes === file.size);
      if (dup) continue;

      toAdd.push({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: isImage(file.type) ? URL.createObjectURL(file) : null,
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      });
    }
    setErrors(errs);
    if (toAdd.length) onChange([...attachments, ...toAdd]);
  };

  const remove = (id: string) => {
    const found = attachments.find((a) => a.id === id);
    if (found?.file && found.previewUrl) URL.revokeObjectURL(found.previewUrl);
    onChange(attachments.filter((a) => a.id !== id));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Kéo thả file hoặc bấm để chọn"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={clsx(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-3 text-center transition-colors",
          dragOver
            ? "border-[#1976D2] bg-[#1976D2]/5"
            : "border-border hover:border-[#1976D2]/50 hover:bg-surface-hover",
        )}
      >
        <PaperClipIcon className="h-5 w-5 text-text-muted" />
        <span className="text-xs text-text-muted">
          Kéo thả file / ảnh vào đây, hoặc{" "}
          <span className="font-medium text-[#1565C0]">bấm để chọn</span>
        </span>
        <span className="text-[10px] text-text-muted">
          Tối đa {maxFiles} file · mỗi file ≤ {maxMB} MB
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Chọn file đính kèm"
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />

      {/* Error hints */}
      {errors.map((err, i) => (
        <p key={i} className="text-xs text-danger">{err}</p>
      ))}

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-1.5 rounded-lg border border-border bg-surface-overlay px-2 py-1.5"
            >
              {a.previewUrl ? (
                <img
                  src={a.previewUrl}
                  alt={a.name}
                  className="h-10 w-10 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-hover">
                  <FileTypeIcon
                    type={getIconTypeFromPreviewType(getMimePreviewType(a.mimeType, a.name))}
                    className="h-5 w-5"
                  />
                </div>
              )}
              <div className="min-w-0 max-w-[120px]">
                <p className="truncate text-xs font-medium text-text-primary">{a.name}</p>
                <p className="text-[10px] text-text-muted">
                  {formatSize(a.sizeBytes)}
                  {a.remoteFileId && <span className="text-emerald-600 dark:text-emerald-400"> · đã lưu</span>}
                </p>
              </div>
              {a.remoteFileId && a.downloadUrl && (
                <a
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Tải ${a.name}`}
                  className="ml-1 rounded-full p-0.5 text-text-muted opacity-60 hover:bg-[#1976D2]/10 hover:text-[#1565C0] hover:opacity-100"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(a.id); }}
                aria-label={`Xóa ${a.name}`}
                className="ml-0.5 rounded-full p-0.5 opacity-50 hover:bg-danger/10 hover:opacity-100 hover:text-danger"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
