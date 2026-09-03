import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileTextIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import {
  AiApiError,
  listPersonalWeeklyReportFiles,
  type WeeklyReportFileItem,
} from "../services/aiChatApi";
import { useWeeklyReportFileActions } from "../hooks/useWeeklyReportFileActions";
import { AiWeeklyReportFilePreviewModal } from "./AiWeeklyReportFilePreviewModal";
import { toast } from "../../../utils/toast";
import { DateFieldVN } from "../../../components/ui/DateFieldVN";
import { useIsoDateField } from "../../../components/ui/dateFieldVNUtils";

interface AiWeeklyReportFilesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCompany?: string;
  onUploadNew?: () => void;
  refreshKey?: number;
}

function cellValue(value: string | undefined): string {
  return value?.trim() ? value : "—";
}

function parseWeekDates(item: WeeklyReportFileItem): [string, string] | [string] | null {
  if (item.week_start && item.week_end) return [item.week_start, item.week_end];
  if (item.week_start) {
    const parts = item.week_start.split(/\s*(?:->|→|–|-)\s*/);
    if (parts.length === 2 && parts[1]) return [parts[0], parts[1]];
    return [item.week_start];
  }
  if (item.week_end) return [item.week_end];
  return null;
}

export const AiWeeklyReportFilesDialog: React.FC<
  AiWeeklyReportFilesDialogProps
> = ({ isOpen, onClose, defaultCompany = "", onUploadNew, refreshKey = 0 }) => {
  const { t } = useTranslation("aiAssistant");
  const [files, setFiles] = useState<WeeklyReportFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [company, setCompany] = useState(defaultCompany);

  // State giữ ISO cho API; ô nhập hiển thị dd/mm/yyyy.
  const weekStartField = useIsoDateField(weekStart, setWeekStart);
  const weekEndField = useIsoDateField(weekEnd, setWeekEnd);

  const {
    handleView,
    handleDownload,
    busyFileId,
    preview,
    closePreview,
  } = useWeeklyReportFileActions();

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await listPersonalWeeklyReportFiles({
        week_start: weekStart || undefined,
        week_end: weekEnd || undefined,
        company: company || undefined,
        limit: 200,
      });
      setFiles(items);
    } catch (err) {
      let message = t("weeklyReport.listError");
      if (err instanceof AiApiError) {
        if (err.kind === "timeout") message = t("chat.errorTimeout");
        if (err.kind === "network") message = t("chat.errorNetwork");
      }
      toast.error(message);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [weekStart, weekEnd, company, t]);

  useEffect(() => {
    if (!isOpen) return;
    setCompany((prev) => prev || defaultCompany);
  }, [isOpen, defaultCompany]);

  useEffect(() => {
    if (!isOpen) return;
    void loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, refreshKey]);

  useEffect(() => {
    if (!isOpen) {
      closePreview();
    }
  }, [isOpen, closePreview]);

  const handleUploadNew = () => {
    onClose();
    onUploadNew?.();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t("weeklyReport.dialogTitle")}
        description={t("weeklyReport.dialogDescription")}
        size="full"
        contentClassName="max-w-5xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadFiles()}
              disabled={isLoading}
            >
              <RefreshCwIcon size={16} className="mr-1.5" />
              {t("weeklyReport.refresh")}
            </Button>
            {onUploadNew && (
              <Button type="button" onClick={handleUploadNew}>
                {t("weeklyReport.uploadNew")}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">
                {t("weeklyReport.weekStart")}
              </span>
              <DateFieldVN
                {...weekStartField}
                ariaLabel={t("weeklyReport.weekStart")}
                wrapClassName="rounded-lg border border-border bg-surface pr-1 focus-within:border-border-strong"
                className="w-full min-w-0 bg-transparent px-3 py-2 text-text-primary outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">{t("weeklyReport.weekEnd")}</span>
              <DateFieldVN
                {...weekEndField}
                ariaLabel={t("weeklyReport.weekEnd")}
                wrapClassName="rounded-lg border border-border bg-surface pr-1 focus-within:border-border-strong"
                className="w-full min-w-0 bg-transparent px-3 py-2 text-text-primary outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">{t("weeklyReport.company")}</span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t("weeklyReport.companyPlaceholder")}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
              />
            </label>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => void loadFiles()}
            disabled={isLoading}
          >
            {t("weeklyReport.applyFilters")}
          </Button>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader2Icon size={24} className="animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<FileTextIcon size={32} />}
              title={t("weeklyReport.emptyTitle")}
              description={t("weeklyReport.emptyDescription")}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2.5">{t("weeklyReport.colCompany")}</th>
                    <th className="px-3 py-2.5">{t("weeklyReport.colEmployee")}</th>
                    <th className="px-3 py-2.5">
                      {t("weeklyReport.colDepartment")}
                    </th>
                    <th className="px-3 py-2.5">{t("weeklyReport.colWeek")}</th>
                    <th className="px-3 py-2.5">{t("weeklyReport.colFile")}</th>
                    <th className="px-3 py-2.5 text-center">
                      {t("weeklyReport.colDownload")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {files.map((item) => {
                    const label =
                      item.filename ||
                      t("weeklyReport.unnamedFile", { id: item.file_id });
                    const isBusy = busyFileId === item.file_id;
                    const employee =
                      typeof item.employee_name === "string"
                        ? item.employee_name
                        : typeof item.employee === "string"
                          ? item.employee
                          : undefined;
                    const department =
                      typeof item.department === "string"
                        ? item.department
                        : undefined;

                    return (
                      <tr
                        key={item.file_id}
                        className="hover:bg-surface-hover/80"
                      >
                        <td className="px-3 py-2.5 text-text-secondary">
                          {cellValue(item.company)}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary">
                          {cellValue(employee)}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary">
                          {cellValue(department)}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary">
                          {(() => {
                            const dates = parseWeekDates(item);
                            if (!dates) return "—";
                            return (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span>{dates[0]}</span>
                                {dates[1] && <span className="text-text-muted">{dates[1]}</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="max-w-[240px] px-3 py-2.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleView(item.file_id, label)}
                            className="max-w-full truncate text-left text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
                            title={t("weeklyReport.viewFileHint", { name: label })}
                          >
                            {label}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleDownload(item.file_id, label)
                            }
                            className="text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
                          >
                            {isBusy ? (
                              <Loader2Icon
                                size={14}
                                className="inline animate-spin"
                              />
                            ) : (
                              t("weeklyReport.download")
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <AiWeeklyReportFilePreviewModal preview={preview} onClose={closePreview} />
    </>
  );
};
