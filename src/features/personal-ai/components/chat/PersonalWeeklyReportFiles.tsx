import React, { useCallback, useEffect, useState } from "react";
import {
  FileTextIcon,
  Loader2Icon,
  RefreshCwIcon,
  DownloadIcon,
  EyeIcon,
} from "lucide-react";
import clsx from "clsx";
import type { WeeklyReportFileItem } from "../../../ai-assistant/services/aiChatApi";
import {
  listPersonalWeeklyReportFiles,
  openWeeklyReportFile,
} from "../../api/personalAiApi";
import { useAuthStore } from "../../../../stores/authStore";

function cellValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

function weekRange(item: WeeklyReportFileItem): string {
  if (item.week_start && item.week_end) return `${item.week_start} → ${item.week_end}`;
  if (item.week_start) return item.week_start;
  if (item.week_end) return item.week_end;
  return "—";
}

/**
 * Danh sách file báo cáo tuần hiển thị inline trong chat (#tongcvtuan).
 * - Danh sách:  GET /api/chat/personal/weekly-report/files
 * - Xem:        GET /api/chat/personal/weekly-report/files/{id}/view
 * - Tải về:     GET /api/chat/personal/weekly-report/files/{id}
 */
export const PersonalWeeklyReportFiles: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const employeeCode = user?.employeeCode ?? user?.employee_code ?? undefined;

  const [files, setFiles] = useState<WeeklyReportFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await listPersonalWeeklyReportFiles({
        employeeCode,
        limit: 200,
      });
      setFiles(items);
    } catch {
      setError("Không thể tải danh sách báo cáo tuần. Vui lòng thử lại.");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [employeeCode]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleAction = (fileId: number, mode: "view" | "download") => {
    if (busyFileId !== null) return;
    const viewTab = mode === "view" ? window.open("about:blank", "_blank") : null;
    setBusyFileId(fileId);
    openWeeklyReportFile(fileId, mode, viewTab)
      .catch(() => viewTab?.close())
      .finally(() => setBusyFileId(null));
  };

  return (
    <div className="w-full max-w-[860px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-[#1976D2]/8 px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#1565C0]">
          <FileTextIcon size={15} />
          Báo cáo công việc tuần
        </h3>
        <button
          type="button"
          onClick={() => void loadFiles()}
          disabled={isLoading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/12 disabled:opacity-50"
          title="Tải lại"
        >
          <RefreshCwIcon size={13} className={clsx(isLoading && "animate-spin")} />
          Tải lại
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
          <Loader2Icon size={16} className="animate-spin" />
          Đang tải danh sách báo cáo...
        </div>
      ) : error ? (
        <p className="px-3 py-6 text-center text-sm text-danger">{error}</p>
      ) : files.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-text-muted">
          Chưa có báo cáo tuần nào trong hệ thống
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {files.map((item) => {
            const label = item.filename?.trim() || `Báo cáo #${item.file_id}`;
            const isBusy = busyFileId === item.file_id;
            const meta = [
              cellValue(item.user_name),
              cellValue(item.department),
              cellValue(item.company),
            ].filter((v) => v !== "—");
            return (
              <div
                key={item.file_id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#1976D2]/6"
              >
                {/* Icon tệp */}
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1976D2]/8 text-[#1565C0]">
                  <FileTextIcon size={16} />
                </span>

                {/* Thông tin tệp */}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleAction(item.file_id, "view")}
                    disabled={isBusy}
                    className="flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-[#1565C0] hover:underline disabled:cursor-wait disabled:opacity-60"
                    title={`Xem ${label}`}
                  >
                    {isBusy ? (
                      <Loader2Icon size={13} className="shrink-0 animate-spin" />
                    ) : (
                      <EyeIcon size={13} className="shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                  {meta.length > 0 && (
                    <p className="mt-0.5 break-words text-xs text-text-secondary">
                      {meta.join(" · ")}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-text-muted">{weekRange(item)}</p>
                </div>

                {/* Tải về */}
                <button
                  type="button"
                  onClick={() => handleAction(item.file_id, "download")}
                  disabled={isBusy}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/12 disabled:opacity-60"
                  title="Tải về máy"
                >
                  <DownloadIcon size={13} />
                  <span className="hidden sm:inline">Tải về</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
