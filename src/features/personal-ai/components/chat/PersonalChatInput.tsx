import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  ArrowUpIcon,
  FileTextIcon,
  HashIcon,
  Loader2Icon,
  PaperclipIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { ActiveSourcePills } from "./ActiveSourcePills";
import { splitTagSegments, tagBeforeCursor } from "./tagText";
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";
import { useVisibleReportTags } from "../../permissions/useVisibleReportTags";
import type { ReportTagCommand } from "../../permissions/reportTags";

// #tongcvtuan/#tongcvthang ĐÃ BỎ (báo cáo tuần 4 cấp, spec 08/07). Danh sách tag
// + quy tắc ẩn/hiện theo quyền SUBMIT nằm ở `permissions/reportTags.ts` (spec
// 31/07) — dùng chung với AiPromptBox, đừng khai báo lại ở đây.
type HashCommand = ReportTagCommand;

const WEEKLY_REPORT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv";

interface PersonalChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  isRagMode?: boolean;
  /** File đang stage để gửi kèm câu hỏi. */
  pendingFile?: File | null;
  /** Callback khi user chọn file. */
  onAttachFile?: (file: File) => void;
  /** Callback xoá file đã stage. */
  onRemoveFile?: () => void;
  /** Đang upload (disable gửi và textarea). */
  isUploading?: boolean;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 6;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

/**
 * Typography + padding dùng CHUNG cho textarea và lớp phủ tô màu. Đổi ở đây là
 * đổi cả hai — tách ra là chữ lệch nhau, sinh bóng đôi.
 */
const TEXT_BOX_CLASS = "px-2 py-3.5 text-xs leading-6";

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PersonalChatInput = forwardRef<
  HTMLTextAreaElement,
  PersonalChatInputProps
>(
  (
    {
      value,
      onChange,
      onSubmit,
      onStop,
      isStreaming = false,
      pendingFile = null,
      onAttachFile,
      onRemoveFile,
      isUploading = false,
    },
    ref,
  ) => {
    const { activeDocuments, isRagMode, handleToggleSource } =
      usePersonalDocuments();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hashMenuRef = useRef<HTMLDivElement>(null);
    /** Lớp phủ tô màu tag — phải cuộn theo textarea khi nội dung dài. */
    const overlayRef = useRef<HTMLDivElement>(null);
    const [hashMenuOpen, setHashMenuOpen] = useState(false);
    const [hashQuery, setHashQuery] = useState("");
    const [hashSelectedIdx, setHashSelectedIdx] = useState(0);

    const hashCommands = useVisibleReportTags();

    const filteredHashCommands = useMemo(() => {
      if (!hashMenuOpen) return [];
      const q = hashQuery.toLowerCase();
      if (!q) return hashCommands;
      return hashCommands.filter(
        (cmd) =>
          cmd.id.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q),
      );
    }, [hashMenuOpen, hashQuery, hashCommands]);

    const handleSelectHashCommand = useCallback(
      (cmd: HashCommand) => {
        setHashMenuOpen(false);
        setHashQuery("");
        if (ref && "current" in ref && ref.current) {
          ref.current.style.height = "52px";
        }
        // Tag NỘP báo cáo: chỉ điền vào ô nhập, KHÔNG gửi. Người dùng còn phải
        // đính tệp và soát lại — chọn nhầm trong menu không được biến thành một
        // bản báo cáo đã gửi đi.
        if (cmd.submits) {
          onChange(cmd.prompt);
          setTimeout(() => {
            const el = ref && "current" in ref ? ref.current : null;
            if (!el) return;
            el.focus();
            el.setSelectionRange(cmd.prompt.length, cmd.prompt.length);
          }, 0);
          return;
        }
        onChange("");
        onSubmit(cmd.prompt);
      },
      [onChange, onSubmit, ref],
    );

    useEffect(() => {
      if (!hashMenuOpen) return;
      const handlePointerDown = (event: MouseEvent) => {
        if (
          hashMenuRef.current &&
          !hashMenuRef.current.contains(event.target as Node)
        ) {
          setHashMenuOpen(false);
        }
      };
      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [hashMenuOpen]);

    const adjustHeight = useCallback((el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      const h = Math.min(el.scrollHeight, MAX_HEIGHT);
      el.style.height = `${h}px`;
      // Lớp phủ phải cao ĐÚNG bằng textarea, nếu không tầm cuộn hai lớp lệch.
      if (overlayRef.current) overlayRef.current.style.height = `${h}px`;
    }, []);

    /** Nội dung vượt 6 dòng → textarea cuộn, lớp phủ phải cuộn theo cùng nhịp. */
    const syncOverlayScroll = useCallback(
      (e: React.UIEvent<HTMLTextAreaElement>) => {
        const overlay = overlayRef.current;
        if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
      },
      [],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        adjustHeight(e.target);

        const match = newValue.match(/(#\w*)$/);
        if (match) {
          setHashQuery(match[1].slice(1));
          setHashMenuOpen(true);
          setHashSelectedIdx(0);
        } else {
          setHashMenuOpen(false);
        }
      },
      [onChange, adjustHeight],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (hashMenuOpen && filteredHashCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHashSelectedIdx((i) => (i + 1) % filteredHashCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHashSelectedIdx(
            (i) =>
              (i - 1 + filteredHashCommands.length) %
              filteredHashCommands.length,
          );
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const selected = filteredHashCommands[hashSelectedIdx];
          if (selected) handleSelectHashCommand(selected);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setHashMenuOpen(false);
          return;
        }
      }

      // Backspace ngay sau một tag → xóa TRỌN tag, như chip @ bên chat. Có vùng
      // chọn thì để trình duyệt xử lý bình thường.
      if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.currentTarget;
        if (el.selectionStart === el.selectionEnd) {
          const tag = tagBeforeCursor(value, el.selectionStart);
          if (tag) {
            e.preventDefault();
            const next = value.slice(0, tag.start) + value.slice(el.selectionStart);
            onChange(next);
            setHashMenuOpen(false);
            setTimeout(() => {
              el.focus();
              el.setSelectionRange(tag.start, tag.start);
              adjustHeight(el);
            }, 0);
            return;
          }
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed && !isStreaming && !isUploading) {
          onSubmit(trimmed);
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "52px";
          }
        }
      }
    };

    // Đồng bộ chiều cao hai lớp mỗi khi `value` đổi từ BÊN NGOÀI (chọn tag ở
    // menu, gửi xong bị xoá trắng…). Không có nhánh này thì lớp phủ giữ chiều
    // cao cũ và lệch tầm cuộn so với textarea.
    useEffect(() => {
      const el = ref && "current" in ref ? ref.current : null;
      if (!el) return;
      if (!value) {
        el.style.height = "52px";
        if (overlayRef.current) overlayRef.current.style.height = "52px";
        return;
      }
      adjustHeight(el);
    }, [value, ref, adjustHeight]);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file && onAttachFile) {
          onAttachFile(file);
        }
      },
      [onAttachFile],
    );

    const canSend =
      value.trim().length > 0 && !isStreaming && !isUploading;
    const attachDisabled = isStreaming || isUploading || !!pendingFile;

    const placeholder = pendingFile
      ? "Đặt câu hỏi về tệp đã đính kèm..."
      : isRagMode
        ? `Hỏi AI về ${
            activeDocuments.length > 1
              ? `${activeDocuments.length} tài liệu`
              : activeDocuments[0]?.name.replace(/\.(pdf|doc|docx|xls|xlsx)$/i, "") ??
                "tài liệu"
          }…`
        : "Hỏi bất cứ điều gì…";

    return (
      <div className="relative w-full">
        {/* Hash command dropdown */}
        {hashMenuOpen && filteredHashCommands.length > 0 && (
          <div
            ref={hashMenuRef}
            role="listbox"
            aria-label="Lệnh nhanh"
            className="absolute bottom-full left-0 z-50 mb-2 w-max max-w-[min(360px,90%)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="px-2.5 py-1.5 border-b border-border/50">
              <span className="text-[11px] font-medium text-text-muted">Lệnh nhanh</span>
            </div>
            {filteredHashCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                role="option"
                aria-selected={idx === hashSelectedIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectHashCommand(cmd);
                }}
                onMouseEnter={() => setHashSelectedIdx(idx)}
                className={clsx(
                  "flex w-full items-center gap-2 px-2.5 py-1 text-left transition-colors",
                  idx === hashSelectedIdx
                    ? "bg-[#1976D2]/10"
                    : "hover:bg-surface-hover",
                )}
              >
                <HashIcon
                  size={12}
                  strokeWidth={2}
                  className={clsx(
                    "shrink-0",
                    idx === hashSelectedIdx ? "text-[#1565C0]" : "text-text-muted",
                  )}
                />
                <span
                  className={clsx(
                    "text-[12px] font-medium shrink-0",
                    idx === hashSelectedIdx ? "text-[#1565C0]" : "text-text-primary",
                  )}
                >
                  {cmd.label}
                </span>
                <span className="text-[11px] text-text-muted truncate">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Source pills row */}
        <div className="mb-2">
          <ActiveSourcePills
            activeDocuments={activeDocuments}
            onRemoveSource={handleToggleSource}
            isRagMode={isRagMode}
          />
        </div>

        {/* Input surface */}
        <div
          className={clsx(
            "relative flex flex-col rounded-2xl border bg-surface shadow-sm transition-all duration-150",
            isRagMode
              ? "border-[#1976D2]/30 focus-within:border-[#1976D2]/60 focus-within:ring-2 focus-within:ring-[#1976D2]/15 focus-within:shadow-md"
              : "border-border focus-within:border-border-strong focus-within:ring-2 focus-within:ring-border/20 focus-within:shadow-md",
          )}
        >
          {/* Pending file chip */}
          {pendingFile && (
            <div className="px-3 pt-3">
              <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1976D2]/10 text-[#1565C0]">
                  {isUploading ? (
                    <Loader2Icon size={16} strokeWidth={2} className="animate-spin" />
                  ) : (
                    <FileTextIcon size={16} strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{pendingFile.name}</div>
                  <div className="text-xs text-text-muted">
                    {isUploading
                      ? "Đang tải lên..."
                      : formatFileSize(pendingFile.size) || "Đã đính kèm"}
                  </div>
                </div>
                {onRemoveFile && !isUploading && (
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-active hover:text-text-secondary transition-colors"
                    aria-label="Xoá tệp đính kèm"
                  >
                    <XIcon size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={WEEKLY_REPORT_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />
            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachDisabled}
              className={clsx(
                "flex h-10 w-10 shrink-0 ml-2 mb-1.5 items-center justify-center rounded-full text-text-muted transition-colors",
                attachDisabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:text-text-secondary hover:bg-surface-hover cursor-pointer",
              )}
              aria-label={pendingFile ? "Đã đính kèm tệp — xoá trước khi chọn tệp khác" : "Đính kèm tệp"}
              title={pendingFile ? "Đã đính kèm tệp — xoá trước khi chọn tệp khác" : "Đính kèm tệp báo cáo (PDF, DOC, DOCX, XLS, XLSX…)"}
            >
              <PaperclipIcon size={18} strokeWidth={2} />
            </button>

            {/* Textarea + lớp phủ tô màu tag.
                Lớp phủ vẽ lại đúng nội dung ở phía sau; textarea nằm trên với
                chữ trong suốt (caret vẫn hiện nhờ caret-color). Hai lớp DÙNG
                CHUNG `TEXT_BOX_CLASS` nên chữ chồng khít — lệch một px là thấy
                bóng đôi ngay. */}
            <div className="relative flex-1">
              <div
                aria-hidden="true"
                ref={overlayRef}
                className={clsx(
                  TEXT_BOX_CLASS,
                  // `top-0 left-0 w-full` + chiều cao ĐỒNG BỘ từ textarea, KHÔNG
                  // dùng `inset-0`: inset-0 kéo lớp phủ cao bằng container cha
                  // (cao hơn textarea 6px do min-height), làm hai tầm cuộn lệch
                  // nhau khi nội dung dài — đo được bằng Chromium.
                  "pointer-events-none absolute left-0 top-0 w-full overflow-hidden whitespace-pre-wrap break-words text-text-primary",
                  // Mờ cùng nhịp với textarea lúc bị khoá, nếu không hai lớp
                  // lệch độ đậm và lộ ra là có lớp phủ.
                  (isStreaming || isUploading) && "opacity-70",
                )}
              >
                {splitTagSegments(value).map((seg, i) =>
                  seg.isTag ? (
                    // KHÔNG padding/margin ngang và KHÔNG đổi font-weight: mọi
                    // thứ làm chữ rộng ra sẽ đẩy tag lệch khỏi chữ thật trong
                    // textarea nằm đè lên → bóng đôi. Nền vẽ bằng box-shadow
                    // nên nó nở ra ngoài mà không chiếm chỗ trong dòng chữ.
                    <span
                      key={i}
                      className="rounded text-[#1565C0]"
                      style={{
                        // Nền + viền nở ra ngoài để dày như chip @ mà KHÔNG
                        // chiếm chỗ trong dòng chữ (padding/font-weight sẽ đẩy
                        // lệch khỏi textarea nằm đè lên → bóng đôi).
                        // Viết inline: `bg-[#1976D2]/16` từng bị Tailwind bỏ qua
                        // (thang opacity không có nấc 16) nên nền ra trong suốt.
                        backgroundColor: "rgb(25 118 210 / 0.16)",
                        boxShadow: "0 0 0 3px rgb(25 118 210 / 0.16)",
                      }}
                    >
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
                {/* KHÔNG chèn ký tự phụ ở đây: đo bằng Chromium thấy nó làm lớp
                    phủ cao hơn textarea 6px, khiến hai lớp cuộn lệch nhau khi
                    nội dung dài. `whitespace-pre-wrap` đã giữ dòng cuối rồi. */}
              </div>

              <textarea
                ref={ref}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={syncOverlayScroll}
                placeholder={placeholder}
                rows={1}
                disabled={isStreaming || isUploading}
                className={clsx(
                  TEXT_BOX_CLASS,
                  "relative w-full resize-none bg-transparent text-transparent caret-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70",
                )}
                style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
                aria-label="Nhập câu hỏi"
              />
            </div>

            {/* Send / Stop */}
            <div className="flex items-center pr-3 pb-2">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95"
                  style={{
                    background:
                      "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
                    boxShadow: "0 2px 8px rgba(21,101,192,0.35)",
                  }}
                  aria-label="Dừng"
                >
                  <SquareIcon size={13} fill="white" strokeWidth={0} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = value.trim();
                    if (canSend) {
                      onSubmit(trimmed);
                      if (ref && "current" in ref && ref.current) {
                        ref.current.style.height = "52px";
                      }
                    }
                  }}
                  disabled={!canSend}
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                    canSend
                      ? "text-white hover:brightness-110 active:scale-95"
                      : "bg-surface-active text-text-disabled cursor-not-allowed",
                  )}
                  style={
                    canSend
                      ? {
                          background: isRagMode
                            ? "linear-gradient(135deg, #1565C0 0%, #1976D2 60%, #1976D2 100%)"
                            : "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)",
                          boxShadow: isRagMode
                            ? "0 2px 8px rgba(21,101,192,0.3)"
                            : "0 2px 8px rgba(21,101,192,0.25)",
                        }
                      : undefined
                  }
                  aria-label={pendingFile ? "Gửi câu hỏi kèm tệp" : "Gửi"}
                >
                  {isUploading ? (
                    <Loader2Icon size={16} strokeWidth={2.5} className="animate-spin" />
                  ) : (
                    <ArrowUpIcon size={17} strokeWidth={2.5} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-center text-[11px] text-text-muted">
          AI có thể đưa ra thông tin không chính xác. Hãy kiểm chứng các thông
          tin quan trọng.
        </p>
      </div>
    );
  },
);

PersonalChatInput.displayName = "PersonalChatInput";
