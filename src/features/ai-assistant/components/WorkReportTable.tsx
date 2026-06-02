import React from "react";
import { PrinterIcon } from "lucide-react";
import type { WorkReportRecord } from "../types";
import { AI_CHAT_BASE_URL } from "../../../services/ai-chat/constants";
import { getAccessToken } from "../../../services/tokenService";
import { createNormalizedURLSearchParams } from "../../../utils/unicodeNormalize";

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

function buildPrintUrl(departments: string[], start: string, end: string): string {
  const search = createNormalizedURLSearchParams({
    ...(departments.length === 1 && { department: departments[0] }),
    start,
    end,
  });
  return `${AI_CHAT_BASE_URL}/api/work-reports/print?${search.toString()}`;
}

export const WorkReportTable: React.FC<WorkReportTableProps> = ({
  reports,
  departments,
  startDate,
  endDate,
}) => {
  const title =
    departments.length === 1
      ? departments[0]
      : `${departments.length} phòng ban`;

  const handlePrint = () => {
    const token = getAccessToken();
    const url = buildPrintUrl(departments, startDate, endDate);
    // Open with token as query param (fallback) since window.open can't set headers
    const separator = url.includes("?") ? "&" : "?";
    window.open(token ? `${url}${separator}token=${encodeURIComponent(token)}` : url, "_blank");
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
          title="In báo cáo"
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
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary whitespace-nowrap">
                Nhân viên
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary whitespace-nowrap">
                Ngày
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">
                Tên công việc / Yêu cầu
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">
                Đã làm được / Khó khăn
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => (
              <tr
                key={`${r.user_id}-${r.date}-${i}`}
                className="border-b border-border last:border-b-0 hover:bg-surface-overlay/20 transition-colors"
              >
                <td className="px-3 py-2.5 align-top whitespace-nowrap">
                  <div className="text-sm font-medium text-text-primary">{r.user_name}</div>
                  <div className="text-xs text-text-muted">{r.department}</div>
                </td>
                <td className="px-3 py-2.5 align-top whitespace-nowrap text-sm text-text-secondary">
                  {formatDateVN(r.date)}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="text-sm text-text-primary whitespace-pre-wrap break-words">{r.task_name}</div>
                  {r.requirements && (
                    <div className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-words">
                      <span className="font-medium">Yêu cầu:</span> {r.requirements}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {r.completed && (
                    <div className="text-sm text-text-primary whitespace-pre-wrap break-words">{r.completed}</div>
                  )}
                  {r.difficulties && (
                    <div className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-words">
                      <span className="font-medium">Khó khăn:</span> {r.difficulties}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
