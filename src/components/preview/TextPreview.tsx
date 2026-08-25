/**
 * @fileoverview Xem trước file .txt/.md — chuyển thể từ hr-web-client calendar file preview.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { MAX_TEXT_PREVIEW_SIZE, MAX_TEXT_PREVIEW_LINES, formatFileSize } from '../../utils/filePreviewUtils';
import { truncateFilename } from '../../utils/truncateFilename';
import styles from './PreviewPanel.module.css';

interface TextPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
}

interface TextContent {
  content: string;
  truncated: boolean;
  error?: string;
}

async function parseTextContent(url: string, signal?: AbortSignal): Promise<TextContent> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n');
    if (text.length > MAX_TEXT_PREVIEW_SIZE || lines.length > MAX_TEXT_PREVIEW_LINES) {
      return { content: lines.slice(0, MAX_TEXT_PREVIEW_LINES).join('\n'), truncated: true };
    }
    return { content: text, truncated: false };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { content: '', truncated: false, error: 'cancelled' };
    return { content: '', truncated: false, error: 'Không đọc được file' };
  }
}

export function TextPreview({ url, fileName, fileSize }: TextPreviewProps) {
  const [content, setContent] = useState<TextContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setContent(null);
    void parseTextContent(url, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setContent(result);
        setIsLoading(false);
      }
    });
    return () => controller.abort();
  }, [url]);

  const extension = fileName.split('.').pop()?.toUpperCase() || '';

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#25262b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {truncateFilename(fileName, 48)}
          </div>
          <div style={{ fontSize: 12, color: '#868e96' }}>
            {formatFileSize(fileSize)} · {extension}
            {content?.truncated && ' · Đã rút gọn'}
          </div>
        </div>
      </div>
      <div className={styles.panelBody}>
        {isLoading ? (
          <div className={styles.centerState}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải xem trước…</span>
          </div>
        ) : content?.error && content.error !== 'cancelled' ? (
          <div className={styles.centerState}>
            <FileText size={40} color="#868e96" />
            <span style={{ fontSize: 13, color: '#495057' }}>{content.error}</span>
          </div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 16, fontSize: 13, fontFamily: 'monospace', margin: 0 }}>
            {content?.content}
          </pre>
        )}
      </div>
      {content?.truncated && (
        <div className={styles.toolbar}>
          <div style={{ fontSize: 12, color: '#868e96', textAlign: 'center', width: '100%' }}>
            Chỉ hiển thị {MAX_TEXT_PREVIEW_LINES} dòng đầu. Tải về để xem toàn bộ.
          </div>
        </div>
      )}
    </div>
  );
}

export default TextPreview;
