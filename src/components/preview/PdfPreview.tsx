/**
 * @fileoverview Xem trước PDF bằng pdfjs-dist vẽ lên canvas trong trình duyệt.
 * Không dùng iframe để tránh việc trình duyệt tự động kích hoạt tải file về máy.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { downloadResourceWithName } from '../../utils/downloadFile';
import styles from './PreviewPanel.module.css';

interface PdfPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  /** Mức thu phóng do component cha điều khiển (mặc định 1 = 100%). */
  scale?: number;
  /** Báo số trang thực tế cho component cha */
  onPageCount?: (count: number) => void;
}

interface PDFDocumentWrapper {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void>; cancel: () => void };
  }>;
}

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjsLib) return pdfjsLib;

  const [pdfjs, { default: PdfWorker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
  ]);
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  pdfjsLib = pdfjs;
  return pdfjs;
}

const PdfPageCanvas: React.FC<{
  doc: PDFDocumentWrapper;
  pageNumber: number;
  scale: number;
}> = React.memo(({ doc, pageNumber, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        // Render at device pixel ratio for crisp text
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * pixelRatio });
        const displayViewport = page.getViewport({ scale });

        setPageSize({ width: displayViewport.width, height: displayViewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(displayViewport.width)}px`;
        canvas.style.height = `${Math.floor(displayViewport.height)}px`;

        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch {
        // Ignored on cancelled
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <div
      style={{
        margin: '0 auto 24px',
        width: pageSize ? `${pageSize.width}px` : 'auto',
        minHeight: pageSize ? `${pageSize.height}px` : '400px',
        backgroundColor: '#fff',
        boxShadow: '0 1px 8px rgba(0, 0, 0, 0.14)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
});
PdfPageCanvas.displayName = 'PdfPageCanvas';

export function PdfPreview({ url, fileName, scale = 1, onPageCount }: PdfPreviewProps) {
  const [doc, setDoc] = useState<PDFDocumentWrapper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    setDoc(null);

    void (async () => {
      try {
        const [pdfjs, res] = await Promise.all([loadPdfJs(), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({
          data,
          enableXfa: false,
          useSystemFonts: false,
        });

        const loadedDoc = await loadingTask.promise;
        if (cancelled) return;

        setDoc(loadedDoc as unknown as PDFDocumentWrapper);
        setIsLoading(false);
        onPageCount?.(loadedDoc.numPages);
      } catch {
        if (!cancelled) {
          setIsLoading(false);
          setHasError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const pageNumbers = useMemo(() => {
    if (!doc) return [];
    return Array.from({ length: doc.numPages }, (_, i) => i + 1);
  }, [doc]);

  const handleDownload = () => void downloadResourceWithName(url, fileName || 'document.pdf');
  const handleOpenInNewTab = () => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div className={styles.panel} style={{ background: 'transparent' }}>
      <div className={styles.docHost} style={{ position: 'relative' }}>
        {isLoading && (
          <div className={styles.centerState} style={{ position: 'absolute', inset: 0 }}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải tài liệu PDF…</span>
          </div>
        )}

        {hasError && (
          <div className={styles.centerState} style={{ position: 'absolute', inset: 0 }}>
            <AlertTriangle size={40} color="#fa5252" />
            <span style={{ fontSize: 13, color: '#495057' }}>
              Không hiển thị được PDF. Vui lòng mở ở tab mới hoặc tải về.
            </span>
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
                onClick={handleDownload}
              >
                <Download size={14} />
                Tải về
              </button>
            </div>
          </div>
        )}

        {doc && (
          <div style={{ width: '100%' }}>
            {pageNumbers.map((num) => (
              <PdfPageCanvas key={num} doc={doc} pageNumber={num} scale={scale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PdfPreview;
