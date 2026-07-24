import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  CopyIcon,
  CheckIcon,
  FileTextIcon,
  SearchIcon,
  BrainCircuitIcon,
  DownloadIcon,
  Loader2Icon,
} from "lucide-react";
import { resolveWeeklyReportFileAction } from "../../../ai-assistant/utils/weeklyReportFileLink";
import {
  openWeeklyReportFile,
  parseLevelReportExportHref,
  downloadLevelReportExport,
} from "../../api/personalAiApi";
import {
  downloadWorkReportFile,
  fetchWorkReportFileBlob,
} from "../../../ai-assistant/services/aiChatApi";
import { toast } from "../../../../utils/toast";

/**
 * File System Access API (chỉ Chromium). Cho phép mở hộp thoại "Lưu" và CHỈ
 * resolve sau khi người dùng thực sự chọn vị trí + ghi xong — nhờ đó toast
 * "đã tải thành công" hiện đúng thời điểm, không sớm như anchor download.
 */
type SaveFilePicker = (options?: {
  suggestedName?: string;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function getSaveFilePicker(): SaveFilePicker | null {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  return typeof picker === "function" ? picker : null;
}
import { WorkReportForm } from "../../../ai-assistant/components/WorkReportForm";
import { DepartmentSelector } from "../../../ai-assistant/components/DepartmentSelector";
import { WorkReportScopeSelector } from "./WorkReportScopeSelector";
import { PersonalWeeklyReportFiles } from "./PersonalWeeklyReportFiles";
import { ReportTextBox } from "./ReportTextBox";
import { CalendarEventTable } from "./CalendarEventTable";
import { TableExportMenu } from "./TableExportMenu";
import { splitMarkdownTables } from "../../services/tableExport";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { rehypeReportTableCols } from "../../../ai-assistant/utils/rehypeReportTableCols";
import { reportTableComponents } from "../../../ai-assistant/components/reportTableComponents";
import type { PersonalChatMessage, PersonalCitation } from "../../types";
import { usePersonalAiStore } from "../../stores/personalAiStore";
import {
  AiMessageAvatar,
  AI_MESSAGE_ROW_PADDING,
} from "../../../ai-assistant/components/AiMessageAvatar";

interface PersonalMessageBubbleProps {
  message: PersonalChatMessage;
  isLast?: boolean;
}

// Giữ class cột báo cáo do rehypeReportTableCols gán (col--date/org/mid/wide).
const reportTableSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    table: [...(defaultSchema.attributes?.table ?? []), "className"],
    th: [...(defaultSchema.attributes?.th ?? []), "className"],
    td: [...(defaultSchema.attributes?.td ?? []), "className"],
  },
};

const ThinkingIndicator: React.FC<{
  phase: PersonalChatMessage["thinkingPhase"];
}> = ({ phase }) => {
  if (!phase) return null;

  const label =
    phase === "searching"
      ? "Đang tìm kiếm trong tài liệu…"
      : "Đang phân tích và suy luận…";

  const Icon = phase === "searching" ? SearchIcon : BrainCircuitIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 mb-3"
    >
      <div className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5">
        <Icon size={12} strokeWidth={2} className="text-text-muted animate-pulse" />
        <span className="text-xs text-text-muted">{label}</span>
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const CitationChips: React.FC<{ citations: PersonalCitation[] }> = ({
  citations,
}) => {
  if (!citations.length) return null;
  const unique = citations.filter(
    (c, i, arr) =>
      arr.findIndex((x) => x.document_id === c.document_id) === i,
  );

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <span className="text-[11px] text-text-muted self-center">Nguồn:</span>
      {unique.map((c, idx) => (
        <div
          key={`${c.document_id}-${idx}`}
          className="flex items-center gap-1 rounded-lg border border-[#1976D2]/25 bg-[#1976D2]/8 px-2 py-1"
          title={c.excerpt}
        >
          <FileTextIcon size={11} strokeWidth={2} className="text-[#1565C0] shrink-0" />
          <span className="max-w-[150px] truncate text-[11px] font-medium text-[#1565C0]">
            {c.document_name.replace(/\.pdf$/i, "")}
          </span>
          {c.page != null && (
            <span className="text-[10px] text-text-disabled">tr.{c.page}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * Nhận diện link file đính kèm báo cáo NGÀY trong markdown synthesis của quản lý
 * (#baocaocv): `[A.pdf](/api/work-reports/files/12)`. Trả về file_id để tải có
 * kèm auth (anchor thường không gửi Bearer token → 403).
 */
const WORK_REPORT_FILE_HREF = /\/api\/work-reports\/files\/(\d+)\/?$/i;

function parseWorkReportFileHref(href: string | undefined): number | null {
  if (!href) return null;
  const path = href.split("?")[0];
  const match = path.match(WORK_REPORT_FILE_HREF);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

const StreamingCursor: React.FC = () => (
  <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-[pulse_0.8s_ease-in-out_infinite] rounded-sm bg-text-primary" />
);

export const PersonalMessageBubble: React.FC<PersonalMessageBubbleProps> = ({
  message,
}) => {
  const [copied, setCopied] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<number | null>(null);
  const [loadingWorkFileId, setLoadingWorkFileId] = useState<number | null>(null);
  const [loadingExportHref, setLoadingExportHref] = useState<string | null>(null);
  const activeConversationId = usePersonalAiStore((s) => s.activeConversationId);
  const patchMessage = usePersonalAiStore((s) => s.patchMessage);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  // Markdown gốc của TỪNG bảng → mỗi bảng có menu ... riêng, gửi đúng bảng của
  // nó (fix bug download/copy chỉ được bảng đầu). Có nhiều bảng thì bỏ snapshot
  // export_id (snapshot là toàn report, không tách theo bảng) → dùng fallback
  // markdown theo từng block; chỉ khi đúng 1 bảng mới giữ snapshot đủ cột ẩn.
  const tableBlocks = React.useMemo(
    () => (isAssistant ? splitMarkdownTables(message.content) : []),
    [isAssistant, message.content],
  );
  const perTableSnapshot = tableBlocks.length <= 1;
  // Counter map thứ tự bảng render (DOM) → block markdown tương ứng. Reset ngay
  // trước mỗi lần render ReactMarkdown ở dưới.
  const tableIndexRef = React.useRef(0);

  const markdownComponents = React.useMemo(
    () => ({
      // ── Table ──────────────────────────────────────────────────────────
      table: ({ children, className }: React.ComponentPropsWithoutRef<"table">) => {
        const idx = tableIndexRef.current++;
        // Ưu tiên markdown của RIÊNG bảng này (tách được → menu gửi đúng bảng đó).
        // Không tách được (edge case parser) → fallback toàn bộ content để KHÔNG
        // bao giờ mất nút. Nhiều bảng thì bỏ snapshot (snapshot là toàn report).
        const block = tableBlocks[idx];
        const menuContent = block ?? message.content;
        const useSnapshot = perTableSnapshot; // 1 bảng (hoặc fallback) → giữ cột ẩn
        return (
        <div className="my-4">
          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
            {/* className mang "chat-report-table" (rehypeReportTableCols) → kích hoạt min-width cột. */}
            <table className={clsx("w-full border-collapse text-[13px]", className)}>
              {children}
            </table>
          </div>
          {/* Action bar của bảng — canh PHẢI, sát mép bảng. Menu mở LÊN trên
              (bottom-full) để bấm không phải kéo trang xuống. */}
          <div className="mt-1.5 flex justify-end">
            <TableExportMenu
              content={menuContent}
              title="Tổng hợp báo cáo công việc"
              sessionId={useSnapshot ? message.exportSessionId : undefined}
              exportId={useSnapshot ? message.exportId : undefined}
            />
          </div>
        </div>
        );
      },
      // thead/tbody/tr/th/td dùng chung với màn Công ty (AiAnswerContent) để
      // style bảng báo cáo đồng bộ 2 màn. <table> giữ riêng (có TableExportMenu).
      ...reportTableComponents,

      // ── Links ──────────────────────────────────────────────────────────
      a: ({ href, children }: React.ComponentPropsWithoutRef<"a">) => {
        const label = (React.Children.toArray(children) as React.ReactNode[])
          .map((c) => (typeof c === "string" ? c : ""))
          .join("");

        // Link xuất Excel bảng gộp báo cáo cấp (#LDDV_baocao / #TCT_tonghop):
        // /api/level-reports/export?week_start=... — tải kèm auth (GET cần Bearer).
        const exportUrl = parseLevelReportExportHref(href);
        if (exportUrl) {
          const isExportLoading = loadingExportHref === exportUrl;
          const handleExportClick = (e: React.MouseEvent) => {
            e.preventDefault();
            if (isExportLoading) return;
            setLoadingExportHref(exportUrl);
            downloadLevelReportExport(exportUrl)
              .then(() => toast.success("Đã tải bảng tổng hợp."))
              .catch((err) =>
                toast.error(err instanceof Error ? err.message : "Không thể tải file."),
              )
              .finally(() => setLoadingExportHref(null));
          };
          return (
            <button
              type="button"
              onClick={handleExportClick}
              disabled={isExportLoading}
              className="inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 active:bg-[#1976D2]/15 disabled:opacity-60"
              title={label || "Tải bảng tổng hợp (.xlsx)"}
            >
              {isExportLoading ? (
                <Loader2Icon size={12} strokeWidth={2} className="shrink-0 animate-spin" />
              ) : (
                <DownloadIcon size={12} strokeWidth={2} className="shrink-0" />
              )}
              <span className="truncate">{children}</span>
            </button>
          );
        }

        // File đính kèm báo cáo NGÀY (owner + quản lý) — tải kèm auth header.
        const workFileId = parseWorkReportFileHref(href);
        if (workFileId != null) {
          const isWorkLoading = loadingWorkFileId === workFileId;
          const successMsg = label
            ? `Đã tải "${label}" thành công.`
            : "Đã tải tệp thành công.";

          const handleWorkClick = (e: React.MouseEvent) => {
            e.preventDefault();
            if (isWorkLoading) return;

            const picker = getSaveFilePicker();
            if (picker) {
              // Phải gọi picker NGAY trong user gesture (trước mọi await) để giữ
              // quyền mở hộp thoại lưu. Toast chỉ hiện sau khi ghi file xong.
              picker({ suggestedName: label || `work-report-file-${workFileId}` })
                .then(async (handle) => {
                  setLoadingWorkFileId(workFileId);
                  const { blob } = await fetchWorkReportFileBlob(
                    workFileId,
                    label || undefined,
                  );
                  const writable = await handle.createWritable();
                  await writable.write(blob);
                  await writable.close();
                  toast.success(successMsg);
                })
                .catch((err) => {
                  // Người dùng bấm Hủy ở hộp thoại lưu → không báo gì.
                  if (err instanceof DOMException && err.name === "AbortError") return;
                  toast.error(err instanceof Error ? err.message : "Không thể tải tệp.");
                })
                .finally(() => setLoadingWorkFileId(null));
              return;
            }

            // Trình duyệt không hỗ trợ (Firefox/Safari): tải trực tiếp; không thể
            // biết thời điểm người dùng lưu nên báo ngay khi tải xong.
            setLoadingWorkFileId(workFileId);
            downloadWorkReportFile(workFileId, label || undefined)
              .then(() => toast.success(successMsg))
              .catch((err) => {
                toast.error(err instanceof Error ? err.message : "Không thể tải tệp.");
              })
              .finally(() => setLoadingWorkFileId(null));
          };
          return (
            <button
              type="button"
              onClick={handleWorkClick}
              disabled={isWorkLoading}
              className="inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 active:bg-[#1976D2]/15 disabled:opacity-60"
              title={label || "Tải về máy"}
            >
              {isWorkLoading ? (
                <Loader2Icon size={12} strokeWidth={2} className="shrink-0 animate-spin" />
              ) : (
                <DownloadIcon size={12} strokeWidth={2} className="shrink-0" />
              )}
              <span className="truncate">{children}</span>
            </button>
          );
        }

        const action = resolveWeeklyReportFileAction(href, label);

        if (!action) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1565C0] underline hover:text-[#1976D2] transition-colors"
            >
              {children}
            </a>
          );
        }

        const isThisLoading = loadingFileId === action.fileId;
        const isDownload = action.mode === "download";

        const handleClick = (e: React.MouseEvent) => {
          e.preventDefault();
          if (isThisLoading) return;
          const viewTab = !isDownload ? window.open("about:blank", "_blank") : null;
          setLoadingFileId(action.fileId);
          openWeeklyReportFile(action.fileId, action.mode, viewTab)
            .catch(() => { viewTab?.close(); })
            .finally(() => setLoadingFileId(null));
        };

        return (
          <button
            type="button"
            onClick={handleClick}
            disabled={isThisLoading}
            className={clsx(
              "inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 active:bg-[#1976D2]/15 disabled:opacity-60",
              !isDownload && "max-w-full",
            )}
            title={label || (isDownload ? "Tải về máy" : "Xem file")}
          >
            {isThisLoading ? (
              <Loader2Icon size={12} strokeWidth={2} className="shrink-0 animate-spin" />
            ) : isDownload ? (
              <DownloadIcon size={12} strokeWidth={2} className="shrink-0" />
            ) : null}
            <span className={clsx(!isDownload && "truncate")}>{children}</span>
          </button>
        );
      },
    }),
    [
      loadingFileId,
      loadingWorkFileId,
      loadingExportHref,
      message.content,
      tableBlocks,
      perTableSnapshot,
      message.exportSessionId,
      message.exportId,
    ],
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group w-full bg-surface"
    >
      <div className={clsx("w-full", AI_MESSAGE_ROW_PADDING)}>
        <div
          className={clsx(
            "flex gap-3.5",
            // User: avatar căn GIỮA bong bóng (không cao lêu nghêu, không thấp
            // quá). Assistant: căn đỉnh vì câu trả lời dài.
            isUser ? "flex-row-reverse items-center" : "flex-row items-start",
          )}
        >
          <AiMessageAvatar role={message.role} isError={message.isError} />

          {/* Content */}
          <div
            className={clsx(
              "flex min-w-0 flex-1 flex-col",
              isUser ? "items-end" : "items-start",
            )}
          >
            {/* Role label — chỉ hiện cho assistant. User bỏ nhãn "Bạn" để bong
                bóng + avatar căn đáy gọn như bên chat (nhãn đẩy avatar lên cao). */}
            {isAssistant && (
              <span className="mb-1 text-xs font-semibold text-text-muted">
                Trợ lý ảo cá nhân
              </span>
            )}

            {/* Thinking phase indicator */}
            {isAssistant && message.thinkingPhase && (
              <ThinkingIndicator phase={message.thinkingPhase} />
            )}

            {/* Message body */}
            <div
              className={clsx(
                isUser
                  ? "w-fit max-w-[76%] rounded-2xl rounded-tr-sm bg-surface-hover px-4 py-3 text-[12px] leading-[1.4] text-text-primary break-words text-justify"
                  : "w-full",
              )}
            >
              {isAssistant &&
              message.isStreaming &&
              !message.content &&
              !message.thinkingPhase ? (
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full bg-text-muted animate-bounce"
                      style={{
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: "1s",
                      }}
                    />
                  ))}
                </div>
              ) : message.formRequest ? (
                <WorkReportForm
                  data={message.formRequest}
                  onSuccess={(msg) =>
                    activeConversationId &&
                    patchMessage(activeConversationId, message.id, {
                      content: msg,
                      formRequest: undefined,
                      isStreaming: false,
                    })
                  }
                  onCancel={() =>
                    activeConversationId &&
                    patchMessage(activeConversationId, message.id, {
                      content: "Đã hủy báo cáo.",
                      formRequest: undefined,
                      isStreaming: false,
                    })
                  }
                />
              ) : message.weeklyReportList ? (
                <PersonalWeeklyReportFiles />
              ) : message.scopeRequired ? (
                <WorkReportScopeSelector
                  onCancel={() =>
                    activeConversationId &&
                    patchMessage(activeConversationId, message.id, {
                      content: "Đã hủy chọn phạm vi báo cáo.",
                      scopeRequired: undefined,
                      isStreaming: false,
                    })
                  }
                />
              ) : message.selectionRequest ? (
                <DepartmentSelector
                  data={message.selectionRequest}
                  onCancel={() =>
                    activeConversationId &&
                    patchMessage(activeConversationId, message.id, {
                      content: "Đã hủy.",
                      selectionRequest: undefined,
                      isStreaming: false,
                    })
                  }
                />
              ) : message.reportRequest && (message.content || !message.isStreaming) ? (
                <ReportTextBox
                  content={message.content}
                  isStreaming={message.isStreaming}
                  onCancel={() =>
                    activeConversationId &&
                    patchMessage(activeConversationId, message.id, {
                      content: "Đã đóng báo cáo công việc.",
                      reportRequest: undefined,
                      isStreaming: false,
                    })
                  }
                />
              ) : isAssistant && message.calendarEvents ? (
                // `calendarEvents` tồn tại (kể cả mảng rỗng sau khi xóa hết) →
                // luôn render bảng, KHÔNG rơi về markdown (markdown còn giữ mọi
                // dòng gốc → "xóa xong lại hiện dòng cũ"). undefined mới về markdown.
                <CalendarEventTable
                  events={message.calendarEvents}
                  conversationId={activeConversationId}
                  messageId={message.id}
                />
              ) : isAssistant ? (
                <div className="prose-chatgpt">
                  {((tableIndexRef.current = 0), null)}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[
                      rehypeReportTableCols,
                      [rehypeSanitize, reportTableSanitizeSchema],
                    ]}
                    components={markdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.isStreaming && message.content && <StreamingCursor />}
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words text-[12px] leading-[1.4] text-justify">
                  {message.content}
                </div>
              )}
            </div>

            {/* Citations */}
            {isAssistant &&
              !message.isStreaming &&
              message.citations &&
              message.citations.length > 0 && (
                <div className="w-full max-w-[680px]">
                  <CitationChips citations={message.citations} />
                </div>
              )}

            {/* Action bar: chỉ nút Sao chép TOÀN BỘ câu trả lời. Menu `...` cho
                từng bảng (sao chép/tải bảng đó) nằm ngay dưới mỗi bảng trong
                markdownComponents.table. */}
            {isAssistant && !message.isStreaming && (
              <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  title="Sao chép câu trả lời"
                >
                  {copied ? (
                    <CheckIcon size={13} className="text-green-600" />
                  ) : (
                    <CopyIcon size={13} />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
