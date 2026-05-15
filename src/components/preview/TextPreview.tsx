/**
 * @fileoverview TextPreview - Safe text file preview component.
 * Renders plain text content with syntax highlighting for common formats.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { formatFileSize, MAX_TEXT_PREVIEW_SIZE, MAX_TEXT_PREVIEW_LINES } from "../../utils/filePreviewUtils";
import { FileTypeIcon } from "../message/FileTypeIcon";

interface TextPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  onClose?: () => void;
  className?: string;
}

interface TextContent {
  content: string;
  truncated: boolean;
  lineCount: number;
  error?: string;
}

const parseTextContent = async (
  url: string,
  signal?: AbortSignal,
): Promise<TextContent> => {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split("\n");

    if (text.length > MAX_TEXT_PREVIEW_SIZE || lines.length > MAX_TEXT_PREVIEW_LINES) {
      const truncatedLines = lines.slice(0, MAX_TEXT_PREVIEW_LINES);
      return {
        content: truncatedLines.join("\n"),
        truncated: true,
        lineCount: truncatedLines.length,
      };
    }

    return { content: text, truncated: false, lineCount: lines.length };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { content: "", truncated: false, lineCount: 0, error: "cancelled" };
    }
    return { content: "", truncated: false, lineCount: 0, error: "Failed to load text" };
  }
};

export const TextPreview: React.FC<TextPreviewProps> = ({
  url,
  fileName,
  fileSize,
  className,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<TextContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchContent = async () => {
      setIsLoading(true);
      setContent(null);
      const result = await parseTextContent(url, controller.signal);
      if (!controller.signal.aborted) {
        setContent(result);
        setIsLoading(false);
      }
    };

    void fetchContent();

    return () => {
      controller.abort();
    };
  }, [url]);

  const extension = fileName.split(".").pop()?.toUpperCase() || "";

  return (
    <div
      className={clsx(
        "flex h-[85vh] w-[92vw] max-w-5xl flex-col rounded-xl bg-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <FileTypeIcon type="document" className="h-5 w-5 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary" title={fileName}>
              {fileName}
            </p>
            <p className="text-xs text-text-muted">
              {formatFileSize(fileSize)} · {extension}
              {content?.truncated && ` · ${t("chat:filePreview.truncated", { defaultValue: "Truncated" })}`}
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
        ) : content?.error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <DocumentTextIcon className="h-12 w-12 text-text-muted" />
              <p className="text-sm text-text-muted">{content.error}</p>
            </div>
          </div>
        ) : (
          <pre
            className={clsx(
              "whitespace-pre-wrap break-words p-4 text-sm font-mono",
              "text-text-primary leading-relaxed",
            )}
          >
            {content?.content}
          </pre>
        )}
      </div>

      {/* Footer */}
      {content?.truncated && (
        <div className="shrink-0 border-t border-border px-4 py-2 text-center text-xs text-text-muted">
          {t("chat:filePreview.textTruncated", {
            defaultValue: "Only first {{lines}} lines shown. Download to view full content.",
            lines: MAX_TEXT_PREVIEW_LINES,
          })}
        </div>
      )}
    </div>
  );
};

export default TextPreview;
