/**
 * Safe Office fallback for the in-app file preview.
 *
 * Office files stay inside the authenticated file flow. We deliberately do not
 * send signed URLs to a third-party viewer; the user can download the original
 * and open it with the installed Office application instead.
 */
import { Download } from "lucide-react";
import type { PreviewType } from "../../utils/mimeRegistry";
import { formatFileSize, getFileExtension } from "../../utils/filePreviewUtils";
import { truncateFilename } from "../../utils/truncateFilename";
import { FileTypeIcon } from "./FileTypeIcon";
import styles from "./PreviewPanel.module.css";

interface DocumentPreviewProps {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  previewType: PreviewType;
  canDownload?: boolean;
  onDownload?: () => void;
}

function getDocumentDescription(mimeType?: string): string {
  if (!mimeType) return "Tài liệu Office";
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return "Microsoft Word";
  if (mimeType.includes("spreadsheetml") || mimeType.includes("ms-excel")) return "Microsoft Excel";
  if (mimeType.includes("presentationml") || mimeType.includes("mspowerpoint")) return "Microsoft PowerPoint";
  return "Tài liệu Office";
}

export function DocumentPreview({
  fileName,
  fileSize,
  mimeType,
  previewType,
  canDownload = true,
  onDownload,
}: DocumentPreviewProps) {
  const iconType =
    previewType === "spreadsheet"
      ? "spreadsheet"
      : previewType === "presentation"
        ? "presentation"
        : "document";
  const extension = getFileExtension(fileName);
  const description = getDocumentDescription(mimeType);

  return (
    <div className={styles.card} role="status">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "#e7f5ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <FileTypeIcon type={iconType} fileName={fileName} size={26} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#25262b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={fileName}
          >
            {truncateFilename(fileName, 48)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {extension && (
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  border: "1px solid #dee2e6",
                  color: "#495057",
                }}
              >
                {extension}
              </span>
            )}
            <span style={{ fontSize: 12, color: "#868e96" }}>{formatFileSize(fileSize)}</span>
            <span style={{ fontSize: 12, color: "#868e96" }}>· {description}</span>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "#868e96", margin: "12px 0 0" }}>
        Tải bản gốc về để mở và chỉnh sửa bằng Microsoft Office hoặc ứng dụng phù hợp.
      </p>

      {onDownload && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "#228be6",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              cursor: canDownload ? "pointer" : "not-allowed",
              opacity: canDownload ? 1 : 0.55,
            }}
            onClick={onDownload}
            disabled={!canDownload}
          >
            <Download size={14} />
            Tải bản gốc
          </button>
        </div>
      )}
    </div>
  );
}

export default DocumentPreview;
