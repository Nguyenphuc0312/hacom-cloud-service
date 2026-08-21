/**
 * @fileoverview Xem trước .xlsx/.xls ngay trong trình duyệt bằng SheetJS —
 * chuyển thể từ hr-web-client calendar file preview.
 *
 * Zoom điều khiển từ component cha qua prop scale. Panel có thanh chọn sheet ở dưới
 * cùng, kiểu tab phẳng có gạch chân + mũi tên cuộn ngang khi nhiều sheet.
 * Thêm số dòng (1, 2, 3...) và chữ cột (A, B, C...) giống lưới bảng tính thật.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Menu as IconMenu2 } from 'lucide-react';
import { sanitizeTableHtml } from './sanitizeTableHtml';
import styles from './PreviewPanel.module.css';

interface ExcelPreviewProps {
  url: string;
  fileName?: string;
  /** Mức thu phóng do component cha điều khiển (mặc định 1 = 100%). */
  scale?: number;
}

interface ParsedWorkbook {
  sheetNames: string[];
  htmlBySheet: string[];
}

async function loadXlsx() {
  return import('xlsx');
}

let prototypeFrozen = false;
function freezeObjectPrototypeOnce(): void {
  if (prototypeFrozen) return;
  Object.freeze(Object.prototype);
  prototypeFrozen = true;
}

/** Độ rộng cột mặc định (px) khi file không khai báo. */
const DEFAULT_COL_PX = 64;
/** Độ rộng tối thiểu 1 cột. */
const MIN_COL_PX = 40;
/** Độ rộng cột số dòng (1, 2, 3...) bên trái. */
const ROW_HEAD_COL_PX = 40;

function resolveColPx(colInfo: { wpx?: number; wch?: number; width?: number } | undefined): number {
  if (!colInfo) return DEFAULT_COL_PX;
  if (typeof colInfo.wpx === 'number') return Math.max(MIN_COL_PX, Math.round(colInfo.wpx));
  const chars = typeof colInfo.wch === 'number' ? colInfo.wch : typeof colInfo.width === 'number' ? colInfo.width : null;
  if (chars == null) return DEFAULT_COL_PX;
  return Math.max(MIN_COL_PX, Math.round(chars * 7 + 5));
}

function addGridHeaders(
  html: string,
  encodeCol: (c: number) => string,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
  cols: Array<{ wpx?: number; wch?: number; width?: number } | undefined>,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return html;

  const rows = Array.from(table.querySelectorAll('tr'));

  const colgroup = doc.createElement('colgroup');
  const rowHeadCol = doc.createElement('col');
  rowHeadCol.style.width = `${ROW_HEAD_COL_PX}px`;
  colgroup.appendChild(rowHeadCol);
  let totalWidthPx = ROW_HEAD_COL_PX;
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const colPx = resolveColPx(cols[c]);
    totalWidthPx += colPx;
    const col = doc.createElement('col');
    col.style.width = `${colPx}px`;
    colgroup.appendChild(col);
  }
  table.insertBefore(colgroup, table.firstChild);
  table.setAttribute('style', `width:${totalWidthPx}px`);

  const headerRow = doc.createElement('tr');
  const cornerCell = doc.createElement('th');
  cornerCell.className = 'excel-grid-corner';
  headerRow.appendChild(cornerCell);
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const th = doc.createElement('th');
    th.className = 'excel-grid-colhead';
    th.textContent = encodeCol(c);
    headerRow.appendChild(th);
  }
  table.insertBefore(headerRow, colgroup.nextSibling);

  rows.forEach((tr, i) => {
    const th = doc.createElement('th');
    th.className = 'excel-grid-rowhead';
    th.textContent = String(range.s.r + i + 1);
    tr.insertBefore(th, tr.firstChild);
  });

  return table.outerHTML;
}

export function ExcelPreview({ url, scale = 1 }: ExcelPreviewProps) {
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setParsed(null);
      setError(null);
      setActiveSheet(0);
      try {
        const [XLSX, res] = await Promise.all([loadXlsx(), fetch(url)]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        freezeObjectPrototypeOnce();
        const wb = XLSX.read(buf, { type: 'array' });
        const htmlBySheet = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rawHtml = sanitizeTableHtml(XLSX.utils.sheet_to_html(ws, { editable: false }));
          const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
          return addGridHeaders(rawHtml, XLSX.utils.encode_col, range, ws['!cols'] || []);
        });
        if (cancelled) return;
        setParsed({ sheetNames: wb.SheetNames, htmlBySheet });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không đọc được file');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const activeHtml = useMemo(() => parsed?.htmlBySheet[activeSheet] ?? '', [parsed, activeSheet]);

  const scrollTabs = (dir: -1 | 1) => {
    tabListRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelBody} style={{ background: '#fff' }}>
        {error ? (
          <div className={styles.centerState}>
            <AlertTriangle size={32} color="#fa5252" />
            <span style={{ fontSize: 13, color: '#495057' }}>Không xem trước được: {error}</span>
          </div>
        ) : !parsed ? (
          <div className={styles.centerState}>
            <span style={{ fontSize: 13, color: '#868e96' }}>Đang tải bảng tính…</span>
          </div>
        ) : (
          <div
            className={styles.excelTable}
            style={{ width: 'fit-content', transform: `scale(${scale})`, transformOrigin: 'top left' }}
            dangerouslySetInnerHTML={{ __html: activeHtml }}
          />
        )}
      </div>

      {parsed && parsed.sheetNames.length > 1 && (
        <div className={styles.sheetTabBar}>
          <IconMenu2 size={16} className={styles.sheetTabMenuIcon} />
          <button
            type="button"
            className={styles.sheetTabScrollBtn}
            onClick={() => scrollTabs(-1)}
            aria-label="Cuộn trái"
          >
            <ChevronLeft size={16} />
          </button>
          <div className={styles.sheetTabList} ref={tabListRef}>
            {parsed.sheetNames.map((name, i) => (
              <button
                key={name}
                type="button"
                className={styles.sheetTab}
                data-active={i === activeSheet ? 'true' : undefined}
                onClick={() => setActiveSheet(i)}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.sheetTabScrollBtn}
            onClick={() => scrollTabs(1)}
            aria-label="Cuộn phải"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default ExcelPreview;
