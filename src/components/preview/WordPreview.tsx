/**
 * @fileoverview Xem trước .docx ngay trong trình duyệt bằng docx-preview —
 * chuyển thể từ hr-web-client calendar file preview.
 *
 * Zoom được điều khiển từ component cha qua prop scale.
 */
import { useEffect, useRef, useState } from 'react';

import { AlertTriangle } from 'lucide-react';
import styles from './PreviewPanel.module.css';

interface WordPreviewProps {
  url: string;
  fileName: string;
  /** Mức thu phóng do component cha điều khiển (mặc định 1 = 100%). */
  scale?: number;
  /** Báo số trang thực tế sau khi render xong — component cha dùng để hiện TRANG 1/N. */
  onPageCount?: (count: number) => void;
}

async function loadDocxPreview() {
  return import('docx-preview');
}

/** docx-preview (inWrapper: true) render mỗi trang thành 1 section/div con trực tiếp của .docx-wrapper. */
function countRenderedPages(container: HTMLElement): number {
  const wrapper = container.querySelector('.docx-wrapper');
  if (!wrapper) return 1;
  const pages = wrapper.querySelectorAll(':scope > section, :scope > .docx');
  return pages.length > 0 ? pages.length : 1;
}

export function WordPreview({ url, fileName, scale = 1, onPageCount }: WordPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    (async () => {
      setStatus('loading');
      try {
        const [docx, res] = await Promise.all([loadDocxPreview(), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled || !containerRef.current) return;
        await docx.renderAsync(blob, containerRef.current, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          // Word lưu các mốc phân trang đã render dưới dạng lastRenderedPageBreak.
          ignoreLastRenderedPageBreak: false,
        });
        if (cancelled) return;
        setStatus('ready');
        onPageCount?.(countRenderedPages(container));
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className={styles.panel} style={{ background: 'transparent' }}>
      <div className={styles.docHost} style={{ position: 'relative' }}>
        {status === 'loading' && (
          <div className={styles.centerState} style={{ position: 'absolute', inset: 0 }}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải tài liệu…</span>
          </div>
        )}
        {status === 'error' && (
          <div className={styles.centerState} style={{ position: 'absolute', inset: 0 }}>
            <AlertTriangle size={32} color="#fa5252" />
            <span style={{ fontSize: 13, color: '#495057' }}>Không xem trước được file này</span>
          </div>
        )}
        <div
          style={{
            margin: '0 auto',
            width: 'fit-content',
            transform: `scale(${scale})`,
            transformOrigin: 'top',
            visibility: status !== 'ready' ? 'hidden' : 'visible',
          }}
          ref={containerRef}
          aria-label={fileName}
        />
      </div>
    </div>
  );
}

export default WordPreview;
