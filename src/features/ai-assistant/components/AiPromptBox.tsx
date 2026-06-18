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
  SquareIcon,
  PaperclipIcon,
  Loader2Icon,
  FileTextIcon,
  XIcon,
  FolderOpenIcon,
  UploadIcon,
  HashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChatUiStore } from "../../../features/chat/state/chatUiStore";
import { toast } from "../../../utils/toast";

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
    prompt: "Gửi báo cáo công việc tuần",
  },
  {
    id: "tongcvtuan",
    label: "#tongcvtuan",
    description: "Tổng hợp báo cáo tuần",
    prompt: "Tổng hợp báo cáo công việc tuần",
  },
  {
    id: "baocaocongviec",
    label: "#baocaocongviec",
    description: "Gửi báo cáo công việc hằng ngày",
    prompt: "Gửi báo cáo công việc hằng ngày",
  },
  {
    id: "baocaocv",
    label: "#baocaocv",
    description: "Tổng hợp báo cáo công việc ngày",
    prompt: "Tổng hợp báo cáo công việc ngày",
  },
];

interface AiPromptBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  /**
   * Khi truyền vào, nút đính kèm sẽ mở file picker và gọi callback này.
   * Nếu không truyền, nút sẽ hiển thị thông báo "chưa hỗ trợ".
   */
  onAttachFiles?: (files: File[]) => void | Promise<void>;
  /** Loại file được chấp nhận (mặc định cho tài liệu/ảnh phổ biến). */
  attachAccept?: string;
  /** Cho phép chọn nhiều file một lúc (mặc định true). */
  attachMultiple?: boolean;
  /** Đang upload — disable nút và đổi icon. */
  isUploading?: boolean;
  /** File đang được "stage" để gửi kèm câu hỏi. */
  pendingAttachment?: { file: File } | null;
  /** Xoá file đã stage. */
  onRemoveAttachment?: () => void;
  /** Placeholder gợi ý câu hỏi khi đã có file pending. */
  attachmentHint?: string;
  /** Bật menu đính kèm báo cáo tuần (tải mới / danh sách). */
  weeklyReportAttachMenu?: boolean;
  /** Mở dialog danh sách báo cáo đã tải lên. */
  onOpenWeeklyReports?: () => void;
  /** Đăng ký hàm mở file picker (dùng từ dialog danh sách báo cáo). */
  onRegisterFilePicker?: (open: () => void) => void;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 8;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;

/**
 * Thanh nhập liệu kiểu ChatGPT – bo tròn capsule, auto resize,
 * nút gửi tròn đen ở góc phải, nút attach file bên trái.
 */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AiPromptBox = forwardRef<HTMLTextAreaElement, AiPromptBoxProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      onStop,
      isLoading = false,
      onAttachFiles,
      attachAccept = ".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,image/*",
      attachMultiple = true,
      isUploading = false,
      pendingAttachment = null,
      onRemoveAttachment,
      attachmentHint,
      weeklyReportAttachMenu = false,
      onOpenWeeklyReports,
      onRegisterFilePicker,
    },
    ref,
  ) => {
    const { t } = useTranslation("aiAssistant");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const hashMenuRef = useRef<HTMLDivElement>(null);
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [hashMenuOpen, setHashMenuOpen] = useState(false);
    const [hashQuery, setHashQuery] = useState("");
    const [hashSelectedIdx, setHashSelectedIdx] = useState(0);
    const attachDisabled = isLoading || isUploading || !!pendingAttachment;

    const { selectedEndpoint } = useChatUiStore();
    const isCompany = selectedEndpoint === "company";

    /** Tự điều chỉnh chiều cao textarea */
    const adjustHeight = useCallback((textarea: HTMLTextAreaElement) => {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }, []);

    const handleAttachClick = useCallback(() => {
      if (attachDisabled) return;
      if (weeklyReportAttachMenu && onOpenWeeklyReports) {
        setAttachMenuOpen((open) => !open);
        return;
      }
      fileInputRef.current?.click();
    }, [attachDisabled, weeklyReportAttachMenu, onOpenWeeklyReports]);

    const handlePickUploadFile = useCallback(() => {
      setAttachMenuOpen(false);
      fileInputRef.current?.click();
    }, []);

    const handleOpenWeeklyReports = useCallback(() => {
      setAttachMenuOpen(false);
      onOpenWeeklyReports?.();
    }, [onOpenWeeklyReports]);

    useEffect(() => {
      onRegisterFilePicker?.(() => {
        fileInputRef.current?.click();
      });
    }, [onRegisterFilePicker]);

    useEffect(() => {
      if (!attachMenuOpen) return;
      const handlePointerDown = (event: MouseEvent) => {
        if (
          attachMenuRef.current &&
          !attachMenuRef.current.contains(event.target as Node)
        ) {
          setAttachMenuOpen(false);
        }
      };
      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [attachMenuOpen]);

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

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const files = Array.from(fileList);
        // Reset trước để có thể chọn lại cùng file lần sau (kể cả khi callback throw)
        e.target.value = "";

        if (onAttachFiles) {
          void onAttachFiles(files);
          return;
        }

        const fileName = files[0].name;
        const more = files.length > 1 ? ` (+${files.length - 1})` : "";
        toast.info(
          `Đã chọn "${fileName}"${more}. Tính năng đính kèm tài liệu cho trợ lý AI sẽ sớm có mặt.`,
        );
      },
      [onAttachFiles],
    );

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
        // Clear input and immediately submit the command prompt
        onChange("");
        if (ref && "current" in ref && ref.current) {
          ref.current.style.height = "52px";
        }
        onSubmit(cmd.prompt);
      },
      [onChange, onSubmit, ref],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        onChange(newValue);
        adjustHeight(e.target);

        if (!isCompany) {
          const match = newValue.match(/(#\w*)$/);
          if (match) {
            setHashQuery(match[1].slice(1));
            setHashMenuOpen(true);
            setHashSelectedIdx(0);
          } else {
            setHashMenuOpen(false);
          }
        }
      },
      [onChange, adjustHeight, isCompany],
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
        if (e.key === "Enter" && !e.shiftKey) {
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
        if (value.trim() && !isLoading && !isUploading) {
          onSubmit(value.trim());
          if (ref && "current" in ref && ref.current) {
            ref.current.style.height = "52px";
          }
        }
      }
    };

    const hasText = value.trim().length > 0;
    const canSend = hasText && !isLoading && !isUploading;
    const textareaDisabled = isLoading || isUploading;

    const placeholder = pendingAttachment
      ? attachmentHint || "Đặt câu hỏi về tệp đã đính kèm..."
      : isCompany
        ? "Hỏi về quy trình & tài liệu công ty..."
        : "Hỏi bất cứ điều gì...";

    return (
      <div className="relative w-full">
        {/* Hash command dropdown */}
        {hashMenuOpen && filteredHashCommands.length > 0 && (
          <div
            ref={hashMenuRef}
            role="listbox"
            aria-label="Lệnh nhanh"
            className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="px-3 py-2 border-b border-border/50">
              <span className="text-xs font-medium text-text-muted">Lệnh nhanh</span>
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
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  idx === hashSelectedIdx
                    ? "bg-[#1976D2]/10"
                    : "hover:bg-surface-hover",
                )}
              >
                <div
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    idx === hashSelectedIdx
                      ? "bg-[#1976D2]/15 text-[#1565C0]"
                      : "bg-surface-hover text-text-muted",
                  )}
                >
                  <HashIcon size={14} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={clsx(
                      "text-sm font-medium",
                      idx === hashSelectedIdx
                        ? "text-[#1565C0]"
                        : "text-text-primary",
                    )}
                  >
                    {cmd.label}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {cmd.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="relative flex flex-col rounded-3xl border border-border bg-surface shadow-sm transition-all focus-within:border-[#1976D2]/60 focus-within:ring-2 focus-within:ring-[#1976D2]/15 focus-within:shadow-md">
          {/* Attachment chip (above textarea) */}
          {pendingAttachment && (
            <div className="px-3 pt-3">
              <div className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1976D2]/10 text-[#1565C0]">
                  {isUploading ? (
                    <Loader2Icon
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                  ) : (
                    <FileTextIcon size={16} strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {pendingAttachment.file.name}
                  </div>
                  <div className="text-xs text-text-muted">
                    {isUploading
                      ? "Đang tải lên..."
                      : formatFileSize(pendingAttachment.file.size) ||
                        "Đã đính kèm"}
                  </div>
                </div>
                {onRemoveAttachment && !isUploading && (
                  <button
                    type="button"
                    onClick={onRemoveAttachment}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-active hover:text-text-secondary transition-colors"
                    aria-label="Xoá tệp đính kèm"
                    title="Xoá tệp đính kèm"
                  >
                    <XIcon size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="relative flex items-end">
            {/* Attach button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple={attachMultiple}
              accept={attachAccept}
              className="hidden"
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div ref={attachMenuRef} className="relative ml-2 mb-1.5 shrink-0">
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={attachDisabled}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors",
                  attachDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:text-text-secondary hover:bg-surface-hover cursor-pointer",
                  attachMenuOpen && "bg-surface-hover text-text-secondary",
                )}
                aria-label={
                  pendingAttachment
                    ? "Đã đính kèm tệp"
                    : isUploading
                      ? "Đang tải lên..."
                      : "Báo cáo tuần"
                }
                title={
                  pendingAttachment
                    ? "Đã đính kèm tệp — xoá trước khi đính kèm tệp khác"
                    : isUploading
                      ? "Đang tải lên..."
                      : "Báo cáo tuần"
                }
                aria-expanded={attachMenuOpen}
                aria-haspopup={weeklyReportAttachMenu ? "menu" : undefined}
              >
                {isUploading ? (
                  <Loader2Icon
                    size={18}
                    strokeWidth={2}
                    className="animate-spin"
                  />
                ) : (
                  <PaperclipIcon size={18} strokeWidth={2} />
                )}
              </button>

              {attachMenuOpen && weeklyReportAttachMenu && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 z-50 mb-2 min-w-[220px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handlePickUploadFile}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                  >
                    <UploadIcon size={16} strokeWidth={2} className="shrink-0" />
                    {t("weeklyReport.menuUpload")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleOpenWeeklyReports}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                  >
                    <FolderOpenIcon
                      size={16}
                      strokeWidth={2}
                      className="shrink-0"
                    />
                    {t("weeklyReport.menuList")}
                  </button>
                </div>
              )}
            </div>

            {/* Textarea */}
            <textarea
              ref={ref}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={textareaDisabled}
              className="flex-1 resize-none bg-transparent py-4 px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-70"
              style={{ minHeight: "52px", maxHeight: `${MAX_HEIGHT}px` }}
            />

            {/* Send / Stop button */}
            <div className="flex items-center pr-2 pb-1.5">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:brightness-105"
                  style={{ background: "linear-gradient(135deg, #1565C0 0%, #1976D2 100%)" }}
                  aria-label="Dừng phản hồi"
                >
                  <SquareIcon size={14} fill="white" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (canSend) {
                      onSubmit(value.trim());
                      if (ref && "current" in ref && ref.current) {
                        ref.current.style.height = "52px";
                      }
                    }
                  }}
                  disabled={!canSend}
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                    canSend
                      ? "text-white hover:brightness-105 cursor-pointer"
                      : "bg-surface-active text-text-disabled cursor-not-allowed",
                  )}
                  style={canSend ? {
                    background: "linear-gradient(to right, #1565C0, #1976D2, #DBEAFE)",
                    boxShadow: "0 2px 8px rgba(196,30,58,0.3)",
                  } : undefined}
                  aria-label={
                    pendingAttachment
                      ? "Gửi câu hỏi kèm tệp"
                      : "Gửi tin nhắn"
                  }
                >
                  {isUploading ? (
                    <Loader2Icon
                      size={16}
                      strokeWidth={2.5}
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowUpIcon size={18} strokeWidth={2.5} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

AiPromptBox.displayName = "AiPromptBox";
