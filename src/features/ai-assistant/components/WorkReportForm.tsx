import React, { useState } from "react";
import {
  SaveIcon,
  XIcon,
  PlusIcon,
  Trash2Icon,
  PaperclipIcon,
  FileIcon,
  DownloadIcon,
  Loader2Icon,
} from "lucide-react";
import clsx from "clsx";
import type {
  WorkReportFormRequest,
  WorkReportTaskItem,
  WorkReportAttachment,
} from "../types";
import {
  submitWorkReport,
  uploadWorkReportFile,
  downloadWorkReportFile,
  deleteWorkReportFile,
} from "../services/aiChatApi";

interface WorkReportFormProps {
  data: WorkReportFormRequest;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

const TASK_KEYS = ["task_name", "requirements", "completed", "difficulties"] as const;
type TaskKey = typeof TASK_KEYS[number];

const FIELD_LABELS_VN: Record<string, string> = {
  task_name: "Tên công việc",
  requirements: "Yêu cầu",
  completed: "Đã làm",
  difficulties: "Khó khăn",
};

const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp";
const DEFAULT_MAX_MB = 25;

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const EMPTY_TASK: WorkReportTaskItem = {
  task_name: "",
  requirements: "",
  completed: "",
  difficulties: "",
  notes: "",
};

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateVN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function initTasks(data: WorkReportFormRequest): WorkReportTaskItem[] {
  if (data.existing?.tasks && data.existing.tasks.length > 0) {
    return data.existing.tasks.map((t) => ({
      task_name: t.task_name ?? "",
      requirements: t.requirements ?? "",
      completed: t.completed ?? "",
      difficulties: t.difficulties ?? "",
      notes: t.notes ?? "",
    }));
  }
  if (data.existing?.task_name) {
    return [{
      task_name: data.existing.task_name,
      requirements: data.existing.requirements ?? "",
      completed: data.existing.completed ?? "",
      difficulties: data.existing.difficulties ?? "",
      notes: data.existing.notes ?? "",
    }];
  }
  return [{ ...EMPTY_TASK }];
}

export const WorkReportForm: React.FC<WorkReportFormProps> = ({ data, onSuccess, onCancel }) => {
  const allowMultiple = data.allow_multiple_tasks !== false;

  const [tasks, setTasks] = useState<WorkReportTaskItem[]>(() => initTasks(data));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Đính kèm CẤP NGÀY (không theo task) — upload/list/delete thật ──────────
  const attachEnabled = data.allow_attachments === true;
  const acceptAttr = data.accepted_file_types?.length
    ? data.accepted_file_types.join(",")
    : DEFAULT_ACCEPT;
  const maxMb = data.max_file_mb ?? DEFAULT_MAX_MB;

  const [attachments, setAttachments] = useState<WorkReportAttachment[]>(
    () => data.existing?.attachments ?? [],
  );
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fieldLabel = (key: string) =>
    data.field_labels?.[key] ?? FIELD_LABELS_VN[key] ?? key;

  const handleTaskChange = (idx: number, field: TaskKey | "notes", value: string) => {
    setTasks((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const addTask = () => setTasks((prev) => [...prev, { ...EMPTY_TASK }]);
  const removeTask = (idx: number) => setTasks((prev) => prev.filter((_, i) => i !== idx));

  const handlePickFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    const files = Array.from(fileList);
    for (const file of files) {
      if (file.size > maxMb * 1024 * 1024) {
        setAttachError(`"${file.name}" vượt quá ${maxMb}MB.`);
        continue;
      }
      setUploadingNames((prev) => [...prev, file.name]);
      try {
        const res = await uploadWorkReportFile(file, data.date);
        setAttachments((prev) => [
          ...prev,
          {
            id: res.file.id,
            original_filename: res.file.filename,
            content_type: res.file.content_type,
            file_size: res.file.file_size,
            download_url: res.file.download_url,
          },
        ]);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Không thể tải tệp lên");
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== file.name));
      }
    }
  };

  const handleDownload = async (att: WorkReportAttachment) => {
    setAttachError(null);
    setDownloadingId(att.id);
    try {
      await downloadWorkReportFile(att.id, att.original_filename);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Không thể tải tệp");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteAttachment = async (att: WorkReportAttachment) => {
    setAttachError(null);
    setDeletingId(att.id);
    try {
      await deleteWorkReportFile(att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Không thể xoá tệp");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validTasks = tasks.filter((t) => t.task_name.trim());
    if (validTasks.length === 0) {
      setError("Cần nhập ít nhất một tên công việc");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await submitWorkReport({
        employee_code: data.employee_code,
        employee_name: data.employee_name,
        department_name: data.department_name,
        org_unit: data.org_unit,
        report_date: data.date,
        tasks: validTasks,  // notes nằm trong mỗi task
      });
      onSuccess(`✅ Đã lưu báo cáo ngày ${formatDateVN(data.date)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu báo cáo");
    } finally {
      setIsSubmitting(false);
    }
  };

  const textareaClass = clsx(
    "w-full resize-none px-3 py-2 text-sm bg-transparent text-text-primary",
    "placeholder:text-text-muted outline-none",
    "focus:bg-[#1976D2]/4 transition-colors",
    isSubmitting && "opacity-50",
  );

  const textareaClassMobile = clsx(
    "w-full resize-none rounded-lg border border-border px-3 py-2 text-sm",
    "bg-transparent text-text-primary placeholder:text-text-muted",
    "focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25",
    isSubmitting && "opacity-50",
  );

  // Vùng đính kèm cấp ngày — chỉ hiện khi BE cho phép HOẶC đã có file đính kèm sẵn.
  const showAttachSection = attachEnabled || attachments.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#1976D2]/8 border-b border-border">
        <h3 className="text-sm font-semibold text-[#1565C0]">
          Báo cáo công việc ngày {formatDateVN(data.date)}
        </h3>
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block">
        {/* Column headers */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2rem" }}
        >
          {TASK_KEYS.map((key) => (
            <div
              key={key}
              className="px-3 py-2 text-xs font-medium text-text-secondary border-r border-border bg-surface-overlay/30"
            >
              {fieldLabel(key)}
            </div>
          ))}
          <div className="bg-surface-overlay/30" />
        </div>

        {/* Task rows — mỗi task có ghi chú riêng */}
        {tasks.map((task, idx) => (
          <div key={idx} className="border-b border-border">
            {/* 4 trường chính */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2rem" }}
            >
              {TASK_KEYS.map((key) => (
                <div key={key} className="border-r border-border">
                  <textarea
                    value={task[key]}
                    onChange={(e) => handleTaskChange(idx, key, e.target.value)}
                    placeholder={fieldLabel(key)}
                    rows={3}
                    disabled={isSubmitting}
                    className={textareaClass}
                  />
                </div>
              ))}
              <div className="flex items-start justify-center pt-2">
                {allowMultiple && tasks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTask(idx)}
                    disabled={isSubmitting}
                    title="Xóa công việc này"
                    className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/8 transition-colors disabled:opacity-50"
                  >
                    <XIcon size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Ghi chú riêng của task này */}
            <div className="border-t border-border/50 px-3 py-1.5 flex items-start gap-2">
              <span className="text-xs font-medium text-text-secondary whitespace-nowrap pt-1.5 min-w-[3.5rem]">
                Ghi chú:
              </span>
              <textarea
                value={task.notes ?? ""}
                ref={(el) => autoResize(el)}
                onChange={(e) => { handleTaskChange(idx, "notes", e.target.value); autoResize(e.target); }}
                placeholder="Ghi chú cho công việc này..."
                rows={1}
                disabled={isSubmitting}
                className={clsx(
                  "flex-1 resize-none overflow-hidden px-2 py-1 text-sm bg-transparent text-text-primary",
                  "placeholder:text-text-muted outline-none rounded",
                  "focus:bg-[#1976D2]/4 transition-colors",
                  isSubmitting && "opacity-50",
                )}
              />
            </div>
          </div>
        ))}

        {/* Add task */}
        {allowMultiple && (
          <div className="px-3 py-2 border-b border-border">
            <button
              type="button"
              onClick={addTask}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 text-xs text-[#1565C0] hover:bg-[#1976D2]/8 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              <PlusIcon size={13} />
              Thêm công việc
            </button>
          </div>
        )}
      </div>

      {/* Mobile: stacked layout */}
      <div className="sm:hidden px-4 py-3 flex flex-col gap-4">
        {tasks.map((task, idx) => (
          <div key={idx} className="flex flex-col gap-2 pb-3 border-b border-border last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">
                Công việc {idx + 1}
              </span>
              {allowMultiple && tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(idx)}
                  disabled={isSubmitting}
                  className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/8 transition-colors disabled:opacity-50"
                >
                  <Trash2Icon size={13} />
                </button>
              )}
            </div>

            {TASK_KEYS.map((key) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">
                  {fieldLabel(key)}
                  {key === "task_name" && <span className="text-danger ml-1">*</span>}
                </label>
                <textarea
                  value={task[key]}
                  onChange={(e) => handleTaskChange(idx, key, e.target.value)}
                  rows={2}
                  disabled={isSubmitting}
                  className={textareaClassMobile}
                />
              </div>
            ))}

            {/* Ghi chú riêng của task (mobile) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Ghi chú</label>
              <textarea
                value={task.notes ?? ""}
                ref={(el) => autoResize(el)}
                onChange={(e) => { handleTaskChange(idx, "notes", e.target.value); autoResize(e.target); }}
                placeholder="Ghi chú cho công việc này..."
                rows={1}
                disabled={isSubmitting}
                className={clsx(textareaClassMobile, "overflow-hidden")}
              />
            </div>
          </div>
        ))}

        {allowMultiple && (
          <button
            type="button"
            onClick={addTask}
            disabled={isSubmitting}
            className="flex items-center justify-center gap-1.5 text-xs text-[#1565C0] hover:bg-[#1976D2]/8 px-3 py-2 rounded-lg border border-dashed border-[#1976D2]/40 transition-colors disabled:opacity-50"
          >
            <PlusIcon size={13} />
            Thêm công việc
          </button>
        )}
      </div>

      {/* Đính kèm file cấp ngày */}
      {showAttachSection && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">
              Tệp đính kèm
            </span>
            {attachEnabled && (
              <label
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#1976D2]/40 px-2.5 py-1 text-xs text-[#1565C0] transition-colors hover:bg-[#1976D2]/8",
                  isSubmitting && "pointer-events-none opacity-50",
                )}
                title={`Định dạng: ${acceptAttr} · tối đa ${maxMb}MB`}
              >
                <PaperclipIcon size={13} />
                Đính kèm
                <input
                  type="file"
                  multiple
                  accept={acceptAttr}
                  disabled={isSubmitting}
                  className="hidden"
                  onChange={(e) => {
                    void handlePickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {/* Danh sách file đã đính */}
          {(attachments.length > 0 || uploadingNames.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay/40 px-2.5 py-1.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1976D2]/8 text-[#1565C0]">
                    <FileIcon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {att.original_filename}
                    </div>
                    {formatFileSize(att.file_size) && (
                      <div className="text-[11px] text-text-muted">
                        {formatFileSize(att.file_size)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    disabled={downloadingId === att.id}
                    title="Tải về"
                    className="rounded p-1 text-text-muted transition-colors hover:bg-[#1976D2]/10 hover:text-[#1565C0] disabled:opacity-50"
                  >
                    {downloadingId === att.id ? (
                      <Loader2Icon size={14} className="animate-spin" />
                    ) : (
                      <DownloadIcon size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttachment(att)}
                    disabled={deletingId === att.id}
                    title="Xoá tệp"
                    className="rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    {deletingId === att.id ? (
                      <Loader2Icon size={14} className="animate-spin" />
                    ) : (
                      <Trash2Icon size={14} />
                    )}
                  </button>
                </div>
              ))}

              {/* File đang upload */}
              {uploadingNames.map((name) => (
                <div
                  key={`uploading-${name}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay/40 px-2.5 py-1.5 opacity-70"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1976D2]/8 text-[#1565C0]">
                    <Loader2Icon size={14} className="animate-spin" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text-primary">{name}</div>
                    <div className="text-[11px] text-text-muted">Đang tải lên…</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {attachError && (
            <div className="text-xs text-danger">{attachError}</div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 text-xs text-danger">{error}</div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-overlay/20">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <XIcon size={14} />
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#1976D2] to-[#1565C0] hover:brightness-105 transition-all disabled:opacity-50 shadow-sm"
        >
          <SaveIcon size={14} />
          {isSubmitting ? "Đang lưu..." : "Lưu báo cáo"}
        </button>
      </div>
    </form>
  );
};
