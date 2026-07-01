/**
 * CalendarAttachmentZone — khu vực đính kèm file/ảnh trong form lịch.
 * Lưu file dưới dạng local (File object + objectURL preview).
 * Chưa upload thật — parent nhận danh sách File[] và tự upload khi submit
 * (chờ BE bổ sung purpose `calendar_attachment`).
 */

import React from "react";
import clsx from "clsx";
import { XMarkIcon, PaperClipIcon, PhotoIcon } from "@heroicons/react/24/outline";

export interface CalendarLocalAttachment {
  id: string; // local only — `local-${Date.now()}-${i}`
  file: File;
  previewUrl: string | null; // objectURL cho ảnh, null cho file khác
  name: string;
  sizeBytes: number;
  mimeType: string;
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

export const CalendarAttachmentZone: React.FC<Props> = ({
  attachments,
  onChange,
  maxFiles = 10,
  maxMB = 50,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);

  // Revoke objectURLs khi unmount
  React.useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
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
    if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
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
                  <PhotoIcon className="h-5 w-5 text-text-muted" />
                </div>
              )}
              <div className="min-w-0 max-w-[120px]">
                <p className="truncate text-xs font-medium text-text-primary">{a.name}</p>
                <p className="text-[10px] text-text-muted">{formatSize(a.sizeBytes)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(a.id); }}
                aria-label={`Xóa ${a.name}`}
                className="ml-1 rounded-full p-0.5 opacity-50 hover:bg-danger/10 hover:opacity-100 hover:text-danger"
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
