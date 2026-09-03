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
import { sanitizeTableHtml } from '../../utils/sanitizeTableHtml';
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

interface ExcelColor {
  rgb?: string;
  theme?: number;
  tint?: number;
}

interface ExcelFont {
  name?: string;
  sz?: number;
  bold?: boolean | number;
  italic?: boolean | number;
  underline?: boolean | number | string;
  strike?: boolean | number;
  color?: ExcelColor;
}

interface ExcelFill extends ExcelColor {
  patternType?: string;
  fgColor?: ExcelColor;
}

interface ExcelAlignment {
  horizontal?: string;
  vertical?: string;
  wrapText?: boolean;
  indent?: number;
}

interface ExcelCellFormat {
  fontId?: number;
  fillId?: number;
  alignment?: ExcelAlignment;
}

interface ExcelWorkbookInternals {
  Styles?: {
    Fonts?: ExcelFont[];
    Fills?: ExcelFill[];
    CellXf?: ExcelCellFormat[];
  };
  Themes?: { themeElements?: { clrScheme?: ExcelColor[] } };
  Directory?: { sheets?: string[] };
  files?: Record<string, { content?: string | Uint8Array | ArrayBuffer }>;
}

type ExcelCellCss = Record<string, string>;

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
const MIN_COL_PX = 1;
/** Độ rộng cột số dòng (1, 2, 3...) bên trái. */
const ROW_HEAD_COL_PX = 40;

const toHexColor = (value: string | undefined): string | null => {
  if (!value || !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return null;
  // OOXML dùng ARGB; CSS dùng RGB/RGBA. Alpha không cần cho màu ô Excel.
  return value.slice(-6).toUpperCase();
};

const tintHexColor = (hex: string, tint = 0): string => {
  const clampedTint = Math.max(-1, Math.min(1, tint));
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return channels
    .map((channel) => {
      const mixed = clampedTint < 0
        ? channel * (1 + clampedTint)
        : channel * (1 - clampedTint) + 255 * clampedTint;
      return Math.round(mixed).toString(16).padStart(2, '0');
    })
    .join('')
    .toUpperCase();
};

// eslint-disable-next-line react-refresh/only-export-components -- helper thuần được export để khóa test màu không tin cậy.
export function resolveExcelColor(color: ExcelColor | undefined, theme: ExcelColor[] = []): string | null {
  const direct = toHexColor(color?.rgb);
  if (direct) return `#${direct}`;
  if (typeof color?.theme !== 'number') return null;
  const themed = toHexColor(theme[color.theme]?.rgb);
  return themed ? `#${tintHexColor(themed, color.tint)}` : null;
}

const decodeXmlContent = (content: string | Uint8Array | ArrayBuffer | undefined): string | null => {
  if (typeof content === 'string') return content;
  if (content instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(content));
  if (content instanceof Uint8Array) return new TextDecoder().decode(content);
  return null;
};

const readCellStyleIds = (workbook: ExcelWorkbookInternals, sheetIndex: number): Map<string, number> => {
  const path = workbook.Directory?.sheets?.[sheetIndex]?.replace(/^\/+/, '');
  const xml = path ? decodeXmlContent(workbook.files?.[path]?.content) : null;
  const result = new Map<string, number>();
  if (!xml) return result;

  for (const match of xml.matchAll(/<c\b[^>]*>/g)) {
    const cellRef = /\br="([A-Z]{1,3}\d+)"/i.exec(match[0])?.[1]?.toUpperCase();
    const styleId = /\bs="(\d{1,6})"/.exec(match[0])?.[1];
    if (cellRef && styleId) result.set(cellRef, Number(styleId));
  }
  return result;
};

const buildCellCss = (
  format: ExcelCellFormat | undefined,
  styles: ExcelWorkbookInternals['Styles'],
  theme: ExcelColor[],
  cellType: string | undefined,
  fallbackFill?: ExcelFill,
): ExcelCellCss => {
  const css: ExcelCellCss = {
    'vertical-align': 'bottom',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'overflow-wrap': 'normal',
    'word-break': 'normal',
    'text-align': cellType === 'n' || cellType === 'd' ? 'right' : cellType === 'b' ? 'center' : 'left',
  };
  const fill = typeof format?.fillId === 'number' ? styles?.Fills?.[format.fillId] : fallbackFill;
  const fillColor = fill?.patternType === 'solid' ? resolveExcelColor(fill.fgColor ?? fill, theme) : null;
  if (fillColor) css['background-color'] = fillColor;

  const font = typeof format?.fontId === 'number' ? styles?.Fonts?.[format.fontId] : undefined;
  if (font) {
    if (font.name && /^[\p{L}\p{N} .,_-]{1,80}$/u.test(font.name)) css['font-family'] = `"${font.name}", Arial, sans-serif`;
    if (typeof font.sz === 'number' && font.sz >= 6 && font.sz <= 72) css['font-size'] = `${font.sz}pt`;
    css['font-weight'] = font.bold ? '700' : '400';
    css['font-style'] = font.italic ? 'italic' : 'normal';
    const decorations = [font.underline ? 'underline' : '', font.strike ? 'line-through' : ''].filter(Boolean);
    if (decorations.length) css['text-decoration'] = decorations.join(' ');
    const fontColor = resolveExcelColor(font.color, theme);
    if (fontColor) css.color = fontColor;
  }

  const alignment = format?.alignment;
  if (alignment?.horizontal) {
    const horizontal: Record<string, string> = {
      left: 'left', center: 'center', right: 'right', justify: 'justify',
      distributed: 'justify', centerContinuous: 'center',
    };
    if (horizontal[alignment.horizontal]) css['text-align'] = horizontal[alignment.horizontal];
  }
  if (alignment?.vertical) {
    const vertical: Record<string, string> = { top: 'top', center: 'middle', bottom: 'bottom' };
    if (vertical[alignment.vertical]) css['vertical-align'] = vertical[alignment.vertical];
  }
  if (alignment?.wrapText) {
    css['white-space'] = 'normal';
    css['overflow-wrap'] = 'break-word';
    css['word-break'] = 'break-word';
  }
  if (typeof alignment?.indent === 'number' && alignment.indent > 0 && alignment.indent <= 15) {
    css['padding-left'] = `${alignment.indent * 12 + 6}px`;
  }
  return css;
};

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
  cols: Array<{ wpx?: number; wch?: number; width?: number; hidden?: boolean } | undefined>,
  rowInfo: Array<{ hpx?: number; hpt?: number; hidden?: boolean } | undefined>,
  cellStyleAt: (row: number, col: number) => ExcelCellCss,
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
    const hidden = cols[c]?.hidden === true;
    const colPx = hidden ? 0 : resolveColPx(cols[c]);
    totalWidthPx += colPx;
    const col = doc.createElement('col');
    col.style.width = `${colPx}px`;
    if (hidden) col.style.display = 'none';
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

  const occupiedUntilRow = new Map<number, number>();
  rows.forEach((tr, i) => {
    const info = rowInfo[range.s.r + i];
    if (info?.hidden) {
      tr.style.display = 'none';
    } else {
      const heightPx = info?.hpx ?? (typeof info?.hpt === 'number' ? info.hpt * 96 / 72 : null);
      if (heightPx != null) tr.style.height = `${Math.round(heightPx)}px`;
    }
    let column = range.s.c;
    for (const cell of Array.from(tr.cells)) {
      while ((occupiedUntilRow.get(column) ?? 0) > i) column += 1;
      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      for (const [property, value] of Object.entries(cellStyleAt(range.s.r + i, column))) {
        cell.style.setProperty(property, value);
      }
      if (rowSpan > 1) {
        for (let c = column; c < column + colSpan; c += 1) occupiedUntilRow.set(c, i + rowSpan);
      }
      column += colSpan;
    }
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
        // SheetJS chỉ đọc !cols/!rows khi bật cellStyles. Thiếu cờ này làm mọi
        // cột rơi về 64px, khiến bảng bị co nhỏ và chữ xuống dòng dọc.
        const wb = XLSX.read(buf, { type: 'array', cellStyles: true, bookFiles: true });
        const internals = wb as unknown as ExcelWorkbookInternals;
        const theme = internals.Themes?.themeElements?.clrScheme ?? [];
        const htmlBySheet = wb.SheetNames.map((name, sheetIndex) => {
          const ws = wb.Sheets[name];
          const rawHtml = sanitizeTableHtml(XLSX.utils.sheet_to_html(ws, { editable: false }));
          const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
          const styleIds = readCellStyleIds(internals, sheetIndex);
          return addGridHeaders(
            rawHtml,
            XLSX.utils.encode_col,
            range,
            ws['!cols'] || [],
            ws['!rows'] || [],
            (row, col) => {
              const ref = XLSX.utils.encode_cell({ r: row, c: col });
              const cell = ws[ref] as { t?: string; s?: ExcelFill } | undefined;
              const format = internals.Styles?.CellXf?.[styleIds.get(ref) ?? 0];
              return buildCellCss(format, internals.Styles, theme, cell?.t, cell?.s);
            },
          );
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
