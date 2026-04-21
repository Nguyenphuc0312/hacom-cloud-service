import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AttachmentMenu } from "./AttachmentMenu";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentTray } from "./AttachmentTray";
import { SendButton, type SendButtonState } from "./SendButton";
import { ShareContactModal } from "../modals/ShareContactModal";
import { ConversationLane } from "../layout/ConversationLane";
import {
  useAutoResizeTextarea,
  useTypingIndicator,
} from "../../hooks";
import { useSendMessage } from "../../features/chat/hooks/useSendMessage";
import type { ComposerMode } from "../../hooks/useComposerAvailability";
import type { AttachmentPickerMode } from "../../features/chat/hooks/useSendMessage";
import type { InputMode, Message } from "../../types";
import type { AttachmentDraft } from "../../types/attachmentDraft";
import { UPLOAD_CONFIG } from "../../config";
import { logMessageDebug } from "../../utils/messageDebug";
import { InlineNotice, toast } from "../ui";

export interface MentionCandidate {
  id: string;
  username: string;
  displayName?: string;
}

/** Imperative handle for MessageInput — allows parent to programmatically add files */
export interface MessageInputHandle {
  addFile: (file: File) => void;
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => unknown | Promise<unknown>;
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
  submitDisabled?: boolean;
  attachmentsDisabled?: boolean;
  className?: string;
  onLayoutHeightChange?: (nextHeight: number) => void;
  disabledReason?: string;
  disabledReasonTone?: "info" | "warn" | "error";
  composerMode?: ComposerMode;
  currentUserId?: string;
  onShareContact?: (contactUserId: string) => Promise<void>;

  // ── Multi-file upload queue (from ChatWindow) ──
  uploadDrafts?: AttachmentDraft[];
  onAddFiles?: (files: File[]) => { errors?: string[] } | void;
  onRemoveDraft?: (localId: string) => void;
  onCancelUpload?: (localId: string) => void;
  onRetryUpload?: (localId: string) => void;
  onClearAllDrafts?: () => void;
  hasUploadingDrafts?: boolean;
  hasFailedDrafts?: boolean;
  hasReadyDrafts?: boolean;
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

type ComposerVisualState =
  | "idle"
  | "focus"
  | "ready-to-send"
  | "uploading"
  | "disabled"
  | "slow-mode"
  | "offline";

interface ComposerVisualStyles {
  shell: string;
  attachmentButton: string;
  attachmentDivider: string;
}

const COMPOSER_VISUAL_STATE_MAP: Record<
  ComposerVisualState,
  ComposerVisualStyles
> = {
  idle: {
    shell:
      "border-border/45 bg-[hsl(var(--chat-panel-bg))] shadow-none",
    attachmentButton:
      "text-text-muted hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-transparent",
  },
  focus: {
    shell:
      "border-primary/26 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/12",
    attachmentButton:
      "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-border/40",
  },
  "ready-to-send": {
    shell:
      "border-primary/22 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/10",
    attachmentButton:
      "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
    attachmentDivider: "border-border/35",
  },
  uploading: {
    shell:
      "border-primary/20 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-primary/10",
    attachmentButton:
      "text-primary hover:bg-primary/8 hover:text-primary-hover",
    attachmentDivider: "border-border/35",
  },
  disabled: {
    shell: "border-transparent bg-disabled-bg shadow-none",
    attachmentButton: "text-text-disabled",
    attachmentDivider: "border-transparent",
  },
  "slow-mode": {
    shell:
      "border-warning/35 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-warning/10",
    attachmentButton: "text-warning hover:bg-warning/10 hover:text-warning",
    attachmentDivider: "border-warning/18",
  },
  offline: {
    shell:
      "border-danger/28 bg-[hsl(var(--chat-panel-bg))] shadow-none ring-1 ring-danger/10",
    attachmentButton: "text-danger hover:bg-danger/10 hover:text-danger",
    attachmentDivider: "border-danger/18",
  },
};

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

export const MessageInput = React.forwardRef<
  MessageInputHandle,
  MessageInputProps
>(function MessageInput(
  {
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
    submitDisabled = false,
    attachmentsDisabled = false,
    className,
    onLayoutHeightChange,
    disabledReason,
    disabledReasonTone = "warn",
    composerMode = "online",
    currentUserId,
    onShareContact,
    // Multi-file upload queue
    uploadDrafts,
    onAddFiles,
    onRemoveDraft,
    onCancelUpload: onCancelQueueUpload,
    onRetryUpload: onRetryQueueUpload,
    onClearAllDrafts,
    hasUploadingDrafts = false,
    hasFailedDrafts = false,
    hasReadyDrafts = false,
  },
  ref,
) {
  const { t } = useTranslation();
  const optimisticAnnouncement = t("chat:composer.optimisticAnnouncement", {
    defaultValue: "Tin nhắn đang được gửi",
  });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [isDesktopLayout, setIsDesktopLayout] = React.useState(() =>
    isDesktopViewport(),
  );
  const { textareaRef } = useAutoResizeTextarea({
    value,
    minRows: 1,
    maxRows: isDesktopLayout ? 5 : 4,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [showAttachmentMenu, setShowAttachmentMenu] = React.useState(false);
  const [isShareContactOpen, setIsShareContactOpen] = React.useState(false);
  const [isComposerFocused, setIsComposerFocused] = React.useState(false);
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
    conversationId,
    disabled: submitDisabled,
    onSend,
  });

  // Expose selectFile to parent (e.g. for drag-and-drop)
  React.useImperativeHandle(
    ref,
    () => ({
      addFile: (file: File) => {
        if (onAddFiles) {
          const result = onAddFiles([file]);
          const validationErrors = result?.errors;
          if (Array.isArray(validationErrors) && validationErrors.length > 0) {
            Array.from(new Set(validationErrors))
              .slice(0, 2)
              .forEach((message) => toast.error(message));
          }
        } else {
          selectFile(file);
        }
      },
    }),
    [onAddFiles, selectFile],
  );

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
      if (attachmentsDisabled) {
        event.target.value = "";
        toast.warning(disabledReason || t("chat:composer.attachBlocked"));
        return;
      }

      const files = event.target.files;
      if (!files || files.length === 0) return;

      if (onAddFiles) {
        const result = onAddFiles(Array.from(files));
        const validationErrors = result?.errors;
        if (Array.isArray(validationErrors) && validationErrors.length > 0) {
          Array.from(new Set(validationErrors))
            .slice(0, 2)
            .forEach((message) => toast.error(message));
        }
      } else {
        const file = files[0];
        if (file) selectFile(file);
      }
      event.target.value = "";
    },
    [attachmentsDisabled, disabledReason, onAddFiles, selectFile, t],
  );

  const handleAttachmentSelect = React.useCallback(
    (type: string) => {
      if ((type === "photo" || type === "document") && attachmentsDisabled) {
        toast.warning(disabledReason || t("chat:composer.attachBlocked"));
        setShowAttachmentMenu(false);
        return;
      }

      if (type === "photo" || type === "document") {
        openFilePicker(type as AttachmentPickerMode, fileInputRef.current);
      } else if (type === "contact") {
        if (onShareContact && currentUserId && conversationId) {
          setIsShareContactOpen(true);
        } else {
          toast.info(t("common:toast.featureInDevelopment"));
        }
      } else {
        toast.info(t("common:toast.featureInDevelopment"));
      }
      setShowAttachmentMenu(false);
    },
    [
      attachmentsDisabled,
      conversationId,
      currentUserId,
      disabledReason,
      onShareContact,
      openFilePicker,
      t,
    ],
  );

  const handleSendText = React.useCallback(async () => {
    const result = await sendTextMessage(value);
    if (result === "failed") {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
      return;
    }

    onChange("");
    clearMentionState();
    stopTypingNow();
    setLiveRegionMessage(
      result === "queued"
        ? t("chat:composer.queuedAnnouncement")
        : result === "optimistic"
          ? optimisticAnnouncement
          : t("chat:composer.sentAnnouncement"),
    );
  }, [
    clearMentionState,
    onChange,
    optimisticAnnouncement,
    sendTextMessage,
    stopTypingNow,
    t,
    value,
  ]);

  const handleSendAttachment = React.useCallback(async () => {
    const result = await sendAttachmentMessage();
    setLiveRegionMessage(
      result === "failed"
        ? t("chat:composer.failedAnnouncement")
        : result === "queued"
          ? t("chat:composer.queuedAnnouncement")
          : result === "optimistic"
            ? optimisticAnnouncement
          : t("chat:composer.sentAnnouncement"),
    );
  }, [optimisticAnnouncement, sendAttachmentMessage, t]);

  const handlePrimarySend = React.useCallback(async () => {
    // Multi-file queue path: send text (attachments handled by ChatWindow)
    const hasQueueDrafts = (uploadDrafts?.length ?? 0) > 0;
    logMessageDebug("MessageInput", "submit_intent", {
      conversationId,
      hasQueueDrafts,
      hasReadyDrafts,
      hasText: value.trim().length > 0,
      contentPreview: value.trim().slice(0, 120),
      selectedFileName: selectedFile?.name,
      disabled,
      submitDisabled,
    });
    if (hasQueueDrafts && hasReadyDrafts) {
      const content = value.trim();
      // Call onSend — ChatWindow.handleSend gathers ready metas
      try {
        const sendPromise = Promise.resolve(onSend(content || undefined));
        onChange("");
        clearMentionState();
        stopTypingNow();
        setLiveRegionMessage(optimisticAnnouncement);

        void sendPromise.catch(() => {
          setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
        });
      } catch {
        setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
      }
      return;
    }

    // Legacy single-file path
    if (selectedFile) {
      await handleSendAttachment();
      return;
    }

    await handleSendText();
  }, [
    clearMentionState,
    conversationId,
    disabled,
    handleSendAttachment,
    handleSendText,
    hasReadyDrafts,
    optimisticAnnouncement,
    onChange,
    onSend,
    selectedFile,
    stopTypingNow,
    submitDisabled,
    t,
    uploadDrafts?.length,
    value,
  ]);

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

  const hasText = value.trim().length > 0;
  const hasQueueDrafts = (uploadDrafts?.length ?? 0) > 0;
  const isSubmitBusy = isUploading || isSending;
  const canSend = hasQueueDrafts
    ? !submitDisabled &&
      !isSubmitBusy &&
      !hasUploadingDrafts &&
      (hasReadyDrafts || hasText)
    : selectedFile
      ? !submitDisabled && !isSubmitBusy && composerMode === "online"
      : !submitDisabled && !isSubmitBusy && hasText;
  const disableAttachmentActions = attachmentsDisabled || isSubmitBusy;
  const sendButtonLabel = t("chat:composer.sendMessage");
  const composerVisualState: ComposerVisualState = disabled
    ? "disabled"
    : isSubmitBusy || hasUploadingDrafts
      ? "uploading"
      : composerMode === "offline"
        ? "offline"
        : composerMode === "slow_mode"
          ? "slow-mode"
          : canSend
            ? "ready-to-send"
            : isComposerFocused
              ? "focus"
              : "idle";
  const composerVisualStyles = COMPOSER_VISUAL_STATE_MAP[composerVisualState];
  const sendButtonState: SendButtonState = !canSend
    ? composerMode === "offline" && !disabled
      ? "offline"
      : composerMode === "slow_mode" && !disabled
        ? "slow-mode"
        : "disabled"
    : isSubmitBusy || hasUploadingDrafts
      ? "uploading"
      : composerMode === "offline"
        ? "offline"
        : composerMode === "slow_mode"
          ? "slow-mode"
          : "ready-to-send";

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
        canSend &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        logMessageDebug("MessageInput", "submit_triggered", {
          conversationId,
          trigger: "keyboard",
        });
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
      canSend,
      conversationId,
      sendOnEnter,
      showMentionPanel,
    ],
  );

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(
      "(min-width: 769px) and (pointer: fine)",
    );
    const handleChange = () => setIsDesktopLayout(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

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

  React.useLayoutEffect(() => {
    if (!onLayoutHeightChange) {
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    let frameId: number | null = null;
    let timeoutId: number | null = null;
    let previousHeight = 0;

    const flushHeightReport = () => {
      frameId = null;
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (Math.abs(nextHeight - previousHeight) <= 2) {
        return;
      }

      previousHeight = nextHeight;
      onLayoutHeightChange(nextHeight);
    };

    const scheduleHeightReport = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(flushHeightReport);
    };

    scheduleHeightReport();

    if (typeof ResizeObserver === "undefined") {
      timeoutId = window.setTimeout(flushHeightReport, 120);
      window.addEventListener("resize", scheduleHeightReport);

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        window.removeEventListener("resize", scheduleHeightReport);
        onLayoutHeightChange(0);
      };
    }

    const resizeObserver = new ResizeObserver(scheduleHeightReport);
    resizeObserver.observe(node);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      onLayoutHeightChange(0);
    };
  }, [onLayoutHeightChange]);

  return (
    <div
      ref={rootRef}
      className={clsx(
        "chat-composer-root bg-transparent pb-[max(env(safe-area-inset-bottom),10px)] pt-1",
        className,
      )}
    >
      <ConversationLane>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveRegionMessage}
        </p>

        {disabledReason && (
          <InlineNotice
            tone={
              disabledReasonTone === "error"
                ? "error"
                : disabledReasonTone === "info"
                  ? "info"
                  : "warning"
            }
            message={disabledReason}
            className="mb-2"
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
          aria-hidden="true"
          tabIndex={-1}
          {...(onAddFiles ? { multiple: true } : {})}
        />

        {mode === "reply" && replyToMessage && (
          <div className="mb-2 flex items-center justify-between rounded-[0.95rem] border border-border/70 bg-surface px-3 py-2 animate-slide-up-fade">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-7 w-1 rounded-full bg-primary" />
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
          <div className="mb-2 flex items-center justify-between rounded-[0.95rem] border border-warning/30 bg-warning/10 px-3 py-2 animate-slide-up-fade">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-7 w-1 rounded-full bg-warning" />
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

        {/* Multi-file upload tray */}
        {uploadDrafts &&
          uploadDrafts.length > 0 &&
          onRemoveDraft &&
          onCancelQueueUpload &&
          onRetryQueueUpload &&
          onClearAllDrafts && (
            <AttachmentTray
              drafts={uploadDrafts}
              onRemove={onRemoveDraft}
              onCancel={onCancelQueueUpload}
              onRetry={onRetryQueueUpload}
              onClearAll={onClearAllDrafts}
              hasUploadingDrafts={hasUploadingDrafts}
              hasFailedDrafts={hasFailedDrafts}
            />
          )}

        {/* Legacy single-file preview (hidden when queue is active) */}
        {!hasQueueDrafts && selectedFile && (
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

        <div className="flex items-end gap-2">
          <div
            data-composer-state={composerVisualState}
            className={clsx(
              "chat-composer-shell relative flex min-w-0 flex-1 items-end rounded-[1.1rem] border px-2.5 py-1.5 transition-micro",
              composerVisualStyles.shell,
            )}
          >
            {showMentionPanel && (
              <div
                id={mentionListId}
                role="listbox"
                aria-label={t("chat:composer.mentionList")}
                className={clsx(
                  "absolute bottom-full left-2 right-2 z-dropdown mb-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-elev2",
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
                    const mentionLabel =
                      candidate.displayName || candidate.username;
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
                            : "text-text-secondary hover:bg-surface-hover",
                        )}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleMentionSelect(candidate);
                        }}
                      >
                        <span className="truncate text-sm font-medium">
                          {mentionLabel}
                        </span>
                        <span className="truncate text-xs text-text-muted">
                          @{candidate.username}
                        </span>
                        {candidate.displayName &&
                          candidate.displayName !== candidate.username && (
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
              data-testid="chat-composer-input"
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onSelect={(event) => {
                const caret =
                  event.currentTarget.selectionStart ?? value.length;
                updateMentionState(value, caret);
              }}
              onBlur={() => {
                setIsComposerFocused(false);
                notifyBlur();
                clearMentionState();
              }}
              onFocus={() => setIsComposerFocused(true)}
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
                "chat-composer-textarea w-full min-h-[40px] flex-1 resize-none bg-transparent px-1 py-[9px]",
                "text-sm text-text-primary placeholder:text-text-muted",
                "transition-colors focus:outline-none",
                disabled && "cursor-not-allowed opacity-70",
              )}
            />

            <div
              className={clsx(
                "chat-composer-action-group ml-1 flex shrink-0 items-end gap-1 border-l pl-2",
                composerVisualStyles.attachmentDivider,
              )}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAttachmentMenu((previous) => !previous)}
                  className={clsx(
                    "chat-composer-attachment inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                    showAttachmentMenu
                      ? "bg-surface-active text-text-primary"
                      : composerVisualStyles.attachmentButton,
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                    disableAttachmentActions && "cursor-not-allowed opacity-50",
                  )}
                  aria-label={t("chat:composer.attachFile")}
                  aria-haspopup="menu"
                  aria-expanded={showAttachmentMenu}
                  disabled={disableAttachmentActions}
                >
                  <PaperClipIcon className="h-[18px] w-[18px]" />
                </button>

                {showAttachmentMenu && (
                  <AttachmentMenu
                    onSelect={handleAttachmentSelect}
                    onClose={() => setShowAttachmentMenu(false)}
                    canShareContact={
                      Boolean(onShareContact) &&
                      Boolean(currentUserId) &&
                      Boolean(conversationId)
                    }
                    className="absolute bottom-full right-0 z-dropdown mb-2"
                  />
                )}
              </div>
            </div>
          </div>

          <SendButton
            disabled={!canSend}
            state={sendButtonState}
            isBusy={isSubmitBusy}
            data-testid="chat-send-button"
            onClick={() => {
              logMessageDebug("MessageInput", "submit_triggered", {
                conversationId,
                trigger: "button",
              });
              void handlePrimarySend();
            }}
            ariaLabel={sendButtonLabel}
            className="mb-0.5 shrink-0"
          />
        </div>

        {onShareContact && currentUserId && (
          <ShareContactModal
            isOpen={isShareContactOpen}
            currentUserId={currentUserId}
            onClose={() => setIsShareContactOpen(false)}
            onShare={onShareContact}
          />
        )}
      </ConversationLane>
    </div>
  );
});

export default MessageInput;
