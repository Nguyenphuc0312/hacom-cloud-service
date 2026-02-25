import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { EmojiButton } from "./EmojiButton";
import { AttachmentMenu } from "./AttachmentMenu";
import { AttachmentPreview } from "./AttachmentPreview";
import { SendButton } from "./SendButton";
import {
  useAutoResizeTextarea,
  useSendMessage,
  useTypingIndicator,
} from "../../hooks";
import type { AttachmentPickerMode } from "../../hooks/useSendMessage";
import type { InputMode, Message } from "../../types";
import { UPLOAD_CONFIG } from "../../config";
import { toast } from "../ui";

export interface MentionCandidate {
  id: string;
  username: string;
  displayName?: string;
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => void | Promise<void>;
  mode: InputMode;
  conversationId?: string;
  mentionCandidates?: MentionCandidate[];
  replyToMessage?: Message;
  editingMessage?: Message;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onTyping?: (isTyping: boolean) => void;
  sendOnEnter?: boolean;
  disabled?: boolean;
  className?: string;
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

const isDesktopViewport = (): boolean => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return !window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
};

const buildMentionMatch = (
  text: string,
  caret: number,
): MentionMatch | null => {
  if (caret < 0 || caret > text.length) {
    return null;
  }

  const beforeCaret = text.slice(0, caret);
  const mentionStart = beforeCaret.lastIndexOf("@");
  if (mentionStart < 0) {
    return null;
  }

  const prefixChar = mentionStart === 0 ? " " : beforeCaret[mentionStart - 1];
  const isValidPrefix = /\s|\(|\[|\{|"|'|`/.test(prefixChar);
  if (!isValidPrefix) {
    return null;
  }

  const mentionQuery = beforeCaret.slice(mentionStart + 1);
  if (
    mentionQuery.includes(" ") ||
    mentionQuery.includes("\n") ||
    mentionQuery.includes("\t")
  ) {
    return null;
  }

  if (!/^[a-zA-Z0-9._-]*$/.test(mentionQuery)) {
    return null;
  }

  return {
    start: mentionStart,
    end: caret,
    query: mentionQuery,
  };
};

const normalizeMentionCandidates = (
  mentionCandidates: MentionCandidate[],
): MentionCandidate[] => {
  const seen = new Set<string>();
  const normalized: MentionCandidate[] = [];

  mentionCandidates.forEach((candidate) => {
    const username = candidate.username.trim();
    if (!username) return;

    const key = `${candidate.id}:${username.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    normalized.push({
      id: candidate.id,
      username,
      displayName: candidate.displayName?.trim() || undefined,
    });
  });

  return normalized;
};

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  mode,
  conversationId,
  mentionCandidates = [],
  replyToMessage,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onTyping,
  sendOnEnter = true,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation();
  const { textareaRef } = useAutoResizeTextarea({
    value,
    minRows: 1,
    maxRows: 6,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [showAttachmentMenu, setShowAttachmentMenu] = React.useState(false);
  const [mentionMatch, setMentionMatch] = React.useState<MentionMatch | null>(
    null,
  );
  const [activeMentionIndex, setActiveMentionIndex] = React.useState(0);
  const [liveRegionMessage, setLiveRegionMessage] = React.useState("");

  const mentionListId = React.useId();

  const {
    selectedFile,
    previewUrl,
    uploadProgress,
    uploadError,
    isUploading,
    isSending,
    selectFile,
    sendTextMessage,
    sendAttachmentMessage,
    clearSelectedFile,
    cancelUpload,
    openFilePicker,
  } = useSendMessage({
    disabled,
    onSend,
  });

  const { notifyInput, notifyBlur, stopTypingNow } = useTypingIndicator({
    enabled: !disabled,
    onTyping,
  });

  const normalizedMentionCandidates = React.useMemo(
    () => normalizeMentionCandidates(mentionCandidates),
    [mentionCandidates],
  );

  const deferredMentionQuery = React.useDeferredValue(
    mentionMatch?.query ?? "",
  );

  const mentionSuggestions = React.useMemo(() => {
    if (!mentionMatch) {
      return [] as MentionCandidate[];
    }

    const query = deferredMentionQuery.trim().toLowerCase();
    if (!query) {
      return normalizedMentionCandidates.slice(0, 8);
    }

    return normalizedMentionCandidates
      .filter((candidate) => {
        const username = candidate.username.toLowerCase();
        const displayName = candidate.displayName?.toLowerCase() || "";
        return username.includes(query) || displayName.includes(query);
      })
      .slice(0, 8);
  }, [deferredMentionQuery, mentionMatch, normalizedMentionCandidates]);

  const showMentionPanel = Boolean(mentionMatch) && !disabled;

  const clearMentionState = React.useCallback(() => {
    setMentionMatch(null);
    setActiveMentionIndex(0);
  }, []);

  const updateMentionState = React.useCallback(
    (nextText: string, caret: number) => {
      const nextMatch = buildMentionMatch(nextText, caret);

      setMentionMatch(nextMatch);
      setActiveMentionIndex(0);
    },
    [],
  );

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      selectFile(file);
      event.target.value = "";
    },
    [selectFile],
  );

  const handleAttachmentSelect = React.useCallback(
    (type: string) => {
      if (type === "photo" || type === "document") {
        openFilePicker(type as AttachmentPickerMode, fileInputRef.current);
      } else {
        toast.info(t("common:toast.featureInDevelopment"));
      }
      setShowAttachmentMenu(false);
    },
    [openFilePicker, t],
  );

  const handleInsertMentionTrigger = React.useCallback(() => {
    if (disabled || isUploading || isSending) return;

    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}@`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}@${value.slice(end)}`;
    const nextCaret = start + 1;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      updateMentionState(nextValue, nextCaret);
    });
  }, [
    disabled,
    isSending,
    isUploading,
    onChange,
    textareaRef,
    updateMentionState,
    value,
  ]);

  const handleSendText = React.useCallback(async () => {
    const sent = await sendTextMessage(value);
    if (!sent) {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
      return;
    }

    onChange("");
    clearMentionState();
    stopTypingNow();
    setLiveRegionMessage(t("chat:composer.sentAnnouncement"));
  }, [clearMentionState, onChange, sendTextMessage, stopTypingNow, t, value]);

  const handleSendAttachment = React.useCallback(async () => {
    const sent = await sendAttachmentMessage();
    setLiveRegionMessage(
      sent
        ? t("chat:composer.sentAnnouncement")
        : t("chat:composer.failedAnnouncement"),
    );
  }, [sendAttachmentMessage, t]);

  const handlePrimarySend = React.useCallback(async () => {
    if (selectedFile) {
      await handleSendAttachment();
      return;
    }

    await handleSendText();
  }, [handleSendAttachment, handleSendText, selectedFile]);

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const caret = event.target.selectionStart ?? nextValue.length;

      onChange(nextValue);
      updateMentionState(nextValue, caret);

      notifyInput({
        hasText: nextValue.trim().length > 0,
        isFocused: event.target === document.activeElement,
      });
    },
    [notifyInput, onChange, updateMentionState],
  );

  const handleMentionSelect = React.useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionMatch) return;

      const insertion = `@${candidate.username} `;
      const nextValue = `${value.slice(0, mentionMatch.start)}${insertion}${value.slice(mentionMatch.end)}`;
      const nextCaret = mentionMatch.start + insertion.length;

      onChange(nextValue);
      clearMentionState();

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [clearMentionState, mentionMatch, onChange, textareaRef, value],
  );

  const handleRemoveSelectedFile = React.useCallback(() => {
    if (isUploading) {
      cancelUpload();
    }
    clearSelectedFile();
  }, [cancelUpload, clearSelectedFile, isUploading]);

  const handleRetryUpload = React.useCallback(() => {
    void handleSendAttachment();
  }, [handleSendAttachment]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showMentionPanel) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveMentionIndex((current) =>
            mentionSuggestions.length === 0
              ? 0
              : (current + 1) % mentionSuggestions.length,
          );
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveMentionIndex((current) =>
            mentionSuggestions.length === 0
              ? 0
              : (current - 1 + mentionSuggestions.length) %
                mentionSuggestions.length,
          );
          return;
        }

        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          mentionSuggestions.length > 0 &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          const candidate = mentionSuggestions[activeMentionIndex];
          if (candidate) {
            handleMentionSelect(candidate);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          clearMentionState();
          return;
        }
      }

      if (event.key === "Escape") {
        if (mode === "reply") {
          onCancelReply?.();
        }

        if (mode === "edit") {
          onCancelEdit?.();
        }

        return;
      }

      if (
        event.key === "Enter" &&
        sendOnEnter &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        void handlePrimarySend();
      }
    },
    [
      activeMentionIndex,
      clearMentionState,
      handleMentionSelect,
      handlePrimarySend,
      mentionSuggestions,
      mode,
      onCancelEdit,
      onCancelReply,
      sendOnEnter,
      showMentionPanel,
    ],
  );

  React.useEffect(() => {
    if ((mode === "reply" || mode === "edit") && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode, textareaRef]);

  React.useEffect(() => {
    if (!conversationId || !textareaRef.current) return;
    if (!isDesktopViewport()) return;

    textareaRef.current.focus();
  }, [conversationId, textareaRef]);

  React.useEffect(() => {
    if (uploadError) {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
    }
  }, [t, uploadError]);

  React.useEffect(() => {
    if (!showMentionPanel) {
      setActiveMentionIndex(0);
      return;
    }

    setActiveMentionIndex((current) => {
      if (mentionSuggestions.length === 0) {
        return 0;
      }
      return Math.min(current, mentionSuggestions.length - 1);
    });
  }, [mentionSuggestions.length, showMentionPanel]);

  React.useEffect(() => {
    return () => {
      stopTypingNow();
    };
  }, [stopTypingNow]);

  const hasText = value.trim().length > 0;
  const canSend = selectedFile
    ? !disabled && !isUploading && !isSending
    : !disabled && !isSending && hasText;
  const disableToolbar = disabled || isUploading;
  const sendButtonLabel =
    isUploading || isSending
      ? t("chat:composer.sending")
      : t("chat:composer.sendMessage");

  return (
    <div className={clsx("border-t border-border bg-surface", className)}>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveRegionMessage}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {mode === "reply" && replyToMessage && (
        <div className="flex items-center justify-between border-b border-border bg-surface-overlay px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-8 w-1 rounded-full bg-primary" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {t("chat:composer.replyingTo", {
                  name: replyToMessage.senderName,
                })}
              </p>
              <p className="truncate text-xs text-text-muted">
                {replyToMessage.content}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className={clsx(
              "rounded-full p-1 transition-colors hover:bg-surface-active",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:composer.cancelReply")}
          >
            <XMarkIcon className="h-4 w-4 text-text-muted" />
          </button>
        </div>
      )}

      {mode === "edit" && editingMessage && (
        <div className="flex items-center justify-between border-b border-warning/35 bg-warning/15 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-8 w-1 rounded-full bg-warning" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning">
                {t("chat:composer.editing")}
              </p>
              <p className="truncate text-xs text-warning">
                {editingMessage.content}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className={clsx(
              "rounded-full p-1 transition-colors hover:bg-warning/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:composer.cancelEdit")}
          >
            <XMarkIcon className="h-4 w-4 text-warning" />
          </button>
        </div>
      )}

      {selectedFile && (
        <AttachmentPreview
          selectedFile={selectedFile}
          previewUrl={previewUrl}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
          isUploading={isUploading}
          maxFileSizeBytes={UPLOAD_CONFIG.MAX_FILE_SIZE}
          onCancelUpload={cancelUpload}
          onRetryUpload={handleRetryUpload}
          onSendNow={() => void handleSendAttachment()}
          onRemove={handleRemoveSelectedFile}
        />
      )}

      <div className="flex items-center gap-2 px-3 py-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:px-4">
        <EmojiButton
          value={value}
          onChange={onChange}
          textareaRef={textareaRef}
          disabled={disableToolbar}
          className="shrink-0"
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAttachmentMenu((previous) => !previous)}
            className={clsx(
              "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              showAttachmentMenu
                ? "bg-primary text-text-inverse"
                : "text-text-muted hover:bg-surface-overlay hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
              disableToolbar && "cursor-not-allowed opacity-50",
            )}
            aria-label={t("chat:composer.attachFile")}
            aria-haspopup="menu"
            aria-expanded={showAttachmentMenu}
            disabled={disableToolbar}
          >
            <PaperClipIcon className="h-5 w-5" />
          </button>

          {showAttachmentMenu && (
            <AttachmentMenu
              onSelect={handleAttachmentSelect}
              onClose={() => setShowAttachmentMenu(false)}
              className="absolute bottom-full left-0 z-dropdown mb-2"
            />
          )}
        </div>

        <button
          type="button"
          onClick={handleInsertMentionTrigger}
          className={clsx(
            "hidden h-11 w-11 items-center justify-center rounded-full transition-colors md:inline-flex",
            "text-text-muted hover:bg-surface-overlay hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            disableToolbar && "cursor-not-allowed opacity-50",
          )}
          aria-label={t("chat:composer.mentionTrigger")}
          disabled={disableToolbar}
        >
          <AtSymbolIcon className="h-5 w-5" />
        </button>

        <div className="relative flex min-w-0 flex-1 items-center">
          {showMentionPanel && (
            <div
              id={mentionListId}
              role="listbox"
              aria-label={t("chat:composer.mentionList")}
              className={clsx(
                "absolute bottom-full left-0 right-0 z-dropdown mb-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-surface shadow-elev2",
                "p-1",
              )}
            >
              {mentionSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted">
                  {t("chat:composer.noMentionResults")}
                </p>
              ) : (
                mentionSuggestions.map((candidate, index) => {
                  const isActive = index === activeMentionIndex;
                  return (
                    <button
                      key={`${candidate.id}:${candidate.username}`}
                      id={`${mentionListId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={clsx(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
                        "transition-colors",
                        isActive
                          ? "bg-primary/15 text-text-primary"
                          : "text-text-secondary hover:bg-surface-overlay",
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleMentionSelect(candidate);
                      }}
                    >
                      <span className="truncate text-sm font-medium">
                        @{candidate.username}
                      </span>
                      {candidate.displayName && (
                        <span className="truncate text-xs text-text-muted">
                          {candidate.displayName}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSelect={(event) => {
              const caret = event.currentTarget.selectionStart ?? value.length;
              updateMentionState(value, caret);
            }}
            onBlur={() => {
              notifyBlur();
              clearMentionState();
            }}
            placeholder={t("chat:composer.placeholder")}
            disabled={disabled}
            rows={1}
            role="textbox"
            aria-multiline="true"
            aria-label={t("chat:composer.messageInput")}
            aria-expanded={showMentionPanel}
            aria-controls={showMentionPanel ? mentionListId : undefined}
            aria-activedescendant={
              showMentionPanel && mentionSuggestions.length > 0
                ? `${mentionListId}-option-${activeMentionIndex}`
                : undefined
            }
            className={clsx(
              "w-full min-h-11 resize-none rounded-2xl border border-border bg-surface px-4 py-2",
              "text-sm text-text-primary placeholder:text-text-muted",
              "transition-colors focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-focus/20",
              disabled && "cursor-not-allowed bg-surface-overlay opacity-70",
            )}
          />
        </div>

        <SendButton
          disabled={!canSend}
          isBusy={isUploading || isSending}
          onClick={() => {
            void handlePrimarySend();
          }}
          ariaLabel={sendButtonLabel}
          className="shrink-0"
        />
      </div>
    </div>
  );
};

export default MessageInput;
