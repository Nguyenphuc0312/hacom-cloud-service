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
import { usePersonalDocuments } from "../../hooks/usePersonalDocuments";

interface HashCommand {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

const HASH_COMMANDS: HashCommand[] = [
  {
    id: "congviectuan",
    label: "#congviectuan",
    description: "Gửi báo cáo công việc tuần",
    prompt: "#congviectuan",
  },
  {
    id: "tongcvtuan",
    label: "#tongcvtuan",
    description: "Tổng hợp báo cáo tuần",
    prompt: "#tongcvtuan",
  },
  {
    id: "baocaocongviec",
    label: "#baocaocongviec",
    description: "Gửi báo cáo công việc hằng ngày",
    prompt: "#baocaocongviec",
  },
  {
    id: "baocaocv",
    label: "#baocaocv",
    description: "Tổng hợp báo cáo công việc ngày",
    prompt: "#baocaocv",
  },
];

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
    const [hashMenuOpen, setHashMenuOpen] = useState(false);
    const [hashQuery, setHashQuery] = useState("");
    const [hashSelectedIdx, setHashSelectedIdx] = useState(0);

    const filteredHashCommands = useMemo(() => {
      if (!hashMenuOpen) return [];
      const q = hashQuery.toLowerCase();
      if (!q) return HASH_COMMANDS;
      return HASH_COMMANDS.filter(
        (cmd) =>
          cmd.id.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q),
      );
    }, [hashMenuOpen, hashQuery]);

    const handleSelectHashCommand = useCallback(
      (cmd: HashCommand) => {
        setHashMenuOpen(false);
        setHashQuery("");
        onChange("");
        if (ref && "current" in ref && ref.current) {
          ref.current.style.height = "52px";
        }
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
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    }, []);

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

    // Reset height on submit (when value cleared externally)
    useEffect(() => {
      if (!value && ref && "current" in ref && ref.current) {
        ref.current.style.height = "52px";
      }
    }, [value, ref]);

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

            {/* Textarea */}
            <textarea
              ref={ref}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isStreaming || isUploading}
              className="flex-1 resize-none bg-transparent px-2 py-3.5 text-xs leading-6 text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70"
              style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
              aria-label="Nhập câu hỏi"
            />

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

        <p className="mt-1.5 text-center text-[10px] text-text-disabled">
          AI có thể đưa ra thông tin không chính xác. Hãy kiểm chứng thông tin
          quan trọng.
        </p>
      </div>
    );
  },
);

PersonalChatInput.displayName = "PersonalChatInput";
