import React, { useState } from "react";
import { BarChart2Icon, XIcon } from "lucide-react";
import clsx from "clsx";
import type { DepartmentSelectionRequest, WorkReportRecord } from "../types";
import { fetchWorkReports } from "../services/aiChatApi";
import { WorkReportTable } from "./WorkReportTable";

interface DepartmentSelectorProps {
  data: DepartmentSelectionRequest;
  onCancel: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const DepartmentSelector: React.FC<DepartmentSelectorProps> = ({ data, onCancel }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(firstDayOfMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<WorkReportRecord[] | null>(null);

  const toggleDept = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleFetch = async () => {
    if (selected.length === 0) {
      setError("Vui lòng chọn ít nhất một phòng ban");
      return;
    }
    setError(null);
    setIsLoading(true);
    setReports(null);
    try {
      const requests = selected.map((dept) =>
        fetchWorkReports({ department: dept, start: startDate, end: endDate }),
      );
      const results = await Promise.all(requests);
      const all: WorkReportRecord[] = [];
      for (const res of results) {
        if (res.reports) all.push(...res.reports);
      }
      all.sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.user_name.localeCompare(b.user_name),
      );
      setReports(all);
    } catch {
      setError("Không thể tải báo cáo, vui lòng thử lại");
    } finally {
      setIsLoading(false);
    }
  };

  if (data.options.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-sm px-4 py-6 text-sm text-text-muted text-center">
        Chưa có báo cáo nào trong hệ thống
      </div>
    );
  }

  if (reports !== null) {
    return (
      <div className="flex flex-col gap-3">
        <WorkReportTable
          reports={reports}
          departments={selected}
          startDate={startDate}
          endDate={endDate}
        />
        <button
          onClick={() => setReports(null)}
          className="self-start text-xs text-text-muted hover:text-text-secondary underline"
        >
          ← Chọn lại
        </button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#1976D2]/8 border-b border-border">
        <h3 className="text-sm font-semibold text-[#1565C0]">Xem báo cáo công việc</h3>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4">
        {/* Department list */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">{data.title}</p>
          <div className="flex flex-col gap-1.5">
            {data.options.map((opt) => (
              <label
                key={opt.value}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  selected.includes(opt.value)
                    ? "bg-[#1976D2]/8 border border-[#1976D2]/30"
                    : "border border-transparent hover:bg-surface-hover",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleDept(opt.value)}
                  className="peer sr-only"
                />
                <span
                  className={clsx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selected.includes(opt.value)
                      ? "border-[#1565C0] bg-gradient-to-br from-[#1565C0] to-[#1976D2]"
                      : "border-border",
                  )}
                >
                  {selected.includes(opt.value) && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-sm text-text-primary">{opt.label}</span>
                <span className="text-xs text-text-muted">({opt.count} báo cáo)</span>
              </label>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary whitespace-nowrap">Từ ngày:</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary whitespace-nowrap">Đến ngày:</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayStr()}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-[#1976D2]/60 focus:ring-1 focus:ring-[#1565C0]/25"
            />
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-overlay/20">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <XIcon size={14} />
          Hủy
        </button>
        <button
          type="button"
          onClick={handleFetch}
          disabled={isLoading || selected.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#1976D2] to-[#1565C0] hover:brightness-105 transition-all disabled:opacity-50 shadow-sm"
        >
          <BarChart2Icon size={14} />
          {isLoading ? "Đang tải..." : "Xem báo cáo"}
        </button>
      </div>
    </div>
  );
};
