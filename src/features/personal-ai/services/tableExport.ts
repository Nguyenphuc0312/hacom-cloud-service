import { logger } from "../../../utils/logger";
import { withScopeToken } from "../stores/workReportScopeStore";

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

/**
 * Quét tất cả bảng markdown trong nội dung, trả về vị trí dòng bắt đầu/kết thúc
 * của TỪNG bảng (header + separator + rows liền mạch). Dùng chung cho parse &
 * split để không lệch cách nhận diện bảng.
 */
function findTableRanges(lines: string[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const line = lines[i];
    if (!line.includes("|") || isSeparator(line) || !isSeparator(lines[i + 1])) {
      i++;
      continue;
    }
    let end = i + 2;
    while (end < lines.length) {
      const r = lines[end];
      if (!r.includes("|") || r.trim() === "") break;
      end++;
    }
    ranges.push({ start: i, end }); // [start, end)
    i = end;
  }
  return ranges;
}

function tableFromRange(lines: string[], start: number, end: number): ParsedTable {
  const headers = splitRow(lines[start]).map(stripCellMarkdown);
  const rows: string[][] = [];
  for (let j = start + 2; j < end; j++) {
    if (isSeparator(lines[j])) continue;
    const cells = splitRow(lines[j]).map(stripCellMarkdown);
    while (cells.length < headers.length) cells.push("");
    rows.push(cells.slice(0, headers.length));
  }
  return { headers, rows };
}

/** Lấy bảng markdown ĐẦU TIÊN trong nội dung; null nếu không có. */
export function parseMarkdownTable(content: string): ParsedTable | null {
  const lines = content.split(/\r?\n/);
  const ranges = findTableRanges(lines);
  if (ranges.length === 0) return null;
  return tableFromRange(lines, ranges[0].start, ranges[0].end);
}

/**
 * Cắt nội dung thành từng block markdown chứa ĐÚNG 1 bảng (giữ nguyên text gốc
 * để BE fallback parse / copy đúng bảng đó). Thứ tự khớp thứ tự bảng render.
 */
export function splitMarkdownTables(content: string): string[] {
  const lines = content.split(/\r?\n/);
  return findTableRanges(lines).map((r) =>
    lines.slice(r.start, r.end).join("\n"),
  );
}

function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

/**
 * Bảng → text TSV (tab phân cột, xuống dòng phân hàng). Dán vào Excel/Sheets ra
 * đúng ô; xuống dòng trong ô đổi thành space để không vỡ hàng.
 */
export function tableToPlainText(table: ParsedTable): string {
  const cell = (c: string) => c.replace(/\r?\n/g, " ").replace(/\t/g, " ");
  return [table.headers, ...table.rows]
    .map((row) => row.map(cell).join("\t"))
    .join("\n");
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

/** Một trang dữ liệu bảng chat (`POST /api/work-reports/query-page`, §4). */
export interface WorkReportQueryPage {
  rows: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * POST /api/work-reports/query-page — phân trang bảng báo cáo trong chat (§4).
 *
 * Gửi `scope_token` trong JSON body; đổi scope thì caller phải bỏ trang cũ,
 * không trộn dữ liệu hai scope (§5).
 */
export async function fetchWorkReportQueryPage(
  params: { sessionId: string; queryId: string; offset?: number; limit?: number },
  options?: { signal?: AbortSignal },
): Promise<WorkReportQueryPage> {
  const { getAccessToken } = await import("../../../services/tokenService");
  const token = getAccessToken() ?? getAccessTokenForExport();
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;

  const resp = await fetch(`${AI_BASE_URL}/api/work-reports/query-page`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-contract": "3",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(
      withScopeToken({
        session_id: params.sessionId,
        query_id: params.queryId,
        offset,
        limit,
      }),
    ),
    signal: options?.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`query-page ${resp.status}: ${text}`);
  }

  const payload = (await resp.json()) as Record<string, unknown>;
  return {
    rows: Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [],
    total: typeof payload.total === "number" ? payload.total : 0,
    offset: typeof payload.offset === "number" ? payload.offset : offset,
    limit: typeof payload.limit === "number" ? payload.limit : limit,
  };
}

/** Snapshot export hết hạn (BE trả 404) — cần hỏi lại báo cáo rồi xuất lại. */
export class ExportExpiredError extends Error {
  constructor() {
    super("Dữ liệu export đã hết hạn. Vui lòng hỏi lại báo cáo rồi xuất file.");
    this.name = "ExportExpiredError";
  }
}

/**
 * Xuất Excel qua BE: POST /api/work-reports/export-table
 *
 * Ưu tiên xuất từ snapshot dữ liệu gốc: gửi kèm `session_id + export_id` để BE
 * khôi phục đủ cột (Công ty/Nhân viên/Mã NV) dù bảng chat đã ẩn. Thiếu export_id
 * thì fallback về `content` (markdown hiện tại) — chỉ có các cột đang hiển thị.
 */
export async function exportTableToXlsx(
  filename: string,
  _table: ParsedTable,
  rawContent: string,
  title: string,
  sessionId?: string,
  exportId?: string,
): Promise<boolean> {
  const { getAccessToken } = await import("../../../services/tokenService");
  const token = getAccessToken() ?? getAccessTokenForExport();
  // Cảnh báo nếu có export_id nhưng thiếu session_id (hoặc ngược lại): guard bên dưới
  // sẽ bỏ CẢ HAI field → BE fallback markdown → file mất cột Mã. Không để rơi âm thầm.
  if (Boolean(sessionId) !== Boolean(exportId)) {
    logger.warn("tableExport", "snapshot-fields-mismatch", {
      hasSessionId: Boolean(sessionId),
      hasExportId: Boolean(exportId),
    });
  }
  // ponytail: diag tạm (BE response 06-07 §3) — Mốc 3: giá trị ngay trước POST.
  // Nếu 1 trong 2 undefined → guard cả-hai-hoặc-không bỏ cả hai → payload chỉ
  // title+content (đúng triệu chứng). Gỡ sau khi chốt gốc lỗi.
  logger.info("tableExport", "export-body-precheck", {
    hasSessionId: Boolean(sessionId),
    hasExportId: Boolean(exportId),
    willSendSnapshot: Boolean(sessionId && exportId),
  });
  const resp = await fetch(`${AI_BASE_URL}/api/work-reports/export-table`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-contract": "3",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // §4: xuất Excel bảng chat gửi scope_token trong JSON body.
    body: JSON.stringify(
      withScopeToken({
        title,
        content: rawContent,
        ...(sessionId && exportId
          ? { session_id: sessionId, export_id: exportId }
          : {}),
      }),
    ),
  });
  if (!resp.ok) {
    // 404 = snapshot export hết hạn khỏi session → yêu cầu hỏi lại báo cáo.
    if (resp.status === 404 && sessionId && exportId) throw new ExportExpiredError();
    const text = await resp.text().catch(() => "");
    throw new Error(`export-table ${resp.status}: ${text}`);
  }
  const blob = await resp.blob();
  const headerName = resp.headers.get("X-File-Name");
  downloadBlob(blob, headerName || ensureExt(filename, ".xlsx"));
  return true;
}
