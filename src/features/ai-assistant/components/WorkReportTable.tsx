import React, { useState } from "react";
import { PrinterIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { WorkReportRecord, WorkReportTaskItem } from "../types";
import { AI_CHAT_BASE_URL } from "../../../services/ai-chat/constants";
import { getAccessToken } from "../../../services/tokenService";

interface WorkReportTableProps {
  reports: WorkReportRecord[];
  departments: string[];
  startDate: string;
  endDate: string;
}

function formatDateVN(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function buildPrintUrl(
  departments: string[],
  start: string,
  end: string,
): string {
  const params = new URLSearchParams();
  for (const dept of departments) {
    params.append("department", dept.normalize("NFC"));
  }
  params.set("start", start);
  params.set("end", end);
  return `${AI_CHAT_BASE_URL}/api/work-reports/print?${params.toString()}`;
}

function getTaskList(r: WorkReportRecord): WorkReportTaskItem[] {
  if (r.tasks && r.tasks.length > 0) return r.tasks;
  return [{
    task_name: r.task_name ?? "",
    requirements: r.requirements ?? "",
    completed: r.completed ?? "",
    difficulties: r.difficulties ?? "",
  }];
}

const ExpandedDetail: React.FC<{ tasks: WorkReportTaskItem[] }> = ({ tasks }) => (
  <div className="flex flex-col gap-2">
    {tasks.map((t, i) => (
      <div key={i} className={i > 0 ? "pt-2 border-t border-border/40" : ""}>
        <div className="text-sm text-text-primary whitespace-pre-wrap break-words">
          {tasks.length > 1 && (
            <span className="font-semibold text-[#1565C0] mr-1">{i + 1}.</span>
          )}
          {t.task_name || <span className="text-text-muted italic">—</span>}
        </div>
        {t.requirements && (
          <div className="mt-0.5 text-xs text-text-muted whitespace-pre-wrap break-words">
            <span className="font-medium">Yêu cầu:</span> {t.requirements}
          </div>
        )}
        {t.completed && (
          <div className="mt-0.5 text-xs text-text-secondary whitespace-pre-wrap break-words">
            <span className="font-medium">Đã làm:</span> {t.completed}
          </div>
        )}
        {t.difficulties && (
          <div className="mt-0.5 text-xs text-text-muted whitespace-pre-wrap break-words">
            <span className="font-medium">Khó khăn:</span> {t.difficulties}
          </div>
        )}
        {t.notes && (
          <div className="mt-0.5 text-xs text-text-secondary whitespace-pre-wrap break-words">
            <span className="font-medium">Ghi chú:</span> {t.notes}
          </div>
        )}
      </div>
    ))}
  </div>
);

export const WorkReportTable: React.FC<WorkReportTableProps> = ({
  reports,
  departments,
  startDate,
  endDate,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const title =
    departments.length === 1
      ? departments[0]
      : `${departments.length} phòng ban`;

  const handlePrint = () => {
    const token = getAccessToken();
    const url = buildPrintUrl(departments, startDate, endDate);
    const separator = url.includes("?") ? "&" : "?";
    window.open(
      token ? `${url}${separator}token=${encodeURIComponent(token)}` : url,
      "_blank"
    );
  };

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-sm px-4 py-6 text-center text-sm text-text-muted">
        Không có báo cáo trong khoảng thời gian này
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1976D2]/8 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-[#1565C0]">
            Báo cáo công việc — {title}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {formatDateVN(startDate)} – {formatDateVN(endDate)} · {reports.length} báo cáo
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-surface-hover border border-border transition-colors"
          title="In báo cáo (đầy đủ chi tiết)"
        >
          <PrinterIcon size={13} />
          In
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-overlay/30 border-b border-border">
              <th className="w-6 px-2 py-2" />
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary whitespace-nowrap">
                Nhân viên
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary whitespace-nowrap">
                Ngày
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">
                Tóm tắt công việc
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const tasks = getTaskList(r);
              const isExpanded = expandedRows.has(i);
              const taskCount = tasks.length;
              const firstTask = tasks[0];
              const firstNotes = firstTask.notes;

              return (
                <React.Fragment key={`${r.user_id}-${r.date}-${i}`}>
                  {/* Summary row */}
                  <tr
                    className="border-b border-border last:border-b-0 hover:bg-surface-overlay/20 transition-colors cursor-pointer"
                    onClick={() => toggleRow(i)}
                  >
                    <td className="px-2 py-2.5 align-top text-text-muted">
                      {isExpanded
                        ? <ChevronDownIcon size={14} />
                        : <ChevronRightIcon size={14} />}
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                      <div className="text-sm font-medium text-text-primary">{r.user_name}</div>
                      <div className="text-xs text-text-muted">{r.department}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top whitespace-nowrap text-sm text-text-secondary">
                      {formatDateVN(r.date)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-sm text-text-primary truncate max-w-xs">
                        {firstTask.task_name || <span className="text-text-muted italic">—</span>}
                      </div>
                      {taskCount > 1 && (
                        <div className="mt-0.5 text-xs text-[#1565C0]">
                          +{taskCount - 1} công việc khác
                        </div>
                      )}
                      {firstNotes && !isExpanded && (
                        <div className="mt-0.5 text-xs text-text-secondary truncate max-w-xs">
                          <span className="font-medium">Ghi chú:</span> {firstNotes}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="border-b border-border last:border-b-0 bg-[#1976D2]/3">
                      <td className="px-2 py-1" />
                      <td colSpan={3} className="px-4 py-3">
                        <ExpandedDetail tasks={tasks} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
