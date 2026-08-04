/**
 * Nhận diện link file báo cáo tuần trong markdown/HTML từ AI.
 * - Tên file → xem trên web
 * - "Tải về" → tải xuống máy
 */

const WEEKLY_REPORT_FILES_PATH =
  /\/api\/chat\/personal\/weekly-report\/files\/(\d+)(?:\/view)?\/?$/i;

const DOWNLOAD_LABELS = new Set([
  "tải về",
  "tai ve",
  "download",
  "tải xuống",
  "tai xuong",
]);

export interface WeeklyReportFileLinkAction {
  fileId: number;
  mode: "view" | "download";
}

function extractPathname(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return new URL(trimmed).pathname;
    }
    if (trimmed.startsWith("/")) {
      return trimmed.split("?")[0];
    }
    return new URL(trimmed, "https://ai.hacomholdings.com.vn").pathname;
  } catch {
    return trimmed.split("?")[0];
  }
}

/** Parse file_id và mode gợi ý từ URL. */
export function parseWeeklyReportFileLink(
  href: string | undefined,
): WeeklyReportFileLinkAction | null {
  if (!href) return null;

  const pathname = extractPathname(href);
  if (!pathname) return null;

  const viewMatch = pathname.match(
    /\/api\/chat\/personal\/weekly-report\/files\/(\d+)\/view\/?$/i,
  );
  if (viewMatch) {
    return { fileId: Number.parseInt(viewMatch[1], 10), mode: "view" };
  }

  const downloadMatch = pathname.match(WEEKLY_REPORT_FILES_PATH);
  if (downloadMatch) {
    return {
      fileId: Number.parseInt(downloadMatch[1], 10),
      mode: "download",
    };
  }

  return null;
}

function normalizeLinkLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Nhãn link cột "Tải về" — không phải tên file thật. */
export function isDownloadLinkLabel(label: string): boolean {
  return DOWNLOAD_LABELS.has(normalizeLinkLabel(label));
}

/** Quyết định xem hay tải dựa trên URL + nhãn link (tên file vs "Tải về"). */
export function resolveWeeklyReportFileAction(
  href: string | undefined,
  linkLabel: string,
): WeeklyReportFileLinkAction | null {
  const parsed = parseWeeklyReportFileLink(href);
  if (!parsed || !Number.isFinite(parsed.fileId)) {
    return null;
  }

  const normalizedLabel = normalizeLinkLabel(linkLabel);

  if (DOWNLOAD_LABELS.has(normalizedLabel)) {
    return { fileId: parsed.fileId, mode: "download" };
  }

  // Cột tên file — luôn mở xem (kể cả URL trỏ /files/{id} không có /view)
  return { fileId: parsed.fileId, mode: "view" };
}

export function isWeeklyReportFileHref(href: string | undefined): boolean {
  return parseWeeklyReportFileLink(href) !== null;
}
