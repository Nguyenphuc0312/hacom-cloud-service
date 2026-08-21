/**
 * @fileoverview Xem trước PDF bằng iframe với #toolbar=0&navpanes=0 và scale do component cha điều khiển.
 */
import { useCallback, useState } from 'react';
import { AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { downloadResourceWithName } from '../../utils/downloadFile';
import styles from './PreviewPanel.module.css';

interface PdfPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  /** Mức thu phóng do component cha điều khiển (mặc định 1 = 100%). */
  scale?: number;
}

export function PdfPreview({ url, fileName, scale = 1 }: PdfPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleDownload = useCallback(async () => {
    await downloadResourceWithName(url, fileName || 'document.pdf');
  }, [fileName, url]);

  const handleOpenInNewTab = useCallback(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const embedUrl = `${url}#toolbar=0&navpanes=0`;
  const inverseScale = 100 / scale;

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody} style={{ position: 'relative' }}>
        {isLoading && !hasError && (
          <div className={styles.centerState} style={{ position: 'absolute', inset: 0 }}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải xem trước…</span>
          </div>
        )}
        {hasError ? (
          <div className={styles.centerState}>
            <AlertTriangle size={40} color="#fa5252" />
            <span style={{ fontSize: 13, color: '#495057' }}>Không hiển thị được PDF. Vui lòng mở ở tab mới.</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
                onClick={handleOpenInNewTab}
              >
                <ExternalLink size={14} />
                Mở tab mới
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
                onClick={() => void handleDownload()}
              >
                <Download size={14} />
                Tải về
              </button>
            </div>
          </div>
        ) : (
          <iframe
            key={url}
            src={embedUrl}
            title={fileName || 'PDF preview'}
            className={styles.iframe}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: `${inverseScale}%`,
              height: `${inverseScale}%`,
            }}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default PdfPreview;
