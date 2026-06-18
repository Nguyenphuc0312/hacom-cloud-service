import React, { useMemo } from "react";
import { BarChart2Icon, XIcon, CalendarDaysIcon } from "lucide-react";

interface ReportTextBoxProps {
  /** Nội dung báo cáo (gom từ các event `token`, hoặc `answer` của `done`). */
  content: string;
  /** Đang stream token — hiện chỉ báo đang tải ở cuối. */
  isStreaming?: boolean;
  onCancel: () => void;
}

interface ReportTask {
  taskName: string;
  requirements?: string;
  completed?: string;
  difficulties?: string;
  notes?: string;
}

interface ReportDay {
  date: string; // dd/mm/yyyy
  tasks: ReportTask[];
}

interface ParsedReport {
  employeeLine?: string;
  days: ReportDay[];
}

type TaskField = "requirements" | "completed" | "difficulties" | "notes";

/**
 * Parse một dòng công việc do BE trả. Định dạng (các trường nối nhau bằng " - "):
 *   <Tên công việc> - Yêu cầu: ... - Đã làm được: ... - Khó khăn: ... - Ghi chú: ... - Date: yyyy-mm-dd
 * Phần đầu (trước marker " - Yêu cầu:" đầu tiên) là tên công việc. "Date" bị bỏ qua.
 * Nhãn "Công việc:" ở đầu (nếu có) cũng được bỏ.
 */
function parseTaskLine(line: string): ReportTask {
  const labelToKey: Record<string, TaskField | "skip"> = {
    "yêu cầu": "requirements",
    "đã làm được": "completed",
    "đã làm": "completed",
    "khó khăn": "difficulties",
    "ghi chú": "notes",
    date: "skip",
  };

  // Delimiter: " - <Nhãn>:" — yêu cầu dấu gạch + nhãn đã biết, nên dấu "-" nằm
  // trong tên công việc sẽ không bị nhầm là delimiter.
  const re =
    /\s*-\s*(Yêu cầu|Đã làm được|Đã làm|Khó khăn|Ghi chú|Date)\s*:\s*/gi;

  const marks: Array<{ start: number; end: number; key: TaskField | "skip" }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    marks.push({
      start: m.index,
      end: m.index + m[0].length,
      key: labelToKey[m[1].toLowerCase()] ?? "skip",
    });
  }

  const head = (marks.length ? line.slice(0, marks[0].start) : line).trim();
  const taskName = head.replace(/^công việc\s*:\s*/i, "").trim();

  const task: ReportTask = { taskName };
  for (let i = 0; i < marks.length; i++) {
    const valEnd = i + 1 < marks.length ? marks[i + 1].start : line.length;
    const value = line.slice(marks[i].end, valEnd).trim();
    if (marks[i].key !== "skip" && value) task[marks[i].key as TaskField] = value;
  }
  return task;
}

// Thứ tự trường khi BE trả mỗi giá trị trên một dòng (không nhãn).
const POSITIONAL_FIELDS: TaskField[] = ["requirements", "completed", "difficulties"];

// Định dạng A: cả công việc trên một dòng, các trường nối bằng " - <Nhãn>:".
const INLINE_LABELED_RE =
  /\s-\s*(yêu cầu|đã làm được|đã làm|khó khăn|ghi chú|date)\s*:/i;

// Định dạng C: mỗi trường một dòng, có nhãn, thường có tiền tố "- " (vd "- Yêu cầu: ...").
const FIELD_LINE_RE =
  /^[-*•]?\s*(yêu cầu|đã làm được|đã làm|khó khăn|ghi chú|date)\s*:\s*(.*)$/i;

const FIELD_LABEL_TO_KEY: Record<string, TaskField | "skip"> = {
  "yêu cầu": "requirements",
  "đã làm được": "completed",
  "đã làm": "completed",
  "khó khăn": "difficulties",
  "ghi chú": "notes",
  date: "skip",
};

/**
 * Parse danh sách công việc trong MỘT ngày. Tự nhận diện:
 *
 * (A) Mỗi công việc một dòng, có nhãn nối bằng " - <Nhãn>:".
 * (C) Mỗi trường một dòng, có nhãn (vd "- Yêu cầu: ..."); dòng không nhãn = tên
 *     công việc mới (bỏ tiền tố "Công việc:"). "Date" bị bỏ qua.
 * (B) Mỗi trường một dòng, KHÔNG nhãn — gom 4 dòng liên tiếp thành 1 công việc.
 *
 * Chỉ dùng (B) khi cả ngày không có dòng nào mang nhãn — tránh để nhãn lọt vào ô.
 */
function parseDayTasks(lines: string[]): ReportTask[] {
  const hasLabels = lines.some(
    (l) => FIELD_LINE_RE.test(l.trim()) || INLINE_LABELED_RE.test(l.trim()),
  );

  // (B) Không có nhãn → gom theo vị trí.
  if (!hasLabels) {
    const tasks: ReportTask[] = [];
    for (let i = 0; i < lines.length; i += 4) {
      const grp = lines.slice(i, i + 4);
      const task: ReportTask = { taskName: grp[0] ?? "" };
      POSITIONAL_FIELDS.forEach((key, j) => {
        const v = grp[j + 1];
        if (v) task[key] = v;
      });
      tasks.push(task);
    }
    return tasks;
  }

  // (A) + (C) — chế độ có nhãn.
  const tasks: ReportTask[] = [];
  let cur: ReportTask | null = null;
  let pendingNotes: ReportTask | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Dòng Date đứng riêng (yyyy-mm-dd).
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) continue;

    // Trường có nhãn trên một dòng (định dạng C).
    const fieldMatch = line.match(FIELD_LINE_RE);
    if (fieldMatch) {
      const key = FIELD_LABEL_TO_KEY[fieldMatch[1].toLowerCase()] ?? "skip";
      const value = fieldMatch[2].trim();
      if (key === "skip") {
        pendingNotes = null;
        continue;
      }
      if (!cur) {
        cur = { taskName: "" };
        tasks.push(cur);
      }
      if (key === "notes" && !value) {
        pendingNotes = cur; // nội dung ghi chú nằm ở dòng kế tiếp
        continue;
      }
      if (value) cur[key] = value;
      pendingNotes = null;
      continue;
    }

    // Cả công việc trên một dòng có nhãn (định dạng A).
    if (INLINE_LABELED_RE.test(line)) {
      cur = parseTaskLine(line);
      tasks.push(cur);
      pendingNotes = null;
      continue;
    }

    // Dòng kế sau "Ghi chú:" trống → nội dung ghi chú.
    if (pendingNotes) {
      pendingNotes.notes = line;
      pendingNotes = null;
      continue;
    }

    // Còn lại = dòng tên công việc mới (bỏ tiền tố "Công việc:").
    cur = { taskName: line.replace(/^công việc\s*:\s*/i, "").trim() };
    tasks.push(cur);
    pendingNotes = null;
  }

  return tasks;
}

/**
 * Parse text báo cáo do BE trả qua `token`.
 *
 * Khung chung:
 *   Báo cáo công việc của <Tên>
 *   N ngày · M công việc       ← bỏ qua (component tự tính lại)
 *   dd/mm/yyyy                  ← dòng ngày (chấp nhận cả [dd/mm/yyyy])
 *   ...công việc... (định dạng A/B/C — xem parseDayTasks)
 *
 * Không nhận diện được ngày nào → days rỗng, caller render text thô.
 */
function parseReport(content: string): ParsedReport {
  const lines = content.split(/\r?\n/);
  const days: ReportDay[] = [];
  let employeeLine: string | undefined;

  // Gom dòng thô của ngày hiện tại; parse khi gặp ngày mới / kết thúc.
  let curDay: ReportDay | null = null;
  let dayLines: string[] = [];

  const flushDay = () => {
    if (curDay) curDay.tasks = parseDayTasks(dayLines);
    dayLines = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const dateMatch = line.match(/^\[?(\d{1,2}\/\d{1,2}\/\d{4})\]?$/);
    if (dateMatch) {
      flushDay();
      curDay = { date: dateMatch[1], tasks: [] };
      days.push(curDay);
      continue;
    }

    if (!curDay && /^báo cáo công việc/i.test(line)) {
      employeeLine = line.replace(/\s*:\s*$/, "");
      continue;
    }

    // Dòng tóm tắt "N ngày · M công việc" — bỏ qua.
    if (/\d+\s*ngày\s*·/i.test(line)) continue;
    if (!curDay) continue;

    dayLines.push(line);
  }

  flushDay();
  return { employeeLine, days };
}

const Field: React.FC<{ label: string; value?: string }> = ({ label, value }) => {
  if (!value?.trim()) return null;
  return (
    <div className="mt-1 text-xs leading-[1.5]">
      <span className="font-medium text-text-secondary">{label}: </span>
      <span className="whitespace-pre-wrap break-words text-text-primary">{value}</span>
    </div>
  );
};

/** Cột bảng — khớp với header của form #baocaocongviec (WorkReportForm). */
const TASK_COLUMNS: Array<{ label: string; key: keyof ReportTask }> = [
  { label: "Tên công việc", key: "taskName" },
  { label: "Yêu cầu", key: "requirements" },
  { label: "Đã làm được", key: "completed" },
  { label: "Khó khăn", key: "difficulties" },
];

const COL_TEMPLATE = "1fr 1fr 1fr 1fr";

const Cell: React.FC<{ value?: string }> = ({ value }) => (
  <div className="whitespace-pre-wrap break-words px-3 py-2 text-sm text-text-primary">
    {value?.trim() || <span className="text-text-muted">—</span>}
  </div>
);

/**
 * Render báo cáo theo bảng cột giống form #baocaocongviec (read-only):
 * header ngày → cột Tên công việc / Yêu cầu / Đã làm được / Khó khăn → dòng Ghi chú.
 */
const DayCard: React.FC<{ day: ReportDay }> = ({ day }) => (
  <div className="overflow-hidden rounded-xl border border-border bg-surface">
    {/* Header ngày */}
    <div className="flex items-center gap-1.5 border-b border-border bg-[#1976D2]/8 px-4 py-2.5">
      <CalendarDaysIcon size={14} className="text-[#1565C0]" />
      <span className="text-sm font-semibold text-[#1565C0]">
        Báo cáo công việc ngày {day.date}
      </span>
    </div>

    {/* Desktop: bảng cột */}
    <div className="hidden sm:block">
      <div
        className="grid border-b border-border"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >
        {TASK_COLUMNS.map((c) => (
          <div
            key={c.key}
            className="border-r border-border px-3 py-2 text-xs font-medium text-text-secondary last:border-r-0 bg-surface-overlay/30"
          >
            {c.label}
          </div>
        ))}
      </div>

      {day.tasks.length === 0 && (
        <div className="px-3 py-3 text-xs italic text-text-muted">
          Không có nội dung
        </div>
      )}

      {day.tasks.map((task, i) => (
        <div key={i} className="border-b border-border last:border-b-0">
          <div className="grid" style={{ gridTemplateColumns: COL_TEMPLATE }}>
            {TASK_COLUMNS.map((c) => (
              <div key={c.key} className="border-r border-border last:border-r-0">
                <Cell value={task[c.key]} />
              </div>
            ))}
          </div>
          {task.notes?.trim() && (
            <div className="flex items-start gap-2 border-t border-border/50 px-3 py-1.5">
              <span className="min-w-[3.5rem] whitespace-nowrap pt-0.5 text-xs font-medium text-text-secondary">
                Ghi chú:
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words text-sm text-text-primary">
                {task.notes}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>

    {/* Mobile: xếp dọc theo nhãn */}
    <div className="flex flex-col gap-3 px-3 py-2.5 sm:hidden">
      {day.tasks.length === 0 && (
        <span className="text-xs italic text-text-muted">Không có nội dung</span>
      )}
      {day.tasks.map((task, i) => (
        <div key={i} className={i > 0 ? "border-t border-border/40 pt-3" : ""}>
          <div className="break-words text-sm font-medium text-text-primary">
            {day.tasks.length > 1 && (
              <span className="mr-1 text-[#1565C0]">{i + 1}.</span>
            )}
            {task.taskName || <span className="italic text-text-muted">—</span>}
          </div>
          <Field label="Yêu cầu" value={task.requirements} />
          <Field label="Đã làm được" value={task.completed} />
          <Field label="Khó khăn" value={task.difficulties} />
          <Field label="Ghi chú" value={task.notes} />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Bordered box hiển thị báo cáo công việc của user thường cho `#baocaocv`.
 * Khi BE trả `token` (thay vì `selection_request`), nội dung báo cáo của bản
 * thân user được hiển thị ở đây thay cho DepartmentSelector.
 * Tham khảo style của WorkReportTable (header xanh, card, label/value).
 */
export const ReportTextBox: React.FC<ReportTextBoxProps> = ({
  content,
  isStreaming,
  onCancel,
}) => {
  const parsed = useMemo(() => parseReport(content), [content]);
  const hasStructure = parsed.days.length > 0;
  const totalTasks = useMemo(
    () => parsed.days.reduce((sum, d) => sum + d.tasks.length, 0),
    [parsed.days],
  );

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border bg-[#1976D2]/8 px-4 py-3">
        <BarChart2Icon size={15} className="text-[#1565C0]" />
        <h3 className="text-sm font-semibold text-[#1565C0]">
          Xem báo cáo công việc
        </h3>
      </div>

      {/* Body */}
      {hasStructure ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          {parsed.employeeLine && (
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {parsed.employeeLine}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {parsed.days.length} ngày · {totalTasks} công việc
              </p>
            </div>
          )}
          {parsed.days.map((day, i) => (
            <DayCard key={`${day.date}-${i}`} day={day} />
          ))}
        </div>
      ) : content.trim() ? (
        <div className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-[1.5] text-text-primary">
          {content}
        </div>
      ) : (
        !isStreaming && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            Không có báo cáo công việc nào trong khoảng thời gian này.
          </p>
        )
      )}

      {/* Đang tải */}
      {isStreaming && (
        <div className="flex items-center gap-2 px-4 pb-3 text-xs text-text-muted">
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
                style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
              />
            ))}
          </div>
          Đang tải báo cáo…
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-overlay/20 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover"
        >
          <XIcon size={14} />
          Hủy
        </button>
      </div>
    </div>
  );
};
