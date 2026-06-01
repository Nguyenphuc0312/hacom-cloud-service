import React, { useState } from "react";
import { SaveIcon, XIcon } from "lucide-react";
import clsx from "clsx";
import type { WorkReportFormRequest } from "../types";
import { submitWorkReport } from "../services/aiChatApi";

interface WorkReportFormProps {
  data: WorkReportFormRequest;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

function formatDateVN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

const FIELD_KEYS = ["task_name", "requirements", "completed", "difficulties"] as const;

export const WorkReportForm: React.FC<WorkReportFormProps> = ({ data, onSuccess, onCancel }) => {
  const [values, setValues] = useState({
    task_name: data.existing?.task_name ?? "",
    requirements: data.existing?.requirements ?? "",
    completed: data.existing?.completed ?? "",
    difficulties: data.existing?.difficulties ?? "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: typeof FIELD_KEYS[number], value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.task_name.trim()) {
      setError("Tên công việc không được để trống");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await submitWorkReport({
        employee_code: data.employee_code,
        report_date: data.date,
        task_name: values.task_name,
        requirements: values.requirements,
        completed: values.completed,
        difficulties: values.difficulties,
      });
      onSuccess(`✅ Đã lưu báo cáo ngày ${formatDateVN(data.date)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu báo cáo");
    } finally {
      setIsSubmitting(false);
    }
  };

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

      {/* Desktop: 4-column table layout */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-4 border-b border-border">
          {FIELD_KEYS.map((key) => (
            <div
              key={key}
              className="px-3 py-2 text-xs font-medium text-text-secondary border-r border-border last:border-r-0 bg-surface-overlay/30"
            >
              {data.field_labels[key] ?? key}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4">
          {FIELD_KEYS.map((key) => (
            <div key={key} className="border-r border-border last:border-r-0">
              <textarea
                value={values[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={data.field_labels[key] ?? key}
                rows={5}
                disabled={isSubmitting}
                className={clsx(
                  "w-full resize-none px-3 py-2 text-sm bg-transparent text-text-primary",
                  "placeholder:text-text-muted outline-none",
                  "focus:bg-[#1976D2]/4 transition-colors",
                  isSubmitting && "opacity-50",
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked layout */}
      <div className="sm:hidden px-4 py-3 flex flex-col gap-3">
        {FIELD_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              {data.field_labels[key] ?? key}
              {key === "task_name" && <span className="text-danger ml-1">*</span>}
            </label>
            <textarea
              value={values[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              rows={3}
              disabled={isSubmitting}
              className={clsx(
                "w-full resize-none rounded-lg border border-border px-3 py-2 text-sm",
                "bg-transparent text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25",
                isSubmitting && "opacity-50",
              )}
            />
          </div>
        ))}
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
