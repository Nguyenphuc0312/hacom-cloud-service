import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal, Button } from "../../../components/ui";
import { downloadResourceWithName } from "../../../utils/downloadFile";

interface CloudFilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  fileName?: string;
  contentType?: string;
  onDownload?: () => Promise<string | undefined>;
}

const isTextFile = (contentType?: string, fileName?: string): boolean =>
  Boolean(
    contentType?.startsWith("text/") ||
      /\.(?:txt|csv|json|md|log|xml|html?)$/i.test(fileName ?? ""),
  );

export const CloudFilePreviewModal: React.FC<CloudFilePreviewModalProps> = ({
  isOpen,
  onClose,
  url,
  fileName,
  contentType,
  onDownload,
}) => {
  const { t } = useTranslation("cloud");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !url || !isTextFile(contentType, fileName)) {
      setText(null);
      return undefined;
    }
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject()))
      .then(setText)
      .catch(() => {
        if (!controller.signal.aborted) setText(null);
      });
    return () => controller.abort();
  }, [contentType, fileName, isOpen, url]);

  const textPreview = isTextFile(contentType, fileName);
  const handleDownload = async () => {
    const resolvedUrl = onDownload ? await onDownload() : url;
    if (resolvedUrl) {
      await downloadResourceWithName(resolvedUrl, fileName || "cloud-file");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={fileName || t("filePreview.title")}
      size="full"
      contentClassName="max-h-[90dvh]"
      footer={
        <Button
          type="button"
          variant="secondary"
          leftIcon={<Download className="h-4 w-4" />}
          disabled={!url}
          onClick={() => void handleDownload()}
        >
          {t("filePreview.download")}
        </Button>
      }
    >
      {!url ? (
        <p className="text-sm text-text-muted">{t("filePreview.unavailable")}</p>
      ) : textPreview ? (
        <pre className="max-h-[65dvh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-overlay p-4 text-sm text-text-primary">
          {text ?? t("filePreview.loading")}
        </pre>
      ) : (
        <iframe
          title={fileName || t("filePreview.title")}
          src={url}
          className="h-[65dvh] w-full rounded-lg border border-border bg-white"
        />
      )}
    </Modal>
  );
};
