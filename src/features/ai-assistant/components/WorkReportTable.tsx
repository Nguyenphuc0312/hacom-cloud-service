import React, { useState } from "react";
import {
  PrinterIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2Icon,
  FileIcon,
} from "lucide-react";
import type {
  WorkReportRecord,
  WorkReportTaskItem,
  WorkReportAttachment,
} from "../types";
import { downloadWorkReportFile } from "../services/aiChatApi";

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// notes nằm ở cấp report (r.notes), không phải trong task
function getTaskList(r: WorkReportRecord): WorkReportTaskItem[] {
  if (r.tasks && r.tasks.length > 0) return r.tasks;
  return [{
    task_name: r.task_name ?? "",
    requirements: r.requirements ?? "",
    completed: r.completed ?? "",
    difficulties: r.difficulties ?? "",
  }];
}

const ExpandedDetail: React.FC<{ tasks: WorkReportTaskItem[]; reportNotes?: string }> = ({ tasks, reportNotes }) => (
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
        {/* Ghi chú riêng của task này */}
        {t.notes && (
          <div className="mt-0.5 text-xs text-text-secondary whitespace-pre-wrap break-words">
            <span className="font-medium">Ghi chú:</span> {t.notes}
          </div>
        )}
      </div>
    ))}
    {/* Fallback: nếu backend trả notes ở cấp report (dữ liệu cũ) và không có per-task notes */}
    {reportNotes && !tasks.some((t) => t.notes) && (
      <div className="mt-1 pt-2 border-t border-border/40 text-xs text-text-secondary whitespace-pre-wrap break-words">
        <span className="font-medium">Ghi chú:</span> {reportNotes}
      </div>
    )}
  </div>
);

const AttachmentList: React.FC<{
  attachments: WorkReportAttachment[];
  downloadingId: number | null;
  onDownload: (att: WorkReportAttachment) => void;
}> = ({ attachments, downloadingId, onDownload }) => {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border/40 flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">📎 Đính kèm</span>
      {attachments.map((att) => (
        <button
          key={att.id}
          type="button"
          onClick={() => onDownload(att)}
          disabled={downloadingId === att.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay/40 px-2.5 py-1.5 text-left transition-colors hover:bg-[#1976D2]/8 disabled:opacity-50"
          title="Tải về"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#1976D2]/8 text-[#1565C0]">
            <FileIcon size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-text-primary">
              {att.original_filename}
            </span>
            {formatFileSize(att.file_size) && (
              <span className="block text-[10px] text-text-muted">
                {formatFileSize(att.file_size)}
              </span>
            )}
          </span>
          {downloadingId === att.id ? (
            <Loader2Icon size={14} className="shrink-0 animate-spin text-[#1565C0]" />
          ) : (
            <DownloadIcon size={14} className="shrink-0 text-text-muted" />
          )}
        </button>
      ))}
    </div>
  );
};

export const WorkReportTable: React.FC<WorkReportTableProps> = ({
  reports,
  departments,
  startDate,
  endDate,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);

  const handleDownloadAttachment = async (att: WorkReportAttachment) => {
    setDownloadingFileId(att.id);
    try {
      await downloadWorkReportFile(att.id, att.original_filename);
    } catch {
      /* lỗi tải — bỏ qua, người dùng có thể thử lại */
    } finally {
      setDownloadingFileId(null);
    }
  };

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
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const dateRange = `${formatDateVN(startDate)} – ${formatDateVN(endDate)}`;

    const tableRows = reports
      .map((r) => {
        const tasks = getTaskList(r);
        const count = tasks.length;
        return tasks
          .map((t, ti) => {
            const isFirst = ti === 0;
            const rs = count > 1 ? ` rowspan="${count}"` : "";
            // notes per-task; fallback về report-level notes cho dữ liệu cũ
            const taskNotes = t.notes || (isFirst && !tasks.some((x) => x.notes) ? r.notes || "" : "");
            return `<tr>
              ${isFirst ? `<td${rs}>${escHtml(r.user_name)}<br/><span class="dept">${escHtml(r.department)}</span></td>` : ""}
              ${isFirst ? `<td${rs} class="nowrap">${formatDateVN(r.date)}</td>` : ""}
              <td>${count > 1 ? `<b>${ti + 1}.</b> ` : ""}${escHtml(t.task_name || "—")}</td>
              <td>${escHtml(t.requirements || "")}</td>
              <td>${escHtml(t.completed || "")}</td>
              <td>${escHtml(t.difficulties || "")}</td>
              <td>${escHtml(taskNotes)}</td>
            </tr>`;
          })
          .join("");
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>Báo cáo công việc – ${escHtml(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#111}
    h2{text-align:center;font-size:14px;text-transform:uppercase;margin-bottom:4px}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #bbb;padding:5px 7px;vertical-align:top;word-break:break-word}
    th{background:#e8eef7;font-size:11px;text-align:left}
    .dept{color:#666;font-size:10px}
    .nowrap{white-space:nowrap}
    @media print{@page{margin:1.5cm}}
  </style>
</head>
<body>
  <h2>Báo cáo công việc — ${escHtml(title)}</h2>
  <p class="sub">${escHtml(dateRange)} · ${reports.length} báo cáo</p>
  <table>
    <thead>
      <tr>
        <th>Nhân viên</th>
        <th>Ngày</th>
        <th>Công việc</th>
        <th>Yêu cầu</th>
        <th>Đã làm</th>
        <th>Khó khăn</th>
        <th>Ghi chú</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
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
              // Ưu tiên notes của task đầu; fallback về notes cấp report (dữ liệu cũ)
              const previewNotes = firstTask.notes || r.notes || "";

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
                      {previewNotes && !isExpanded && (
                        <div className="mt-0.5 text-xs text-text-secondary truncate max-w-xs">
                          <span className="font-medium">Ghi chú:</span> {previewNotes}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="border-b border-border last:border-b-0 bg-[#1976D2]/3">
                      <td className="px-2 py-1" />
                      <td colSpan={3} className="px-4 py-3">
                        <ExpandedDetail tasks={tasks} reportNotes={r.notes} />
                        {r.attachments && r.attachments.length > 0 && (
                          <AttachmentList
                            attachments={r.attachments}
                            downloadingId={downloadingFileId}
                            onDownload={handleDownloadAttachment}
                          />
                        )}
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
