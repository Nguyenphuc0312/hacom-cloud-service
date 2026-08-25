/**
 * @fileoverview Xem trước tài liệu Office qua Microsoft Office Online hoặc thẻ dự phòng.
 */
import { useCallback, useMemo, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import type { PreviewType } from '../../utils/mimeRegistry';
import { formatFileSize, getFileExtension } from '../../utils/filePreviewUtils';
import { truncateFilename } from '../../utils/truncateFilename';
import { downloadResourceWithName, openResourceInNewTab } from '../../utils/downloadFile';
import { FileTypeIcon } from './FileTypeIcon';
import styles from './PreviewPanel.module.css';

interface DocumentPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  previewType: PreviewType;
}

function getDocDescription(mimeType?: string): string {
  if (!mimeType) return '';
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'Microsoft Word';
  if (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')) return 'Microsoft Excel';
  if (mimeType.includes('presentationml') || mimeType.includes('mspowerpoint')) return 'Microsoft PowerPoint';
  return '';
}

function isPubliclyViewableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

const buildOfficeViewerUrl = (fileUrl: string): string =>
  `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;

export function DocumentPreview({ url, fileName, fileSize, mimeType, previewType }: DocumentPreviewProps) {
  const [iframeFailed, setIframeFailed] = useState(false);
  const iconType = previewType === 'spreadsheet' ? 'spreadsheet' : previewType === 'presentation' ? 'presentation' : 'document';
  const extension = getFileExtension(fileName);
  const docDescription = getDocDescription(mimeType);

  const handleDownload = useCallback(async () => {
    await downloadResourceWithName(url, fileName || 'document');
  }, [fileName, url]);
  const handleOpenInNewTab = useCallback(() => openResourceInNewTab(url, fileName, false), [fileName, url]);

  const canEmbed = useMemo(() => Boolean(url) && isPubliclyViewableUrl(url), [url]);
  const viewerUrl = useMemo(() => (canEmbed ? buildOfficeViewerUrl(url) : null), [canEmbed, url]);

  if (viewerUrl && !iframeFailed) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <FileTypeIcon type={iconType} fileName={fileName} size={24} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#25262b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
                {truncateFilename(fileName, 48)}
              </div>
              <div style={{ fontSize: 12, color: '#868e96' }}>
                {[extension, formatFileSize(fileSize), docDescription].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #dee2e6',
                background: '#f8f9fa',
                color: '#495057',
                fontSize: 12,
                cursor: 'pointer',
              }}
              onClick={() => void handleDownload()}
            >
              <Download size={14} />
              Tải về
            </button>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #dee2e6',
                background: '#f8f9fa',
                color: '#495057',
                fontSize: 12,
                cursor: 'pointer',
              }}
              onClick={handleOpenInNewTab}
            >
              <ExternalLink size={14} />
              Mở tab mới
            </button>
          </div>
        </div>
        <iframe
          src={viewerUrl}
          title={fileName || 'document preview'}
          className={styles.iframe}
          style={{ flex: 1, minHeight: 0 }}
          onError={() => setIframeFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#e7f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileTypeIcon type={iconType} fileName={fileName} size={26} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#25262b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {truncateFilename(fileName, 48)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {extension && (
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, border: '1px solid #dee2e6', color: '#495057' }}>
                {extension}
              </span>
            )}
            <span style={{ fontSize: 12, color: '#868e96' }}>{formatFileSize(fileSize)}</span>
            {docDescription && <span style={{ fontSize: 12, color: '#868e96' }}>· {docDescription}</span>}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#868e96', marginTop: 12 }}>
        Không có bản xem trước cho định dạng này. Tải file về để mở bằng phần mềm phù hợp.
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: '#228be6',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={() => void handleDownload()}
        >
          <Download size={14} />
          Tải về
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #dee2e6',
            background: '#f8f9fa',
            color: '#495057',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={handleOpenInNewTab}
        >
          <ExternalLink size={14} />
          Mở tab mới
        </button>
      </div>
    </div>
  );
}

export default DocumentPreview;
