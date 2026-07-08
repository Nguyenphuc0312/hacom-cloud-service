import React, { useRef, useState } from "react";
import {
  SaveIcon,
  XIcon,
  PlusIcon,
  Trash2Icon,
  PaperclipIcon,
  FileIcon,
  DownloadIcon,
  Loader2Icon,
  CalendarIcon,
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
  deleteWorkReportTask,
  type WorkReportTaskSubmit,
} from "../services/aiChatApi";
import { ConfirmDialog } from "../../../components/ui";

interface WorkReportFormProps {
  data: WorkReportFormRequest;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

const TASK_KEYS = ["task_name", "requirements", "completed", "difficulties", "proposals"] as const;
type TaskKey = typeof TASK_KEYS[number];

// Thứ tự cột desktop (redesign 08/07): "Mục tiêu" (requirements) ngay sau "Tên
// công việc", "Ngày hoàn thành" kế đó, "Đề xuất" (proposals) sau "Khó khăn".
// Đúng thứ tự `fields` từ BE. Một grid template dùng chung cho header + input để
// mọi cột thẳng hàng — độ rộng: tên việc rộng nhất, ngày cố định hẹp.
const ORDERED_COLS = [
  "task_name",
  "requirements",
  "completion_date",
  "completed",
  "difficulties",
  "proposals",
] as const;
const DESKTOP_GRID_COLS = "1.3fr 1.1fr 150px 1.1fr 1.1fr 1.1fr 2rem";

const FIELD_LABELS_VN: Record<string, string> = {
  task_name: "Tên công việc",
  completion_date: "Ngày hoàn thành",
  requirements: "Mục tiêu",
  completed: "Kết quả đạt được",
  difficulties: "Khó khăn",
  proposals: "Đề xuất",
};

const DEFAULT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp";
const DEFAULT_MAX_MB = 25;

/** Khoá tương quan ổn định phía client cho một dòng việc (xem saveReport). */
function makeClientId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Dòng công việc trong state — kèm id (sau khi lưu) và file của riêng việc. */
interface TaskRow {
  /** Id thật do BE cấp (chỉ có sau khi lưu). */
  id?: string;
  /**
   * Khoá tương quan do client sinh, ỔN ĐỊNH suốt vòng đời dòng việc. Gửi kèm khi
   * lưu để map đúng việc → id thật bất kể BE trả thứ tự nào / trùng tên.
   */
  clientId: string;
  task_name: string;
  /** Deadline "yyyy-mm-dd" cho <input type="date"> (không bắt buộc). */
  completion_date?: string;
  requirements: string;
  completed: string;
  difficulties: string;
  /** "Đề xuất" — không bắt buộc (redesign 08/07). */
  proposals: string;
  notes?: string;
  attachments: WorkReportAttachment[];
}

function makeEmptyTask(): TaskRow {
  return {
    clientId: makeClientId(),
    task_name: "",
    completion_date: "",
    requirements: "",
    completed: "",
    difficulties: "",
    proposals: "",
    notes: "",
    attachments: [],
  };
}

/** Đuôi file (lowercase, kèm dấu chấm) có nằm trong danh sách cho phép không. */
function isAcceptedExtension(filename: string, accepted: string[]): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = filename.slice(dot).toLowerCase();
  return accepted.some((a) => a.trim().toLowerCase() === ext);
}

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

// ── Ngày hoàn thành: state lưu chuỗi dd/mm/yyyy (BE nhận trực tiếp; submitted_tasks
//    cũng trả dd/mm/yyyy). Chỉ chuyển đổi khi bắc cầu sang <input type="date">
//    (native picker chỉ hiểu yyyy-mm-dd). ────────────────────────────────────

/** "dd/mm/yyyy" (hợp lệ) → "yyyy-mm-dd" cho native picker; sai/rỗng → "". */
export function vnToIso(vn: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vn.trim());
  if (!m) return "";
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00`);
  // Chặn ngày không tồn tại (32/13/…): Date sẽ cuộn tháng nên phải đối chiếu lại.
  if (Number.isNaN(dt.getTime())) return "";
  const back = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  return back === vn.trim() ? iso : "";
}

/** "yyyy-mm-dd" (từ native picker) → "dd/mm/yyyy". */
export function isoToVn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Ô "Ngày hoàn thành" hiển thị dd/mm/yyyy (không bắt buộc). Gõ tay HOẶC bấm nút
 * lịch mở date-picker native. Giá trị luôn là dd/mm/yyyy (rỗng khi chưa nhập).
 */
const DateFieldVN: React.FC<{
  value: string;
  onChange: (vn: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  wrapClassName?: string;
}> = ({ value, onChange, disabled, ariaLabel, className, wrapClassName }) => {
  const pickerRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    // showPicker() mở lịch mà không cần input hiện hữu; fallback focus+click.
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={clsx("relative flex items-center", wrapClassName)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        title="Chọn từ lịch"
        aria-label="Chọn ngày từ lịch"
        className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-[#1976D2]/10 hover:text-[#1565C0] disabled:opacity-50"
      >
        <CalendarIcon size={15} />
      </button>
      {/* Native date input ẩn — chỉ để mở picker; giá trị đồng bộ 2 chiều với text. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={vnToIso(value)}
        onChange={(e) => onChange(isoToVn(e.target.value))}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  );
};

function toTaskRow(t: Partial<WorkReportTaskItem>): TaskRow {
  return {
    id: t.id,
    clientId: makeClientId(),
    task_name: t.task_name ?? "",
    completion_date: t.completion_date ?? "",
    requirements: t.requirements ?? "",
    completed: t.completed ?? "",
    difficulties: t.difficulties ?? "",
    proposals: t.proposals ?? "",
    notes: t.notes ?? "",
    attachments: t.attachments ?? [],
  };
}

function initTasks(data: WorkReportFormRequest): TaskRow[] {
  // Chế độ "append" (nộp nhiều lần/ngày): form luôn TRỐNG — KHÔNG đọc `existing`.
  if (data.mode === "append" || data.submitted_tasks) {
    return [makeEmptyTask()];
  }
  // Legacy (BE cũ): prefill để sửa báo cáo.
  if (data.existing?.tasks && data.existing.tasks.length > 0) {
    return data.existing.tasks.map(toTaskRow);
  }
  if (data.existing?.task_name) {
    return [toTaskRow(data.existing)];
  }
  return [makeEmptyTask()];
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
  const acceptedList = data.accepted_file_types?.length
    ? data.accepted_file_types
    : DEFAULT_ACCEPT.split(",");
  const acceptAttr = acceptedList.join(",");
  const maxMb = data.max_file_mb ?? DEFAULT_MAX_MB;

  // File "chung" (chưa gắn việc) đã nộp hôm nay — chế độ "append" lấy từ
  // `data.attachments`; legacy lấy từ `existing.attachments`.
  const initialCommon = data.attachments ?? data.existing?.attachments ?? [];
  // File "chung" (task_id=null) — chế độ task: CHỈ hiển thị (xem/tải/xoá), không upload mới.
  const [commonAttachments, setCommonAttachments] = useState<WorkReportAttachment[]>(
    () => (taskAttachMode ? initialCommon : []),
  );
  // File cấp ngày (legacy, attach_level != "task") — vẫn cho upload trực tiếp.
  const [attachments, setAttachments] = useState<WorkReportAttachment[]>(
    () => (taskAttachMode ? [] : initialCommon),
  );

  // Công việc ĐÃ nộp hôm nay (chỉ-đọc) — hiển thị bên dưới form + cho xóa lẻ.
  const [submittedTasks, setSubmittedTasks] = useState<WorkReportTaskItem[]>(
    () => data.submitted_tasks ?? [],
  );
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [uploadingKeys, setUploadingKeys] = useState<string[]>([]); // "idx:filename" (task) | "report:filename" (legacy)
  const [savingForAttach, setSavingForAttach] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Id công việc do FE TỰ LƯU NHÁP để có chỗ đính kèm (không phải user bấm "Lưu
  // báo cáo"). Khi bấm Hủy phải xóa các việc này khỏi BE — nếu không, báo cáo
  // vẫn còn dù người dùng đã hủy (BE xóa việc sẽ xóa kèm file của nó).
  const autoSavedTaskIds = useRef<Set<string>>(new Set());

  const busy = isSubmitting || savingForAttach || isCancelling;

  const fieldLabel = (key: string) =>
    data.field_labels?.[key] ?? FIELD_LABELS_VN[key] ?? key;

  const handleTaskChange = (idx: number, field: TaskKey | "notes" | "completion_date", value: string) => {
    setTasks((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const addTask = () => setTasks((prev) => [...prev, makeEmptyTask()]);

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
    const rows: { rowIdx: number; clientId: string; serverId?: string; name: string }[] = [];
    const payload: WorkReportTaskSubmit[] = [];
    tasks.forEach((t, idx) => {
      if (!t.task_name.trim()) return;
      rows.push({ rowIdx: idx, clientId: t.clientId, serverId: t.id, name: t.task_name });
      payload.push({
        id: t.id, // round-trip — thiếu id BE coi là việc mới, mất liên kết file
        client_task_id: t.clientId, // BE echo lại để map 1-1 (xem TaskRow.clientId)
        task_name: t.task_name,
        completion_date: t.completion_date || undefined, // deadline không bắt buộc
        requirements: t.requirements,
        completed: t.completed,
        difficulties: t.difficulties,
        proposals: t.proposals,
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

    // BE có thể trả TOÀN BỘ việc tích lũy trong ngày (append) chứ không chỉ việc
    // vừa gửi → KHÔNG map theo index. Khớp lần lượt theo độ tin cậy giảm dần:
    //   1) client_task_id (BE echo)  2) id round-trip  3) tên (so khớp đã trim)
    //   4) id "mới" chưa từng thấy trên form (việc vừa APPEND)  5) căn vị trí 1-1.
    const returned = res.report.tasks ?? [];
    const updated = tasks.map((r) => ({ ...r }));
    const usedReturned = new Set<number>();
    const sameLen = returned.length === rows.length;
    // Id đã biết trước khi lưu → bất kỳ id nào KHÔNG nằm trong đây là việc BE
    // vừa sinh (append). Dùng làm mỏ neo cho dòng việc MỚI khi BE không echo
    // client_task_id và đã chuẩn hoá (trim) tên khiến so khớp tên trượt.
    const knownServerIds = new Set(rows.map((r) => r.serverId).filter(Boolean) as string[]);
    const norm = (s: string) => s.trim();

    rows.forEach((row, i) => {
      const find = (pred: (t: (typeof returned)[number], ix: number) => boolean) =>
        returned.findIndex((t, ix) => !usedReturned.has(ix) && pred(t, ix));

      let ri = find((t) => t.client_task_id != null && String(t.client_task_id) === row.clientId);
      if (ri < 0 && row.serverId) {
        ri = find((t) => t.id != null && String(t.id) === row.serverId);
      }
      if (ri < 0) ri = find((t) => norm(t.task_name ?? "") === norm(row.name));
      if (ri < 0 && !row.serverId) {
        // Dòng việc MỚI: gắn vào id BE vừa sinh (không thuộc tập id đã biết).
        ri = find((t) => t.id != null && String(t.id) !== "" && !knownServerIds.has(String(t.id)));
      }
      if (ri < 0 && sameLen && !usedReturned.has(i)) ri = i;

      if (ri >= 0) {
        usedReturned.add(ri);
        const rid = returned[ri]?.id;
        if (rid != null && String(rid)) updated[row.rowIdx].id = String(rid);
      }
    });
    setTasks(updated);
    return updated;
  };

  // ── Upload theo TỪNG công việc (tự lưu nháp nếu việc chưa có id) ────────────
  const handlePickTaskFiles = async (taskIdx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // CHỤP danh sách file NGAY (đồng bộ) trước mọi `await`. FileList là LIVE —
    // gắn với <input>; handler onChange chạy `input.value = ""` ngay sau khi gọi
    // hàm này, làm rỗng FileList trong lúc đang `await saveReport()`. Nếu đọc file
    // sau await thì lần đính kèm ĐẦU (việc chưa có id → phải lưu nháp) sẽ thấy 0
    // file → không upload, buộc bấm lần 2. Snapshot ở đây để tránh điều đó.
    const files = Array.from(fileList);
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
    // Việc này đã được lưu (tự động) để đính kèm → ghi nhận để Hủy có thể xóa.
    autoSavedTaskIds.current.add(taskId);

    for (const file of files) {
      if (!isAcceptedExtension(file.name, acceptedList)) {
        setAttachError(`"${file.name}" sai định dạng. Cho phép: ${acceptAttr}`);
        continue;
      }
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
    // Snapshot trước await (xem ghi chú ở handlePickTaskFiles).
    const files = Array.from(fileList);
    setAttachError(null);
    for (const file of files) {
      if (!isAcceptedExtension(file.name, acceptedList)) {
        setAttachError(`"${file.name}" sai định dạng. Cho phép: ${acceptAttr}`);
        continue;
      }
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

  // Xóa một công việc ĐÃ nộp (owner-only). Xóa thành công → bỏ khỏi UI; file
  // riêng của công việc cũng bị BE xóa kèm.
  const handleDeleteSubmittedTask = async (taskId: string) => {
    setAttachError(null);
    setDeletingTaskId(taskId);
    try {
      await deleteWorkReportTask(taskId);
      setSubmittedTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Không thể xóa công việc");
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await saveReport();
      // Đã chốt báo cáo có chủ đích → các việc tự-lưu-nháp giờ là hợp lệ, không
      // còn coi là "rác cần dọn khi hủy".
      autoSavedTaskIds.current.clear();
      onSuccess(`✅ Đã lưu báo cáo ngày ${formatDateVN(data.date)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu báo cáo");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hủy: nếu đã có việc tự lưu nháp (để đính kèm) thì PHẢI xóa khỏi BE, nếu
  // không báo cáo vẫn tồn tại dù người dùng đã hủy. Mở hộp thoại xác nhận ở giữa
  // màn hình (ConfirmDialog) để tránh mất dữ liệu ngoài ý muốn — việc chưa lưu
  // nháp gì thì hủy luôn.
  const requestCancel = () => {
    if (autoSavedTaskIds.current.size === 0) {
      onCancel();
      return;
    }
    setShowCancelConfirm(true);
  };

  // Người dùng xác nhận bỏ báo cáo → xóa các việc đã tự lưu nháp (BE xóa kèm
  // tệp của nó) rồi đóng form.
  const confirmCancel = async () => {
    const ids = Array.from(autoSavedTaskIds.current);
    setAttachError(null);
    setIsCancelling(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteWorkReportTask(id)));
      autoSavedTaskIds.current.clear();
      if (results.some((r) => r.status === "rejected")) {
        setAttachError("Không xóa được hết công việc đã lưu — vui lòng kiểm tra lại báo cáo.");
      }
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
      onCancel();
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
        {/* Column headers — cột "Ngày hoàn thành" đứng ngay sau "Tên công việc"
            (đúng thứ tự `fields`), thẳng hàng cùng grid với input bên dưới. */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: DESKTOP_GRID_COLS }}
        >
          {ORDERED_COLS.map((key) => (
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
            {/* Các trường chính (kể cả Ngày hoàn thành) — 1 hàng grid duy nhất */}
            <div className="grid" style={{ gridTemplateColumns: DESKTOP_GRID_COLS }}>
              {ORDERED_COLS.map((key) =>
                key === "completion_date" ? (
                  <div key={key} className="border-r border-border">
                    <DateFieldVN
                      value={task.completion_date ?? ""}
                      onChange={(vn) => handleTaskChange(idx, "completion_date", vn)}
                      disabled={busy}
                      ariaLabel={fieldLabel("completion_date")}
                      wrapClassName="px-2 py-2 gap-1"
                      className={clsx(
                        "min-w-0 flex-1 px-1 py-0 text-sm bg-transparent text-text-primary outline-none",
                        "placeholder:text-text-muted",
                        busy && "opacity-50",
                      )}
                    />
                  </div>
                ) : (
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
                ),
              )}
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

            {/* Cùng thứ tự cột với desktop — Ngày hoàn thành ngay sau Tên công việc */}
            {ORDERED_COLS.map((key) =>
              key === "completion_date" ? (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-secondary">
                    {fieldLabel("completion_date")}
                  </label>
                  <DateFieldVN
                    value={task.completion_date ?? ""}
                    onChange={(vn) => handleTaskChange(idx, "completion_date", vn)}
                    disabled={busy}
                    ariaLabel={fieldLabel("completion_date")}
                    wrapClassName={clsx(
                      "rounded-lg border border-border px-3 py-2 gap-1",
                      "focus-within:border-[#1976D2]/60 focus-within:ring-1 focus-within:ring-[#1565C0]/25",
                    )}
                    className={clsx(
                      "min-w-0 flex-1 text-sm bg-transparent text-text-primary outline-none",
                      "placeholder:text-text-muted",
                      busy && "opacity-50",
                    )}
                  />
                </div>
              ) : (
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
              ),
            )}

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

      {/* Công việc ĐÃ nộp hôm nay (chỉ-đọc) — mỗi việc kèm nút Xóa + file đính kèm */}
      {submittedTasks.length > 0 && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
          <span className="text-xs font-semibold text-text-secondary">
            Công việc đã nộp hôm nay ({submittedTasks.length})
          </span>
          <div className="flex flex-col gap-2">
            {submittedTasks.map((task, idx) => {
              const taskId = task.id;
              return (
              <div
                key={taskId ?? idx}
                className="rounded-lg border border-border bg-surface-overlay/30 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary break-words">
                      {task.task_name || `Công việc ${idx + 1}`}
                    </div>
                    {task.completion_date ? (
                      <div className="mt-0.5 text-[11px] text-text-muted break-words">
                        <span className="font-medium">{fieldLabel("completion_date")}:</span>{" "}
                        {task.completion_date}
                      </div>
                    ) : null}
                    {TASK_KEYS.filter((k) => k !== "task_name").map((key) =>
                      task[key] ? (
                        <div key={key} className="mt-0.5 text-[11px] text-text-muted break-words">
                          <span className="font-medium">{fieldLabel(key)}:</span> {task[key]}
                        </div>
                      ) : null,
                    )}
                    {task.notes ? (
                      <div className="mt-0.5 text-[11px] text-text-muted break-words">
                        <span className="font-medium">Ghi chú:</span> {task.notes}
                      </div>
                    ) : null}
                  </div>
                  {taskId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSubmittedTask(taskId)}
                      disabled={busy || deletingTaskId === taskId}
                      title="Xóa công việc này"
                      className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      {deletingTaskId === taskId ? (
                        <Loader2Icon size={13} className="animate-spin" />
                      ) : (
                        <Trash2Icon size={13} />
                      )}
                      Xóa
                    </button>
                  )}
                </div>

                {/* File đính kèm riêng của công việc (chỉ tải) */}
                {task.attachments && task.attachments.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-border/50 pt-2">
                    {task.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
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
          onClick={requestCancel}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {isCancelling ? <Loader2Icon size={14} className="animate-spin" /> : <XIcon size={14} />}
          {isCancelling ? "Đang hủy..." : "Hủy"}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-[#1565C0] hover:bg-[#1976D2] transition-all disabled:opacity-50 shadow-sm"
        >
          <SaveIcon size={14} />
          {isSubmitting ? "Đang lưu..." : "Lưu báo cáo"}
        </button>
      </div>

      {/* Xác nhận hủy — hộp thoại giữa màn hình (xóa việc đã tự lưu nháp). */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => {
          if (!isCancelling) setShowCancelConfirm(false);
        }}
        onConfirm={() => void confirmCancel()}
        title="Bỏ báo cáo đang nhập?"
        message="Các công việc và tệp vừa thêm sẽ bị xóa khỏi báo cáo."
        confirmText="Bỏ báo cáo"
        cancelText="Tiếp tục nhập"
        variant="danger"
        isLoading={isCancelling}
      />
    </form>
  );
};
