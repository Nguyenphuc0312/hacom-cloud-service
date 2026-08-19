import React from "react";
import { useTranslation } from "react-i18next";
import { FileTextIcon } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";

export interface WeeklyReportFilePreviewState {
  blobUrl: string;
  filename: string;
  mimeType: string;
}

interface AiWeeklyReportFilePreviewModalProps {
  preview: WeeklyReportFilePreviewState | null;
  onClose: () => void;
}

function canInlinePreview(mimeType: string, filename: string): boolean {
  if (mimeType.startsWith("image/")) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType.startsWith("text/")) return true;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "csv"].includes(
    ext,
  );
}

function isPdfPreview(mimeType: string, filename: string): boolean {
  return (
    mimeType === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf")
  );
}

export const AiWeeklyReportFilePreviewModal: React.FC<
  AiWeeklyReportFilePreviewModalProps
> = ({ preview, onClose }) => {
  const { t } = useTranslation("aiAssistant");

  if (!preview) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={preview.filename}
      size="full"
      contentClassName="max-w-5xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.open(preview.blobUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {t("weeklyReport.openInNewTab")}
          </Button>
          <Button type="button" onClick={onClose}>
            {t("weeklyReport.closePreview")}
          </Button>
        </div>
      }
    >
      {canInlinePreview(preview.mimeType, preview.filename) ? (
        isPdfPreview(preview.mimeType, preview.filename) ? (
          <iframe
            src={preview.blobUrl}
            title={preview.filename}
            className="h-[min(70vh,720px)] w-full rounded-lg border border-border bg-surface"
          />
        ) : preview.mimeType.startsWith("image/") ? (
          <img
            src={preview.blobUrl}
            alt={preview.filename}
            className="mx-auto max-h-[min(70vh,720px)] max-w-full rounded-lg object-contain"
          />
        ) : (
          <iframe
            src={preview.blobUrl}
            title={preview.filename}
            className="h-[min(70vh,720px)] w-full rounded-lg border border-border bg-surface"
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <FileTextIcon size={40} className="text-text-muted" />
          <p className="text-sm text-text-secondary">
            {t("weeklyReport.previewUnsupported")}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = preview.blobUrl;
              anchor.download = preview.filename;
              anchor.click();
            }}
          >
            {t("weeklyReport.download")}
          </Button>
        </div>
      )}
    </Modal>
  );
};
