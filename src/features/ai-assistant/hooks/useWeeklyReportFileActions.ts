import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  downloadPersonalWeeklyReportFile,
  openPersonalWeeklyReportFilePreview,
  resolveWeeklyReportFilename,
  AiApiError,
} from "../services/aiChatApi";
import { isDownloadLinkLabel } from "../utils/weeklyReportFileLink";
import type { WeeklyReportFilePreviewState } from "../components/AiWeeklyReportFilePreviewModal";
import { resolveWeeklyReportFileAction } from "../utils/weeklyReportFileLink";
import { toast } from "../../../utils/toast";

export function useWeeklyReportFileActions() {
  const { t } = useTranslation("aiAssistant");
  const [preview, setPreview] = useState<WeeklyReportFilePreviewState | null>(
    null,
  );
  const [busyFileId, setBusyFileId] = useState<number | null>(null);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.blobUrl) {
        URL.revokeObjectURL(current.blobUrl);
      }
      return null;
    });
  }, []);

  const handleView = useCallback(
    async (fileId: number, fallbackFilename?: string) => {
      setBusyFileId(fileId);
      try {
        const resolvedName = await resolveWeeklyReportFilename(
          fileId,
          isDownloadLinkLabel(fallbackFilename ?? "")
            ? undefined
            : fallbackFilename,
        );
        const result = await openPersonalWeeklyReportFilePreview(
          fileId,
          resolvedName,
        );
        const blobUrl = URL.createObjectURL(result.blob);
        setPreview((current) => {
          if (current?.blobUrl) URL.revokeObjectURL(current.blobUrl);
          return {
            blobUrl,
            filename: result.filename,
            mimeType: result.mimeType,
          };
        });
      } catch (err) {
        let message = t("weeklyReport.viewError");
        if (err instanceof AiApiError && err.kind === "network") {
          message = t("chat.errorNetwork");
        }
        toast.error(message);
      } finally {
        setBusyFileId(null);
      }
    },
    [t],
  );

  const handleDownload = useCallback(
    async (fileId: number, fallbackFilename?: string) => {
      setBusyFileId(fileId);
      try {
        const resolvedName = await resolveWeeklyReportFilename(
          fileId,
          isDownloadLinkLabel(fallbackFilename ?? "")
            ? undefined
            : fallbackFilename,
        );
        await downloadPersonalWeeklyReportFile(fileId, resolvedName);
        toast.success(t("weeklyReport.downloadStarted"));
      } catch (err) {
        let message = t("weeklyReport.downloadError");
        if (err instanceof AiApiError && err.kind === "network") {
          message = t("chat.errorNetwork");
        }
        toast.error(message);
      } finally {
        setBusyFileId(null);
      }
    },
    [t],
  );

  const handleLinkClick = useCallback(
    (href: string | undefined, linkLabel: string) => {
      const action = resolveWeeklyReportFileAction(href, linkLabel);
      if (!action) return false;

      const filename =
        action.mode === "view" ? linkLabel.trim() || undefined : undefined;

      if (action.mode === "view") {
        void handleView(action.fileId, filename);
      } else {
        void handleDownload(action.fileId, filename);
      }
      return true;
    },
    [handleView, handleDownload],
  );

  return {
    handleView,
    handleDownload,
    handleLinkClick,
    busyFileId,
    preview,
    closePreview,
  };
}
