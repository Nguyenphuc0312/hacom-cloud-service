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
  type WorkReportTaskSubmit,
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

/** Dòng công việc trong state — kèm id (sau khi lưu) và file của riêng việc. */
interface TaskRow {
  id?: string;
  task_name: string;
  requirements: string;
  completed: string;
  difficulties: string;
  notes?: string;
  attachments: WorkReportAttachment[];
}

const EMPTY_TASK: TaskRow = {
  task_name: "",
  requirements: "",
  completed: "",
  difficulties: "",
  notes: "",
  attachments: [],
};

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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

function toTaskRow(t: Partial<WorkReportTaskItem>): TaskRow {
  return {
    id: t.id,
    task_name: t.task_name ?? "",
    requirements: t.requirements ?? "",
    completed: t.completed ?? "",
    difficulties: t.difficulties ?? "",
    notes: t.notes ?? "",
    attachments: t.attachments ?? [],
  };
}

function initTasks(data: WorkReportFormRequest): TaskRow[] {
  if (data.existing?.tasks && data.existing.tasks.length > 0) {
    return data.existing.tasks.map(toTaskRow);
  }
  if (data.existing?.task_name) {
    return [toTaskRow(data.existing)];
  }
  return [{ ...EMPTY_TASK }];
}

// ── File item dùng chung (task + chung) ──────────────────────────────────────
const AttachmentItem: React.FC<{
  att: WorkReportAttachment;
  downloading: boolean;
  deleting: boolean;
  onDownload: () => void;
  onDelete: () => void;
}> = ({ att, downloading, deleting, onDownload, onDelete }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay/40 px-2.5 py-1.5">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1976D2]/8 text-[#1565C0]">
      <FileIcon size={14} />
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium text-text-primary">
        {att.original_filename}
      </div>
      {formatFileSize(att.file_size) && (
        <div className="text-[11px] text-text-muted">{formatFileSize(att.file_size)}</div>
      )}
    </div>
    <button
      type="button"
      onClick={onDownload}
      disabled={downloading}
      title="Tải về"
      className="rounded p-1 text-text-muted transition-colors hover:bg-[#1976D2]/10 hover:text-[#1565C0] disabled:opacity-50"
    >
      {downloading ? <Loader2Icon size={14} className="animate-spin" /> : <DownloadIcon size={14} />}
    </button>
    <button
      type="button"
      onClick={onDelete}
      disabled={deleting}
      title="Xoá tệp"
      className="rounded p-1 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
    >
      {deleting ? <Loader2Icon size={14} className="animate-spin" /> : <Trash2Icon size={14} />}
    </button>
  </div>
);

const UploadingItem: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay/40 px-2.5 py-1.5 opacity-70">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1976D2]/8 text-[#1565C0]">
      <Loader2Icon size={14} className="animate-spin" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm text-text-primary">{name}</div>
      <div className="text-[11px] text-text-muted">Đang tải lên…</div>
    </div>
  </div>
);

export const WorkReportForm: React.FC<WorkReportFormProps> = ({ data, onSuccess, onCancel }) => {
  const allowMultiple = data.allow_multiple_tasks !== false;

  const [tasks, setTasks] = useState<TaskRow[]>(() => initTasks(data));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Cấu hình đính kèm ─────────────────────────────────────────────────────
  const attachEnabled = data.allow_attachments === true;
  // Chế độ đính kèm theo từng công việc (BE gửi attach_level="task").
  const taskAttachMode = attachEnabled && data.attach_level === "task";
  const acceptAttr = data.accepted_file_types?.length
    ? data.accepted_file_types.join(",")
    : DEFAULT_ACCEPT;
  const maxMb = data.max_file_mb ?? DEFAULT_MAX_MB;

  // File "chung" (task_id=null) — chế độ task: CHỈ hiển thị (xem/tải/xoá), không upload mới.
  const [commonAttachments, setCommonAttachments] = useState<WorkReportAttachment[]>(
    () => (taskAttachMode ? data.existing?.attachments ?? [] : []),
  );
  // File cấp ngày (legacy, attach_level != "task") — vẫn cho upload trực tiếp.
  const [attachments, setAttachments] = useState<WorkReportAttachment[]>(
    () => (taskAttachMode ? [] : data.existing?.attachments ?? []),
  );

  const [uploadingKeys, setUploadingKeys] = useState<string[]>([]); // "idx:filename" (task) | "report:filename" (legacy)
  const [savingForAttach, setSavingForAttach] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const busy = isSubmitting || savingForAttach;

  const fieldLabel = (key: string) =>
    data.field_labels?.[key] ?? FIELD_LABELS_VN[key] ?? key;

  const handleTaskChange = (idx: number, field: TaskKey | "notes", value: string) => {
    setTasks((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const addTask = () => setTasks((prev) => [...prev, { ...EMPTY_TASK, attachments: [] }]);

  const removeTask = (idx: number) => {
    // Bỏ một việc đang có file: BE sẽ chuyển file đó thành "chung". Phản chiếu
    // ngay trên FE để file không biến mất khỏi form đang mở.
    const removed = tasks[idx];
    if (taskAttachMode && removed?.attachments.length) {
      setCommonAttachments((c) => [
        ...c,
        ...removed.attachments.map((a) => ({ ...a, task_id: null })),
      ]);
    }
    setTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * Lưu báo cáo (POST /api/work-reports) — round-trip id của từng việc đang có,
   * rồi map id BE trả về vào state. Trả về mảng tasks đã cập nhật id để caller
   * dùng ngay (không phụ thuộc setState bất đồng bộ).
   */
  const saveReport = async (): Promise<TaskRow[]> => {
    const rowIndexes: number[] = [];
    const payload: WorkReportTaskSubmit[] = [];
    tasks.forEach((t, idx) => {
      if (!t.task_name.trim()) return;
      rowIndexes.push(idx);
      payload.push({
        id: t.id, // round-trip — thiếu id BE coi là việc mới, mất liên kết file
        task_name: t.task_name,
        requirements: t.requirements,
        completed: t.completed,
        difficulties: t.difficulties,
        notes: t.notes,
      });
    });
    if (payload.length === 0) {
      throw new Error("Cần nhập ít nhất một tên công việc");
    }

    const res = await submitWorkReport({
      employee_code: data.employee_code,
      employee_name: data.employee_name,
      department_name: data.department_name,
      org_unit: data.org_unit,
      report_date: data.date,
      tasks: payload,
    });

    const returned = res.report.tasks ?? [];
    const updated = tasks.map((r) => ({ ...r }));
    rowIndexes.forEach((rowIdx, i) => {
      const rid = returned[i]?.id;
      if (rid != null && String(rid)) updated[rowIdx].id = String(rid);
    });
    setTasks(updated);
    return updated;
  };

  // ── Upload theo TỪNG công việc (tự lưu nháp nếu việc chưa có id) ────────────
  const handlePickTaskFiles = async (taskIdx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);

    if (!tasks[taskIdx]?.task_name.trim()) {
      setAttachError("Nhập tên công việc trước khi đính kèm.");
      return;
    }

    // File chỉ gắn được vào việc đã có id → lưu nháp báo cáo để lấy id nếu cần.
    let taskId = tasks[taskIdx]?.id;
    if (!taskId) {
      setSavingForAttach(true);
      try {
        const saved = await saveReport();
        taskId = saved[taskIdx]?.id;
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Không thể lưu báo cáo để đính kèm");
        setSavingForAttach(false);
        return;
      }
      setSavingForAttach(false);
    }
    if (!taskId) {
      setAttachError("Chưa lấy được mã công việc. Vui lòng Lưu báo cáo rồi thử lại.");
      return;
    }

    for (const file of Array.from(fileList)) {
      if (file.size > maxMb * 1024 * 1024) {
        setAttachError(`"${file.name}" vượt quá ${maxMb}MB.`);
        continue;
      }
      const key = `${taskIdx}:${file.name}`;
      setUploadingKeys((prev) => [...prev, key]);
      try {
        const res = await uploadWorkReportFile(file, { reportDate: data.date, taskId });
        const att: WorkReportAttachment = {
          id: res.file.id,
          task_id: res.file.task_id ?? taskId,
          original_filename: res.file.filename,
          content_type: res.file.content_type,
          file_size: res.file.file_size,
          download_url: res.file.download_url,
        };
        setTasks((prev) =>
          prev.map((r, i) => (i === taskIdx ? { ...r, attachments: [...r.attachments, att] } : r)),
        );
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Không thể tải tệp lên");
      } finally {
        setUploadingKeys((prev) => prev.filter((k) => k !== key));
      }
    }
  };

  // ── Upload cấp NGÀY (legacy, attach_level != "task") ───────────────────────
  const handlePickReportFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    for (const file of Array.from(fileList)) {
      if (file.size > maxMb * 1024 * 1024) {
        setAttachError(`"${file.name}" vượt quá ${maxMb}MB.`);
        continue;
      }
      const key = `report:${file.name}`;
      setUploadingKeys((prev) => [...prev, key]);
      try {
        const res = await uploadWorkReportFile(file, { reportDate: data.date });
        setAttachments((prev) => [
          ...prev,
          {
            id: res.file.id,
            task_id: res.file.task_id ?? null,
            original_filename: res.file.filename,
            content_type: res.file.content_type,
            file_size: res.file.file_size,
            download_url: res.file.download_url,
          },
        ]);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Không thể tải tệp lên");
      } finally {
        setUploadingKeys((prev) => prev.filter((k) => k !== key));
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

  const handleDeleteTaskFile = async (taskIdx: number, att: WorkReportAttachment) => {
    setAttachError(null);
    setDeletingId(att.id);
    try {
      await deleteWorkReportFile(att.id);
      setTasks((prev) =>
        prev.map((r, i) =>
          i === taskIdx ? { ...r, attachments: r.attachments.filter((a) => a.id !== att.id) } : r,
        ),
      );
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Không thể xoá tệp");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCommonFile = async (att: WorkReportAttachment) => {
    setAttachError(null);
    setDeletingId(att.id);
    try {
      await deleteWorkReportFile(att.id);
      setCommonAttachments((prev) => prev.filter((a) => a.id !== att.id));
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Không thể xoá tệp");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await saveReport();
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
    busy && "opacity-50",
  );

  const textareaClassMobile = clsx(
    "w-full resize-none rounded-lg border border-border px-3 py-2 text-sm",
    "bg-transparent text-text-primary placeholder:text-text-muted",
    "focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25",
    busy && "opacity-50",
  );

  // ── Render khu file của một công việc (chế độ task) ────────────────────────
  const renderTaskAttachments = (task: TaskRow, idx: number) => {
    const uploadingNames = uploadingKeys
      .filter((k) => k.startsWith(`${idx}:`))
      .map((k) => k.slice(`${idx}:`.length));
    const hasFiles = task.attachments.length > 0 || uploadingNames.length > 0;
    return (
      <div className="flex flex-col gap-1.5 border-t border-border/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-text-secondary">
            Tệp đính kèm của công việc
          </span>
          <label
            className={clsx(
              "flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#1976D2]/40 px-2.5 py-1 text-xs text-[#1565C0] transition-colors hover:bg-[#1976D2]/8",
              busy && "pointer-events-none opacity-50",
            )}
            title={`Định dạng: ${acceptAttr} · tối đa ${maxMb}MB`}
          >
            <PaperclipIcon size={13} />
            Đính kèm
            <input
              type="file"
              multiple
              accept={acceptAttr}
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                void handlePickTaskFiles(idx, e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {hasFiles && (
          <div className="flex flex-col gap-1.5">
            {task.attachments.map((att) => (
              <AttachmentItem
                key={att.id}
                att={att}
                downloading={downloadingId === att.id}
                deleting={deletingId === att.id}
                onDownload={() => handleDownload(att)}
                onDelete={() => handleDeleteTaskFile(idx, att)}
              />
            ))}
            {uploadingNames.map((name) => (
              <UploadingItem key={`up-${idx}-${name}`} name={name} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Legacy: khu đính kèm cấp ngày (chỉ khi KHÔNG ở chế độ task).
  const showLegacySection = !taskAttachMode && (attachEnabled || attachments.length > 0);
  const legacyUploading = uploadingKeys
    .filter((k) => k.startsWith("report:"))
    .map((k) => k.slice("report:".length));

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

        {/* Task rows — mỗi task có ghi chú + file riêng */}
        {tasks.map((task, idx) => (
          <div key={idx} className="border-b border-border">
            {/* 4 trường chính */}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2rem" }}>
              {TASK_KEYS.map((key) => (
                <div key={key} className="border-r border-border">
                  <textarea
                    value={task[key]}
                    onChange={(e) => handleTaskChange(idx, key, e.target.value)}
                    placeholder={fieldLabel(key)}
                    rows={3}
                    disabled={busy}
                    className={textareaClass}
                  />
                </div>
              ))}
              <div className="flex items-start justify-center pt-2">
                {allowMultiple && tasks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTask(idx)}
                    disabled={busy}
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
                onChange={(e) => {
                  handleTaskChange(idx, "notes", e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Ghi chú cho công việc này..."
                rows={1}
                disabled={busy}
                className={clsx(
                  "flex-1 resize-none overflow-hidden px-2 py-1 text-sm bg-transparent text-text-primary",
                  "placeholder:text-text-muted outline-none rounded",
                  "focus:bg-[#1976D2]/4 transition-colors",
                  busy && "opacity-50",
                )}
              />
            </div>

            {/* File đính kèm riêng của task */}
            {taskAttachMode && renderTaskAttachments(task, idx)}
          </div>
        ))}

        {/* Add task */}
        {allowMultiple && (
          <div className="px-3 py-2 border-b border-border">
            <button
              type="button"
              onClick={addTask}
              disabled={busy}
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
                  disabled={busy}
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
                  disabled={busy}
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
                onChange={(e) => {
                  handleTaskChange(idx, "notes", e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Ghi chú cho công việc này..."
                rows={1}
                disabled={busy}
                className={clsx(textareaClassMobile, "overflow-hidden")}
              />
            </div>

            {/* File đính kèm riêng của task (mobile) */}
            {taskAttachMode && renderTaskAttachments(task, idx)}
          </div>
        ))}

        {allowMultiple && (
          <button
            type="button"
            onClick={addTask}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 text-xs text-[#1565C0] hover:bg-[#1976D2]/8 px-3 py-2 rounded-lg border border-dashed border-[#1976D2]/40 transition-colors disabled:opacity-50"
          >
            <PlusIcon size={13} />
            Thêm công việc
          </button>
        )}
      </div>

      {/* Đính kèm CHUNG (chế độ task) — chỉ hiển thị, không upload mới */}
      {taskAttachMode && commonAttachments.length > 0 && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
          <span className="text-xs font-semibold text-text-secondary">Đính kèm chung</span>
          <p className="text-[11px] text-text-muted">
            File chung của báo cáo (gồm file cũ và file của công việc đã bị bỏ).
          </p>
          <div className="flex flex-col gap-1.5">
            {commonAttachments.map((att) => (
              <AttachmentItem
                key={att.id}
                att={att}
                downloading={downloadingId === att.id}
                deleting={deletingId === att.id}
                onDownload={() => handleDownload(att)}
                onDelete={() => handleDeleteCommonFile(att)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Đính kèm cấp NGÀY (legacy) */}
      {showLegacySection && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Tệp đính kèm</span>
            {attachEnabled && (
              <label
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#1976D2]/40 px-2.5 py-1 text-xs text-[#1565C0] transition-colors hover:bg-[#1976D2]/8",
                  busy && "pointer-events-none opacity-50",
                )}
                title={`Định dạng: ${acceptAttr} · tối đa ${maxMb}MB`}
              >
                <PaperclipIcon size={13} />
                Đính kèm
                <input
                  type="file"
                  multiple
                  accept={acceptAttr}
                  disabled={busy}
                  className="hidden"
                  onChange={(e) => {
                    void handlePickReportFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {(attachments.length > 0 || legacyUploading.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {attachments.map((att) => (
                <AttachmentItem
                  key={att.id}
                  att={att}
                  downloading={downloadingId === att.id}
                  deleting={deletingId === att.id}
                  onDownload={() => handleDownload(att)}
                  onDelete={() => handleDeleteCommonFile(att)}
                />
              ))}
              {legacyUploading.map((name) => (
                <UploadingItem key={`uploading-${name}`} name={name} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trạng thái tự lưu nháp + lỗi đính kèm */}
      {savingForAttach && (
        <div className="px-4 pt-2 text-xs text-text-muted">
          Đang lưu báo cáo để đính kèm…
        </div>
      )}
      {attachError && <div className="px-4 pt-2 text-xs text-danger">{attachError}</div>}

      {/* Error */}
      {error && <div className="mx-4 mb-2 mt-2 text-xs text-danger">{error}</div>}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-overlay/20">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <XIcon size={14} />
          Hủy
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#1976D2] to-[#1565C0] hover:brightness-105 transition-all disabled:opacity-50 shadow-sm"
        >
          <SaveIcon size={14} />
          {isSubmitting ? "Đang lưu..." : "Lưu báo cáo"}
        </button>
      </div>
    </form>
  );
};
