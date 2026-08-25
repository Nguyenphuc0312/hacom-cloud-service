/**
 * @fileoverview Xem trước file .csv dạng bảng — chuyển thể từ hr-web-client calendar file preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Table as IconTable } from 'lucide-react';
import { MAX_CSV_PREVIEW_ROWS, formatFileSize } from '../../utils/filePreviewUtils';
import { truncateFilename } from '../../utils/truncateFilename';
import styles from './PreviewPanel.module.css';

interface CsvPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
}

interface CsvData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
  error?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function parseCsvContent(url: string, signal?: AbortSignal): Promise<CsvData> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [], totalRows: 0, truncated: false };
    const headers = parseCsvLine(lines[0]);
    const dataRows = lines.slice(1);
    if (dataRows.length > MAX_CSV_PREVIEW_ROWS) {
      return {
        headers,
        rows: dataRows.slice(0, MAX_CSV_PREVIEW_ROWS).map(parseCsvLine),
        totalRows: dataRows.length,
        truncated: true,
      };
    }
    return { headers, rows: dataRows.map(parseCsvLine), totalRows: dataRows.length, truncated: false };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { headers: [], rows: [], totalRows: 0, truncated: false, error: 'cancelled' };
    return { headers: [], rows: [], totalRows: 0, truncated: false, error: 'Không đọc được CSV' };
  }
}

const PAGE_SIZE = 50;

export function CsvPreview({ url, fileName, fileSize }: CsvPreviewProps) {
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setCsvData(null);
    setPage(0);
    void parseCsvContent(url, controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setCsvData(result);
        setIsLoading(false);
      }
    });
    return () => controller.abort();
  }, [url]);

  const totalPages = useMemo(() => {
    if (!csvData) return 0;
    return Math.ceil(csvData.rows.length / PAGE_SIZE);
  }, [csvData]);

  const paginatedRows = useMemo(() => {
    if (!csvData) return [];
    const start = page * PAGE_SIZE;
    return csvData.rows.slice(start, start + PAGE_SIZE);
  }, [csvData, page]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#25262b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileName}>
            {truncateFilename(fileName, 48)}
          </div>
          <div style={{ fontSize: 12, color: '#868e96' }}>
            {formatFileSize(fileSize)}
            {csvData && ` · ${csvData.totalRows} dòng`}
            {csvData?.truncated && ' · Đã rút gọn'}
          </div>
        </div>
      </div>
      <div className={styles.panelBody} style={{ padding: 0 }}>
        {isLoading ? (
          <div className={styles.centerState}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải bảng tính…</span>
          </div>
        ) : csvData?.error && csvData.error !== 'cancelled' ? (
          <div className={styles.centerState}>
            <IconTable size={40} color="#868e96" />
            <span style={{ fontSize: 13, color: '#495057' }}>{csvData.error}</span>
          </div>
        ) : !csvData || (csvData.headers.length === 0 && csvData.rows.length === 0) ? (
          <div className={styles.centerState}>
            <span style={{ fontSize: 13, color: '#868e96' }}>File CSV trống</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                  {csvData.headers.map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#495057', borderRight: '1px solid #e9ecef' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid #f1f3f5' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '6px 12px', color: '#212529', borderRight: '1px solid #f1f3f5' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className={styles.toolbar}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontSize: 12, color: '#868e96' }}>
              Trang {page + 1} / {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: '1px solid #dee2e6',
                  background: '#fff',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  opacity: page === 0 ? 0.5 : 1,
                }}
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: '1px solid #dee2e6',
                  background: '#fff',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages - 1 ? 0.5 : 1,
                }}
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CsvPreview;
