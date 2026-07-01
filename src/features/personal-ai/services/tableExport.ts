
export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Tách 1 dòng markdown `| a | b |` thành mảng ô (giữ escape `\|`). */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** Dòng phân cách header kiểu `| --- | :--: |`. */
function isSeparator(line: string): boolean {
  const cells = splitRow(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")))
  );
}

/** Bỏ cú pháp markdown trong 1 ô → text thuần (link giữ nhãn). */
function stripCellMarkdown(cell: string): string {
  return cell
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

/** Lấy bảng markdown ĐẦU TIÊN trong nội dung; null nếu không có. */
export function parseMarkdownTable(content: string): ParsedTable | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!line.includes("|") || isSeparator(line)) continue;
    const next = lines[i + 1];
    if (!next || !isSeparator(next)) continue;

    const headers = splitRow(line).map(stripCellMarkdown);
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const r = lines[j];
      if (!r.includes("|") || r.trim() === "") break;
      if (isSeparator(r)) continue;
      const cells = splitRow(r).map(stripCellMarkdown);
      // Chuẩn hóa số cột bằng header.
      while (cells.length < headers.length) cells.push("");
      rows.push(cells.slice(0, headers.length));
    }
    return { headers, rows };
  }
  return null;
}

function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaveFilePicker = (opts: any) => Promise<any>;

/**
 * Lưu file, CHỈ báo thành công khi file đã thật sự được ghi.
 *
 * QUAN TRỌNG: `showSaveFilePicker` bắt buộc gọi NGAY trong user gesture (cú
 * click). Nếu gọi sau khi đã `await` (tạo blob / tải pdfmake) thì "user
 * activation" đã hết → ném NotAllowedError. Vì vậy ta mở hộp thoại Save TRƯỚC,
 * rồi mới dựng blob qua `buildBlob()` và ghi vào handle.
 *
 * - Hỗ trợ File System Access API (Chromium/desktop): resolve(true) sau khi
 *   người dùng chọn vị trí và ghi xong; bấm Hủy → resolve(false) (không báo).
 * - Không hỗ trợ / bị chặn: fallback tải qua thẻ <a> sau khi dựng blob xong.
 */
async function saveFile(
  filename: string,
  mime: string,
  buildBlob: () => Promise<Blob> | Blob,
): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;

  if (typeof picker === "function") {
    let handle: { createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> } | null = null;
    try {
      const ext = filename.slice(filename.lastIndexOf("."));
      // Phải là lời gọi async ĐẦU TIÊN kể từ cú click (chưa await gì trước đó).
      handle = await picker({
        suggestedName: filename,
        types: [{ description: filename, accept: { [mime]: [ext] } }],
      });
    } catch (err) {
      // Hủy hộp thoại → không lưu, không báo lỗi.
      if ((err as DOMException)?.name === "AbortError") return false;
      // Bị chặn/không khả dụng → dùng fallback bên dưới.
      handle = null;
    }
    if (handle) {
      const blob = await buildBlob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }
  }

  const blob = await buildBlob();
  downloadBlob(blob, filename);
  return true;
}

const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

const AI_BASE_URL =
  (import.meta.env.VITE_AI_CHAT_BASE_URL as string | undefined)?.trim() ||
  "https://ai.hacomholdings.com.vn";

function getAccessTokenForExport(): string | null {
  // Đọc token từ localStorage — đồng bộ với tokenService.ts
  try {
    const raw = localStorage.getItem("access_token") ?? localStorage.getItem("hacom_access_token");
    if (raw) return raw;
    // Fallback: tìm trong persist store của authStore
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (key.includes("auth")) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
          const token = (parsed as Record<string, unknown>).accessToken ?? (parsed?.state as Record<string, unknown>)?.accessToken;
          if (typeof token === "string" && token) return token;
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return null;
}

/**
 * Xuất Excel qua BE: POST /api/work-reports/export-table
 * BE nhận { title, content } (markdown) và trả về file .xlsx binary.
 */
export async function exportTableToXlsx(
  filename: string,
  _table: ParsedTable,
  rawContent: string,
  title: string,
): Promise<boolean> {
  const { getAccessToken } = await import("../../../services/tokenService");
  const token = getAccessToken() ?? getAccessTokenForExport();
  const resp = await fetch(`${AI_BASE_URL}/api/work-reports/export-table`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-contract": "3",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title, content: rawContent }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`export-table ${resp.status}: ${text}`);
  }
  const blob = await resp.blob();
  downloadBlob(blob, ensureExt(filename, ".xlsx"));
  return true;
}

/** Xuất Word .docx thật (docx). */
export async function exportTableToDocx(
  filename: string,
  title: string,
  table: ParsedTable,
): Promise<boolean> {
  return saveFile(ensureExt(filename, ".docx"), MIME.docx, async () => {
    const {
      Document,
      Packer,
      Table: DocxTable,
      TableRow,
      TableCell,
      Paragraph,
      TextRun,
      HeadingLevel,
      WidthType,
    } = await import("docx");

    const headerRow = new TableRow({
      tableHeader: true,
      children: table.headers.map(
        (h) =>
          new TableCell({
            shading: { fill: "1565C0" },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })],
              }),
            ],
          }),
      ),
    });

    const bodyRows = table.rows.map(
      (r) =>
        new TableRow({
          children: table.headers.map(
            (_, c) =>
              new TableCell({
                children: (r[c] ?? "")
                  .split("\n")
                  .map((ln) => new Paragraph({ children: [new TextRun(ln)] })),
              }),
          ),
        }),
    );

    const docTable = new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: title, bold: true })],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Xuất ngày ${new Date().toLocaleDateString("vi-VN")}`,
                  italics: true,
                  color: "888888",
                }),
              ],
            }),
            new Paragraph({}),
            docTable,
          ],
        },
      ],
    });

    return Packer.toBlob(doc);
  });
}

/** Nạp pdfmake + gắn vfs font (Roboto, hỗ trợ tiếng Việt). Dùng dynamic import. */
async function loadPdfMake(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createPdf: (dd: any) => any;
}> {
  const [pdfMakeModule, vfsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMake: any = (pdfMakeModule as any).default ?? (pdfMakeModule as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawVfs: any = vfsModule as any;
  // Dev (esbuild CJS interop): fonts live on the module export shape.
  // Prod (Rollup, vite.config moduleContext="globalThis"): vfs_fonts assigns
  // its fonts onto globalThis.pdfMake.vfs — read them back from there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalVfs = (globalThis as any).pdfMake?.vfs;
  pdfMake.vfs =
    rawVfs.pdfMake?.vfs ??
    rawVfs.default?.pdfMake?.vfs ??
    globalVfs ??
    rawVfs.default ??
    rawVfs;
  return pdfMake;
}

/**
 * Dựng docDefinition báo cáo. Cấu hình multi-page chuẩn:
 * - headerRows: 1 → tiêu đề cột tự lặp ở mọi trang.
 * - keepWithHeaderRows: 1 → header không đứng một mình cuối trang.
 * - dontBreakRows: false → cho phép cắt dòng giữa trang (tránh mất dòng quá dài).
 * - header/footer toàn cục + pageMargins → không mất tiêu đề/số trang khi tràn trang.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildReportDocDefinition(title: string, table: ParsedTable): any {
  const headerRow = table.headers.map((h) => ({
    text: h,
    bold: true,
    color: "white",
    fillColor: "#1565C0",
  }));
  const bodyRows = table.rows.map((r) =>
    table.headers.map((_, c) => ({ text: r[c] ?? "" })),
  );
  const exportedAt = new Date().toLocaleDateString("vi-VN");

  return {
    pageOrientation: "landscape" as const,
    pageMargins: [24, 56, 24, 40] as [number, number, number, number],
    header: (currentPage: number) =>
      currentPage === 1
        ? undefined
        : {
            text: title,
            margin: [24, 20, 24, 0],
            fontSize: 9,
            color: "#888888",
          },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `Xuất ngày ${exportedAt}`, fontSize: 8, color: "#888888", margin: [24, 0, 0, 0] },
        {
          text: `Trang ${currentPage} / ${pageCount}`,
          alignment: "right",
          fontSize: 8,
          color: "#888888",
          margin: [0, 0, 24, 0],
        },
      ],
    }),
    content: [
      { text: title, style: "title" },
      { text: `Xuất ngày ${exportedAt}`, style: "sub" },
      {
        table: {
          headerRows: 1,
          keepWithHeaderRows: 1,
          dontBreakRows: false,
          widths: table.headers.map(() => "*"),
          body: [headerRow, ...bodyRows],
        },
        layout: {
          fillColor: (rowIndex: number) =>
            rowIndex > 0 && rowIndex % 2 === 0 ? "#F4F8FF" : null,
          hLineColor: () => "#D7DCE3",
          vLineColor: () => "#D7DCE3",
        },
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      sub: { fontSize: 9, italics: true, color: "#888888", margin: [0, 0, 0, 12] },
    },
    defaultStyle: { fontSize: 10 },
  };
}

/** Xuất PDF thật (pdfmake, font Roboto hỗ trợ tiếng Việt). Resolve true nếu đã lưu. */
export async function exportTableToPdf(
  filename: string,
  title: string,
  table: ParsedTable,
): Promise<boolean> {
  // saveFile mở hộp thoại Save trước; pdfmake chỉ được tải & dựng blob bên
  // trong callback (sau khi đã có handle) nên không phá vỡ user gesture.
  return saveFile(ensureExt(filename, ".pdf"), MIME.pdf, async () => {
    const pdfMake = await loadPdfMake();
    const pdf = pdfMake.createPdf(buildReportDocDefinition(title, table));
    return new Promise<Blob>((resolve) => pdf.getBlob(resolve));
  });
}
