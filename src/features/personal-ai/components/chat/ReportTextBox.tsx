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
 * Parse text báo cáo do BE trả qua `token`. Định dạng:
 *   Báo cáo công việc của <Tên> :
 *   [dd/mm/yyyy]
 *   Công việc: ...
 *   Yêu cầu: ...
 *   Đã làm được: ...
 *   Khó khăn: ...
 *   Ghi chú: ...
 *   Date: yyyy-mm-dd   ← bỏ qua (trùng với [dd/mm/yyyy])
 *
 * Nếu không nhận diện được ngày nào (vd: "Bạn chưa có báo cáo...") → days rỗng,
 * caller render text thô.
 */
function parseReport(content: string): ParsedReport {
  const lines = content.split(/\r?\n/);
  const days: ReportDay[] = [];
  let employeeLine: string | undefined;
  let curDay: ReportDay | null = null;
  let curTask: ReportTask | null = null;
  let lastField: TaskField | "taskName" | null = null;

  const fieldMap: Array<[RegExp, TaskField | "taskName"]> = [
    [/^công việc\s*:/i, "taskName"],
    [/^yêu cầu\s*:/i, "requirements"],
    [/^(đã làm được|đã làm)\s*:/i, "completed"],
    [/^khó khăn\s*:/i, "difficulties"],
    [/^ghi chú\s*:/i, "notes"],
  ];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const dateMatch = line.match(/^\[(\d{1,2}\/\d{1,2}\/\d{4})\]$/);
    if (dateMatch) {
      curDay = { date: dateMatch[1], tasks: [] };
      days.push(curDay);
      curTask = null;
      lastField = null;
      continue;
    }

    if (/^date\s*:/i.test(line)) continue;

    let matched = false;
    for (const [re, key] of fieldMap) {
      const m = line.match(re);
      if (!m) continue;
      matched = true;
      const value = line.slice(m[0].length).trim();
      if (key === "taskName") {
        curTask = { taskName: value };
        if (curDay) curDay.tasks.push(curTask);
        lastField = "taskName";
      } else if (curTask) {
        curTask[key] = value;
        lastField = key;
      }
      break;
    }
    if (matched) continue;

    if (!curDay && /^báo cáo công việc/i.test(line)) {
      employeeLine = line.replace(/\s*:\s*$/, "");
      continue;
    }

    // Dòng nối tiếp giá trị field nhiều dòng → ghép vào field gần nhất.
    if (curTask && lastField) {
      const prev = curTask[lastField] ?? "";
      curTask[lastField] = prev ? `${prev}\n${line}` : line;
    }
  }

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

const DayCard: React.FC<{ day: ReportDay }> = ({ day }) => (
  <div className="overflow-hidden rounded-xl border border-border bg-surface">
    <div className="flex items-center gap-1.5 border-b border-border bg-[#1976D2]/8 px-3 py-2">
      <CalendarDaysIcon size={13} className="text-[#1565C0]" />
      <span className="text-xs font-semibold text-[#1565C0]">{day.date}</span>
    </div>
    <div className="flex flex-col gap-3 px-3 py-2.5">
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
      ) : (
        <div className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-[1.5] text-text-primary">
          {content}
        </div>
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
