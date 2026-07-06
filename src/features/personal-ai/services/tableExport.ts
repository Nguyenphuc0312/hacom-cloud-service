import { logger } from "../../../utils/logger";

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
  const resp = await fetch(`${AI_BASE_URL}/api/work-reports/export-table`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-contract": "3",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      title,
      content: rawContent,
      ...(sessionId && exportId
        ? { session_id: sessionId, export_id: exportId }
        : {}),
    }),
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
