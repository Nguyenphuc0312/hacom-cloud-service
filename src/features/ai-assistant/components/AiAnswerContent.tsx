import React from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { AiSource } from "../types";
import { isSafeSourceUrl, preprocessCitations } from "../utils/sourceUtils";
import { resolveWeeklyReportFileAction } from "../utils/weeklyReportFileLink";
import { rehypeReportTableCols } from "../utils/rehypeReportTableCols";
import { reportTableComponents } from "./reportTableComponents";
import { useWeeklyReportFileActions } from "../hooks/useWeeklyReportFileActions";
import { useOpenAiSource } from "../hooks/useOpenAiSource";
import { AiWeeklyReportFilePreviewModal } from "./AiWeeklyReportFilePreviewModal";

interface AiAnswerContentProps {
  content: string;
  sources?: AiSource[];
  isStreaming?: boolean;
}

// Cho phép target/rel/title trên thẻ <a> để citation link và link thường hoạt động đúng
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel", "title"],
    // Giữ class cột báo cáo do rehypeReportTableCols gán (col--date/org/mid/wide).
    table: [...(defaultSchema.attributes?.table ?? []), "className"],
    th: [...(defaultSchema.attributes?.th ?? []), "className"],
    td: [...(defaultSchema.attributes?.td ?? []), "className"],
  },
};

function flattenLinkLabel(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return "";
    })
    .join("")
    .trim();
}

/**
 * Render nội dung AI dạng markdown, nhận biết citation [N] và chuyển thành link chip.
 * Link báo cáo tuần: tên file → xem trên web, "Tải về" → tải xuống.
 */
export const AiAnswerContent: React.FC<AiAnswerContentProps> = ({
  content,
  sources,
  isStreaming,
}) => {
  const {
    handleView,
    handleDownload,
    busyFileId,
    preview,
    closePreview,
  } = useWeeklyReportFileActions();
  const { open: openSource, isOpening: isOpeningSource } = useOpenAiSource();

  const processedContent =
    sources && sources.length > 0
      ? preprocessCitations(content, sources)
      : content;

  return (
    <>
      <div className="prose-chatgpt relative">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeReportTableCols, [rehypeSanitize, sanitizeSchema]]}
          components={{
            ...reportTableComponents,
            // Bảng báo cáo bọc khung bo góc + cuộn ngang trong bảng (không phải cả
            // message). Màn này không có TableExportMenu → wrapper gọn hơn Cá nhân.
            table: ({ children, className }: React.ComponentPropsWithoutRef<"table">) => (
              <div className="my-4 overflow-x-auto rounded-2xl border border-border shadow-sm">
                <table className={clsx("w-full border-collapse text-[13px]", className)}>
                  {children}
                </table>
              </div>
            ),
            a: ({
              href,
              title,
              children,
              type: _linkType,
              ref: _linkRef,
              ...props
            }) => {
              const label = flattenLinkLabel(children);
              const weeklyAction = resolveWeeklyReportFileAction(href, label);

              if (weeklyAction) {
                const isDownload = weeklyAction.mode === "download";
                const isBusy = busyFileId === weeklyAction.fileId;

                return (
                  <button
                    type="button"
                    title={title}
                    disabled={isBusy}
                    className="inline cursor-pointer border-0 bg-transparent p-0 font-inherit text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
                    onClick={(event) => {
                      event.preventDefault();
                      if (isBusy) return;
                      if (isDownload) {
                        void handleDownload(
                          weeklyAction.fileId,
                          isDownload ? undefined : label || undefined,
                        );
                      } else {
                        void handleView(
                          weeklyAction.fileId,
                          label || undefined,
                        );
                      }
                    }}
                  >
                    {children}
                  </button>
                );
              }

              const isCitation = !!href && isSafeSourceUrl(href);
              if (isCitation) {
                // Link nguồn cần Bearer → mở qua auth-fetch blob (giống source card),
                // không phải <a target="_blank"> (sẽ 401 vì thiếu header).
                return (
                  <button
                    type="button"
                    title={title}
                    disabled={isOpeningSource}
                    className="citation-link inline cursor-pointer border-0 bg-transparent p-0 font-inherit disabled:cursor-wait"
                    onClick={(event) => {
                      event.preventDefault();
                      void openSource(href);
                    }}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={title}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {processedContent}
        </ReactMarkdown>
        {isStreaming && content && (
          <span className="inline-block w-[3px] h-5 bg-text-primary ml-0.5 translate-y-1 animate-typing-cursor rounded-sm" />
        )}
      </div>

      <AiWeeklyReportFilePreviewModal preview={preview} onClose={closePreview} />
    </>
  );
};
