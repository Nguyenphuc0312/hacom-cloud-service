/**
 * @fileoverview CsvPreview - CSV file preview component with table rendering.
 * Parses CSV and renders as a scrollable table with pagination for large files.
 */

import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { formatFileSize, MAX_CSV_PREVIEW_ROWS } from "../../utils/filePreviewUtils";
import { truncateFilename } from "../../utils/truncateFilename";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface CsvPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  onClose?: () => void;
  className?: string;
}

interface CsvData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
  error?: string;
}

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
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
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
};

const parseCsvContent = async (
  url: string,
  signal?: AbortSignal,
): Promise<CsvData> => {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      return { headers: [], rows: [], totalRows: 0, truncated: false };
    }

    const headers = parseCsvLine(lines[0]);
    const dataRows = lines.slice(1);
    const totalRows = dataRows.length;

    if (dataRows.length > MAX_CSV_PREVIEW_ROWS) {
      const truncatedRows = dataRows.slice(0, MAX_CSV_PREVIEW_ROWS).map(parseCsvLine);
      return {
        headers,
        rows: truncatedRows,
        totalRows,
        truncated: true,
      };
    }

    const rows = dataRows.map(parseCsvLine);
    return { headers, rows, totalRows, truncated: false };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { headers: [], rows: [], totalRows: 0, truncated: false, error: "cancelled" };
    }
    return { headers: [], rows: [], totalRows: 0, truncated: false, error: "Failed to load CSV" };
  }
};

const PAGE_SIZE = 50;

export const CsvPreview: React.FC<CsvPreviewProps> = ({
  url,
  fileName,
  fileSize,
  className,
}) => {
  const { t } = useTranslation();
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchContent = async () => {
      setIsLoading(true);
      setCsvData(null);
      setCurrentPage(0);
      const result = await parseCsvContent(url, controller.signal);
      if (!controller.signal.aborted) {
        setCsvData(result);
        setIsLoading(false);
      }
    };

    void fetchContent();

    return () => {
      controller.abort();
    };
  }, [url]);

  const sortedRows = useMemo(() => {
    if (!csvData || sortColumn === null) {
      return csvData?.rows ?? [];
    }

    return [...csvData.rows].sort((a, b) => {
      const aVal = a[sortColumn] ?? "";
      const bVal = b[sortColumn] ?? "";

      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [csvData, sortColumn, sortDirection]);

  const paginatedRows = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnIndex);
      setSortDirection("asc");
    }
    setCurrentPage(0);
  };

  const extension = fileName.split(".").pop()?.toUpperCase() || "";

  return (
    <div
      className={clsx(
        "flex h-[85vh] w-[92vw] max-w-6xl flex-col rounded-xl bg-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
            <FileTypeIcon type="spreadsheet" className="h-5 w-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary" title={fileName}>
              {truncateFilename(fileName, 48)}
            </p>
            <p className="text-xs text-text-muted">
              {formatFileSize(fileSize)} · {extension}
              {csvData && ` · ${csvData.totalRows.toLocaleString()} rows`}
              {csvData?.truncated && ` · ${t("chat:filePreview.truncated", { defaultValue: "Truncated" })}`}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-text-muted">
                {t("chat:filePreview.loading", { defaultValue: "Loading preview..." })}
              </p>
            </div>
          </div>
        ) : csvData?.error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <TableCellsIcon className="h-12 w-12 text-text-muted" />
              <p className="text-sm text-text-muted">{csvData.error}</p>
            </div>
          </div>
        ) : csvData && csvData.headers.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-overlay">
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left font-medium text-text-muted">
                    #
                  </th>
                  {csvData.headers.map((header, index) => (
                    <th
                      key={index}
                      className="cursor-pointer border-b border-border px-3 py-2 text-left font-medium text-text-muted hover:bg-surface-hover"
                      onClick={() => handleSort(index)}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate">{header || `Column ${index + 1}`}</span>
                        {sortColumn === index && (
                          <span className="text-xs">
                            {sortDirection === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={clsx(
                      "hover:bg-surface-hover",
                      rowIndex % 2 === 0 ? "bg-surface" : "bg-surface-overlay/50",
                    )}
                  >
                    <td className="border-b border-border/50 px-3 py-1.5 text-text-muted">
                      {currentPage * PAGE_SIZE + rowIndex + 1}
                    </td>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="max-w-[200px] truncate border-b border-border/50 px-3 py-1.5"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <TableCellsIcon className="h-12 w-12 text-text-muted" />
              <p className="text-sm text-text-muted">
                {t("chat:filePreview.emptyCsv", { defaultValue: "CSV file is empty" })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
          <p className="text-xs text-text-muted">
            {t("chat:filePreview.showingRows", {
              defaultValue: "Showing {{start}}-{{end}} of {{total}}",
              start: currentPage * PAGE_SIZE + 1,
              end: Math.min((currentPage + 1) * PAGE_SIZE, sortedRows.length),
              total: sortedRows.length,
            })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className={clsx(
                "rounded px-2 py-1 text-xs",
                "text-text-secondary hover:bg-surface-hover",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              ←
            </button>
            <span className="px-2 text-xs text-text-muted">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className={clsx(
                "rounded px-2 py-1 text-xs",
                "text-text-secondary hover:bg-surface-hover",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Footer warning */}
      {csvData?.truncated && (
        <div className="shrink-0 border-t border-border px-4 py-2 text-center text-xs text-text-muted">
          {t("chat:filePreview.csvTruncated", {
            defaultValue: "Only first {{rows}} rows shown. Download to view full content.",
            rows: MAX_CSV_PREVIEW_ROWS,
          })}
        </div>
      )}
    </div>
  );
};

export default CsvPreview;
