import React, { useState } from "react";
import { SaveIcon, XIcon, PlusIcon, Trash2Icon } from "lucide-react";
import clsx from "clsx";
import type { WorkReportFormRequest, WorkReportTaskItem } from "../types";
import { submitWorkReport } from "../services/aiChatApi";

interface WorkReportFormProps {
  data: WorkReportFormRequest;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

const TASK_KEYS = ["task_name", "requirements", "completed", "difficulties"] as const;
type TaskKey = typeof TASK_KEYS[number];

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
  // Backward compat: old flat-field records
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
  const showNotes = data.extra_fields?.includes("notes") ?? false;
  const notesLabel = data.extra_field_labels?.["notes"] ?? "Ghi chú";

  const [tasks, setTasks] = useState<WorkReportTaskItem[]>(() => initTasks(data));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTaskChange = (idx: number, field: TaskKey | "notes", value: string) => {
    setTasks((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const addTask = () => setTasks((prev) => [...prev, { ...EMPTY_TASK }]);

  const removeTask = (idx: number) => setTasks((prev) => prev.filter((_, i) => i !== idx));

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
        tasks: validTasks,
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
              {data.field_labels[key] ?? key}
            </div>
          ))}
          <div className="bg-surface-overlay/30" />
        </div>

        {/* Task rows */}
        {tasks.map((task, idx) => (
          <div key={idx} className="border-b border-border">
            {/* Main fields row */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2rem" }}
            >
              {TASK_KEYS.map((key) => (
                <div key={key} className="border-r border-border">
                  <textarea
                    value={task[key]}
                    onChange={(e) => handleTaskChange(idx, key, e.target.value)}
                    placeholder={data.field_labels[key] ?? key}
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

            {/* Notes sub-row (full width) */}
            {showNotes && (
              <div className="border-t border-border/50 px-3 py-1.5 flex items-start gap-2">
                <span className="text-xs font-medium text-text-secondary whitespace-nowrap pt-1.5 min-w-[3.5rem]">
                  {notesLabel}:
                </span>
                <textarea
                  value={task.notes ?? ""}
                  ref={(el) => autoResize(el)}
                  onChange={(e) => { handleTaskChange(idx, "notes", e.target.value); autoResize(e.target); }}
                  placeholder={notesLabel}
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
            )}
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
                  {data.field_labels[key] ?? key}
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

            {showNotes && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">{notesLabel}</label>
                <textarea
                  value={task.notes ?? ""}
                  ref={(el) => autoResize(el)}
                  onChange={(e) => { handleTaskChange(idx, "notes", e.target.value); autoResize(e.target); }}
                  rows={1}
                  disabled={isSubmitting}
                  className={clsx(textareaClassMobile, "overflow-hidden")}
                />
              </div>
            )}
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
