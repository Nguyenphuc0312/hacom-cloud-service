/**
 * @fileoverview Thẻ dự phòng cho file nén (.zip/.rar/.7z) — chuyển thể từ hr-web-client.
 */
import { AlertTriangle, Download, ExternalLink, Archive as IconFileZip } from 'lucide-react';
import { ARCHIVE_LARGE_SIZE_THRESHOLD, formatFileSize, getFileExtension } from '../../utils/filePreviewUtils';
import { truncateFilename } from '../../utils/truncateFilename';
import { downloadResourceWithName, openResourceInNewTab } from '../../utils/downloadFile';
import styles from './PreviewPanel.module.css';

interface ArchivePreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
}

export function ArchivePreview({ url, fileName, fileSize }: ArchivePreviewProps) {
  const extension = getFileExtension(fileName);
  const isLarge = (fileSize ?? 0) > ARCHIVE_LARGE_SIZE_THRESHOLD;

  return (
    <div className={styles.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff9db', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconFileZip size={24} color="#f59f00" />
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
          </div>
        </div>
      </div>

      {isLarge && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: '#fff3bf', border: '1px solid #ffe066', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d9480f' }}>
          <AlertTriangle size={16} />
          <span>File nén dung lượng lớn. Việc tải về có thể mất thời gian tùy tốc độ mạng.</span>
        </div>
      )}

      <div style={{ fontSize: 13, color: '#868e96', marginTop: 12 }}>
        Không thể xem trước nội dung file nén vì lý do bảo mật. Tải về và giải nén bằng công cụ bạn quen dùng.
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
          onClick={() => void downloadResourceWithName(url, fileName || 'archive')}
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
          onClick={() => openResourceInNewTab(url, fileName, false)}
        >
          <ExternalLink size={14} />
          Mở tab mới
        </button>
      </div>
    </div>
  );
}

export default ArchivePreview;
