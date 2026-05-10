import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PaperClipIcon,
  XCircleIcon,
  XMarkIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";

import type { Editor } from "@tiptap/react";
import { AttachmentMenu } from "./AttachmentMenu";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentTray } from "./AttachmentTray";
import { TipTapEditor, type TipTapEditorHandle } from "./TipTapEditor";
import { RichTextToolbar } from "./RichTextToolbar";
import { EmojiButton } from "./EmojiButton";
import { SendButton, type SendButtonState } from "./SendButton";
import { ShareContactModal } from "../modals/ShareContactModal";
import { ConversationLane } from "../layout/ConversationLane";
import {
  PollCreateDialog,
  type PollCreatePayload,
} from "../../features/chat/components/PollCreateDialog";
import { useAutoResizeTextarea, useTypingIndicator } from "../../hooks";
import { useSendMessage } from "../../features/chat/hooks/useSendMessage";
import type { ComposerMode } from "../../hooks/useComposerAvailability";
import type { AttachmentPickerMode } from "../../features/chat/hooks/useSendMessage";
import type { InputMode, Message } from "../../types";
import type { AttachmentDraft } from "../../types/attachmentDraft";
import { UPLOAD_CONFIG } from "../../config";
import { logMessageDebug } from "../../utils/messageDebug";
import { getPreviewFromMessage } from "../../utils/messageContent.utils";
import { InlineNotice, toast } from "../ui";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import {
  isChatPerformanceEnabled,
  recordChatPerformanceMeasure,
} from "../../utils/chatPerformance";
import {
  createLongMessageTextFile,
  getInlineMessageValidationState,
  MESSAGE_SOFT_LIMIT,
} from "../../utils/messageLengthPolicy";
import { hasRichFormatting } from "../../utils/messageContent.utils";

export interface MentionCandidate {
  id: string;
  username: string;
  displayName?: string;
  fullName?: string | null;
  fullNameFromHR?: string | null;
  full_name_from_hr?: string | null;
}

/** Imperative handle for MessageInput — allows parent to programmatically add files */
export interface MessageInputHandle {
  addFile: (file: File) => void;
}

const compactStatusToneClasses = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

const compactStatusToneIcons = {
  info: InformationCircleIcon,
  warn: ExclamationTriangleIcon,
  error: XCircleIcon,
} as const;

const shouldRenderCompactStatusBar = (composerMode: ComposerMode): boolean =>
  composerMode === "reconnecting" ||
  composerMode === "offline" ||
  composerMode === "unauthenticated";

interface MessageInputProps {
  value: string;
  valueResetKey?: number;
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
    shell: "border-border/45 bg-[hsl(var(--chat-panel-bg))] shadow-none",
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

const MessageInputComponent = React.forwardRef(function MessageInput(
  props: MessageInputProps,
  ref: React.ForwardedRef<MessageInputHandle>,
) {
  const {
    value: externalValue,
    valueResetKey = 0,
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
  } = props;
  const { t } = useTranslation();
  const optimisticAnnouncement = t("chat:composer.optimisticAnnouncement", {
    defaultValue: "Tin nhắn đang được gửi",
  });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [draftValue, setDraftValue] = React.useState(externalValue);
  const [isFormatModeExpanded, setIsFormatModeExpanded] = React.useState(false);
  const tipTapRef = React.useRef<TipTapEditorHandle>(null);
  const [tipTapEditor, setTipTapEditor] = React.useState<Editor | null>(null);

  const { textareaRef, recomputeHeight } = useAutoResizeTextarea({
    value: draftValue,
    minRows: 1,
    maxRows: isFormatModeExpanded ? 15 : 5,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const renderCountRef = React.useRef(0);
  const inputSequenceRef = React.useRef(0);

  const [showAttachmentMenu, setShowAttachmentMenu] = React.useState(false);
  const [isShareContactOpen, setIsShareContactOpen] = React.useState(false);
  const [isPollDialogOpen, setIsPollDialogOpen] = React.useState(false);
  const [isComposerFocused, setIsComposerFocused] = React.useState(false);
  const [mentionMatch, setMentionMatch] = React.useState<MentionMatch | null>(
    null,
  );
  const [activeMentionIndex, setActiveMentionIndex] = React.useState(0);
  const [liveRegionMessage, setLiveRegionMessage] = React.useState("");
  const [isPrimarySendLocked, setIsPrimarySendLocked] = React.useState(false);
  const [showLongPasteNotice, setShowLongPasteNotice] = React.useState(false);
  const primarySendLockedRef = React.useRef(false);

  const mentionListId = React.useId();

  const scheduleComposerResize = React.useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      recomputeHeight();
      return;
    }

    window.requestAnimationFrame(recomputeHeight);
  }, [recomputeHeight]);

  React.useLayoutEffect(() => {
    if (import.meta.env.DEV) {
      renderCountRef.current += 1;
    }
  });

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

  React.useEffect(() => {
    setDraftValue(externalValue);
    clearMentionState();
    setShowLongPasteNotice(false);
    if (!externalValue) {
      tipTapRef.current?.clearContent();
    }
  }, [clearMentionState, externalValue, valueResetKey]);

  const messageValidation = React.useMemo(
    () => getInlineMessageValidationState(draftValue),
    [draftValue],
  );

  const recordInputLatency = React.useCallback(
    (nextValue: string) => {
      if (
        !isChatPerformanceEnabled() ||
        typeof window === "undefined" ||
        typeof window.requestAnimationFrame !== "function"
      ) {
        return;
      }

      const startedAt = performance.now();
      const sequence = inputSequenceRef.current + 1;
      inputSequenceRef.current = sequence;

      window.requestAnimationFrame(() => {
        recordChatPerformanceMeasure(
          "composer_keypress_latency",
          performance.now() - startedAt,
          {
            conversationId: conversationId ?? null,
            inputSequence: sequence,
            textLength: nextValue.length,
            renderCount: renderCountRef.current,
          },
        );
      });
    },
    [conversationId],
  );

  const releasePrimarySendLock = React.useCallback(() => {
    const release = () => {
      primarySendLockedRef.current = false;
      setIsPrimarySendLocked(false);
    };

    if (typeof window === "undefined") {
      release();
      return;
    }

    window.requestAnimationFrame(release);
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
      } else if (type === "poll") {
        setIsPollDialogOpen(true);
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
    if (!messageValidation.canSendInlineMessage) {
      setLiveRegionMessage(
        t("chat:composer.hardLimitError", {
          max: messageValidation.hardLimit.toLocaleString("vi-VN"),
          defaultValue: "Tin nhắn vượt giới hạn 20.000 ký tự.",
        }),
      );
      return;
    }

    const html = tipTapRef.current?.getHTML() ?? "";
    const plainText = tipTapRef.current?.getText().trim() ?? draftValue.trim();
    const contentJson = tipTapRef.current?.getJSON() as
      | Record<string, unknown>
      | undefined;
    const isEmpty = tipTapRef.current?.isEmpty() ?? !plainText;

    if (isEmpty || !plainText) return;

    const hasFormatting = hasRichFormatting(html);
    const contentFormat = hasFormatting
      ? ("rich_text" as const)
      : ("plain_text" as const);
    const content = hasFormatting ? html : plainText;

    const result = await sendTextMessage(content, {
      contentFormat,
      contentJson,
      plainText,
    });
    if (result === "failed") {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
      return;
    }

    tipTapRef.current?.clearContent();
    setDraftValue("");
    onChange("");
    scheduleComposerResize();
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
    draftValue,
    onChange,
    scheduleComposerResize,
    optimisticAnnouncement,
    sendTextMessage,
    stopTypingNow,
    t,
    messageValidation.canSendInlineMessage,
    messageValidation.hardLimit,
  ]);

  const handleSendAttachment = React.useCallback(async () => {
    const result = await sendAttachmentMessage();
    stopTypingNow();
    setLiveRegionMessage(
      result === "failed"
        ? t("chat:composer.failedAnnouncement")
        : result === "queued"
          ? t("chat:composer.queuedAnnouncement")
          : result === "optimistic"
            ? optimisticAnnouncement
            : t("chat:composer.sentAnnouncement"),
    );
  }, [optimisticAnnouncement, sendAttachmentMessage, stopTypingNow, t]);

  const handlePrimarySend = React.useCallback(async () => {
    if (primarySendLockedRef.current) {
      return;
    }

    if (!messageValidation.canSendInlineMessage) {
      setLiveRegionMessage(
        t("chat:composer.hardLimitError", {
          max: messageValidation.hardLimit.toLocaleString("vi-VN"),
          defaultValue: "Tin nhắn vượt giới hạn 20.000 ký tự.",
        }),
      );
      return;
    }

    primarySendLockedRef.current = true;
    setIsPrimarySendLocked(true);

    // Multi-file queue path: send text (attachments handled by ChatWindow)
    const hasQueueDrafts = (uploadDrafts?.length ?? 0) > 0;
    logMessageDebug("MessageInput", "submit_intent", {
      conversationId,
      hasQueueDrafts,
      hasReadyDrafts,
      hasText: draftValue.trim().length > 0,
      contentPreview: draftValue.trim().slice(0, 120),
      selectedFileName: selectedFile?.name,
      disabled,
      submitDisabled,
    });
    try {
      if (hasQueueDrafts && hasReadyDrafts) {
        const content = draftValue.trim();
        // ChatWindow gathers ready attachment metadata; only clear once it
        // confirms the send was accepted into the optimistic/server flow.
        await Promise.resolve(onSend(content || undefined));
        setDraftValue("");
        onChange("");
        scheduleComposerResize();
        clearMentionState();
        stopTypingNow();
        setLiveRegionMessage(optimisticAnnouncement);
        return;
      }

      // Legacy single-file path
      if (selectedFile) {
        await handleSendAttachment();
        return;
      }

      await handleSendText();
    } catch {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
    } finally {
      releasePrimarySendLock();
    }
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
    releasePrimarySendLock,
    scheduleComposerResize,
    selectedFile,
    stopTypingNow,
    submitDisabled,
    t,
    uploadDrafts?.length,
    draftValue,
    messageValidation.canSendInlineMessage,
    messageValidation.hardLimit,
  ]);

  const handleEmojiChange = React.useCallback(
    (nextValue: string) => {
      setDraftValue(nextValue);
      onChange(nextValue);
      scheduleComposerResize();
      updateMentionState(nextValue, nextValue.length);
      recordInputLatency(nextValue);

      notifyInput({
        hasText: nextValue.trim().length > 0,
        isFocused: true,
      });
    },
    [
      notifyInput,
      onChange,
      recordInputLatency,
      scheduleComposerResize,
      updateMentionState,
    ],
  );

  const handleSendAsTextFile = React.useCallback(() => {
    if (!onAddFiles || draftValue.length === 0) {
      return;
    }

    const result = onAddFiles([createLongMessageTextFile(draftValue)]);
    const validationErrors = result?.errors;
    if (Array.isArray(validationErrors) && validationErrors.length > 0) {
      Array.from(new Set(validationErrors))
        .slice(0, 2)
        .forEach((message) => toast.error(message));
      return;
    }

    setDraftValue("");
    onChange("");
    scheduleComposerResize();
    clearMentionState();
    stopTypingNow();
    setShowLongPasteNotice(false);
    setLiveRegionMessage(
      t("chat:composer.sendAsFileReady", {
        defaultValue: "Đã chuyển nội dung thành tệp văn bản để gửi",
      }),
    );
  }, [
    clearMentionState,
    draftValue,
    onAddFiles,
    onChange,
    scheduleComposerResize,
    stopTypingNow,
    t,
  ]);

  const handleCreatePoll = React.useCallback(
    (payload: PollCreatePayload) => {
      toast.info(
        t("common:toast.featureInDevelopment", {
          defaultValue: "Tính năng đang được phát triển",
        }),
      );
      logMessageDebug("MessageInput", "poll_create_demo_submitted", {
        conversationId,
        optionCount: payload.options.length,
        allowMultiple: payload.allowMultiple,
        anonymous: payload.anonymous,
      });
    },
    [conversationId, t],
  );

  const handleMentionSelect = React.useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionMatch) return;

      const insertion = `@${candidate.username} `;
      const nextValue = `${draftValue.slice(0, mentionMatch.start)}${insertion}${draftValue.slice(mentionMatch.end)}`;

      const editor = tipTapRef.current?.getEditor();
      if (editor) {
        const matchLength = mentionMatch.end - mentionMatch.start;
        const to = editor.state.selection.anchor;
        const from = to - matchLength;
        editor
          .chain()
          .focus()
          .deleteRange({ from, to })
          .insertContent(insertion)
          .run();
      }

      setDraftValue(nextValue);
      onChange(nextValue);
      scheduleComposerResize();
      clearMentionState();
      recordInputLatency(nextValue);
    },
    [
      clearMentionState,
      draftValue,
      mentionMatch,
      onChange,
      recordInputLatency,
      scheduleComposerResize,
    ],
  );

  // Stable refs so TipTap's handleKeyDown closure doesn't go stale.
  const showMentionPanelRef = React.useRef(false);
  const mentionSuggestionsRef = React.useRef<typeof mentionSuggestions>([]);
  const activeMentionIndexRef = React.useRef(0);

  const handleMentionSelectRef = React.useRef(handleMentionSelect);
  handleMentionSelectRef.current = handleMentionSelect;
  const clearMentionStateRef = React.useRef(clearMentionState);
  clearMentionStateRef.current = clearMentionState;
  const onCancelReplyRef = React.useRef(onCancelReply);
  onCancelReplyRef.current = onCancelReply;
  const onCancelEditRef = React.useRef(onCancelEdit);
  onCancelEditRef.current = onCancelEdit;

  const handleTipTapInterceptKeydown = React.useCallback(
    (event: KeyboardEvent): boolean => {
      if (showMentionPanelRef.current) {
        if (event.key === "ArrowDown") {
          setActiveMentionIndex((current) =>
            mentionSuggestionsRef.current.length === 0
              ? 0
              : (current + 1) % mentionSuggestionsRef.current.length,
          );
          return true;
        }
        if (event.key === "ArrowUp") {
          setActiveMentionIndex((current) =>
            mentionSuggestionsRef.current.length === 0
              ? 0
              : (current - 1 + mentionSuggestionsRef.current.length) %
                mentionSuggestionsRef.current.length,
          );
          return true;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          const candidate =
            mentionSuggestionsRef.current[activeMentionIndexRef.current];
          if (candidate) {
            handleMentionSelectRef.current(candidate);
          }
          return true;
        }
        if (event.key === "Escape") {
          clearMentionStateRef.current();
          return true;
        }
      }

      if (event.key === "Escape") {
        if (mode === "reply") onCancelReplyRef.current?.();
        if (mode === "edit") onCancelEditRef.current?.();
        return true;
      }

      if (
        event.key.toLowerCase() === "x" &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        setIsFormatModeExpanded((prev) => !prev);
        return true;
      }

      return false;
    },
    [mode],
  );

  // Keep stable refs in sync with render-time values.
  React.useLayoutEffect(() => {
    showMentionPanelRef.current = showMentionPanel;
    mentionSuggestionsRef.current = mentionSuggestions;
    activeMentionIndexRef.current = activeMentionIndex;
  });

  const handleRemoveSelectedFile = React.useCallback(() => {
    if (isUploading) {
      cancelUpload();
    }
    clearSelectedFile();
  }, [cancelUpload, clearSelectedFile, isUploading]);

  const handleRetryUpload = React.useCallback(() => {
    void handleSendAttachment();
  }, [handleSendAttachment]);

  const hasText = draftValue.trim().length > 0;
  const hasQueueDrafts = (uploadDrafts?.length ?? 0) > 0;
  const isSubmitBusy = isUploading || isSending || isPrimarySendLocked;
  const canSend = hasQueueDrafts
    ? !submitDisabled &&
      !isSubmitBusy &&
      messageValidation.canSendInlineMessage &&
      !hasUploadingDrafts &&
      (hasReadyDrafts || hasText)
    : selectedFile
      ? !submitDisabled && !isSubmitBusy && composerMode === "online"
      : !submitDisabled &&
        !isSubmitBusy &&
        hasText &&
        messageValidation.canSendInlineMessage;
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
  const resolvedCompactStatusTone =
    disabledReasonTone === "error"
      ? "error"
      : disabledReasonTone === "info"
        ? "info"
        : "warn";
  const showCompactStatusBar =
    Boolean(disabledReason) && shouldRenderCompactStatusBar(composerMode);
  const CompactStatusIcon = compactStatusToneIcons[resolvedCompactStatusTone];

  React.useEffect(() => {
    if (mode === "reply" || mode === "edit") {
      tipTapRef.current?.focus();
    }
  }, [mode]);

  React.useEffect(() => {
    if (!conversationId || !textareaRef.current) return;

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
        "chat-composer-root border-t border-border/55 bg-[hsl(var(--chat-panel-bg))/0.96] pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur",
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

        {disabledReason &&
          (showCompactStatusBar ? (
            <div className="mb-2 flex items-start">
              <div
                className={clsx(
                  "inline-flex max-w-full items-start gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm",
                  compactStatusToneClasses[resolvedCompactStatusTone],
                )}
                role="status"
                aria-live="polite"
              >
                <CompactStatusIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 leading-5">{disabledReason}</span>
              </div>
            </div>
          ) : (
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
          ))}

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
                  {getPreviewFromMessage({
                    contentFormat: replyToMessage.contentFormat,
                    plainText: replyToMessage.plainText,
                    content: replyToMessage.content,
                  })}
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
              "chat-composer-shell relative flex min-w-0 flex-1 flex-col rounded-xl border transition-micro",
              composerVisualStyles.shell,
            )}
          >
            <div className="flex w-full items-end px-3 py-2">
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
                        resolveUserDisplayName(candidate, {
                          allowLegacyFallback: true,
                        }) || candidate.username;
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
                            candidate.displayName !== mentionLabel && (
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

              <TipTapEditor
                ref={tipTapRef}
                data-testid="chat-composer-input"
                placeholder={t("chat:composer.placeholder")}
                disabled={disabled}
                onContentChange={(plainText) => {
                  setDraftValue(plainText);
                  onChange(plainText);
                  scheduleComposerResize();
                  if (plainText.length <= MESSAGE_SOFT_LIMIT) {
                    setShowLongPasteNotice(false);
                  }
                  recordInputLatency(plainText);
                  notifyInput({
                    hasText: plainText.trim().length > 0,
                    isFocused: true,
                  });
                }}
                onSelectionChange={(text, caretOffset) => {
                  updateMentionState(text, caretOffset);
                }}
                onEnterPress={() => {
                  if (sendOnEnter && canSend) {
                    logMessageDebug("MessageInput", "submit_triggered", {
                      conversationId,
                      trigger: "keyboard",
                    });
                    void handlePrimarySend();
                  }
                }}
                onInterceptKeydown={handleTipTapInterceptKeydown}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => {
                  setIsComposerFocused(false);
                  notifyBlur();
                  clearMentionState();
                }}
                onEditorReady={setTipTapEditor}
              />

              <div
                className={clsx(
                  "chat-composer-action-group ml-1 flex shrink-0 items-end gap-1 border-l pl-2",
                  composerVisualStyles.attachmentDivider,
                )}
              >
                <EmojiButton
                  value={draftValue}
                  onChange={handleEmojiChange}
                  onEmojiSelect={(emoji) => {
                    tipTapRef.current?.insertAtCursor(emoji);
                  }}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => openFilePicker("mixed", fileInputRef.current)}
                  className={clsx(
                    "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
                    composerVisualStyles.attachmentButton,
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                    disableAttachmentActions && "cursor-not-allowed opacity-50",
                  )}
                  aria-label={t("chat:composer.attachFile")}
                  disabled={disableAttachmentActions}
                >
                  <PaperClipIcon className="h-[18px] w-[18px]" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsFormatModeExpanded((prev) => !prev)}
                  className={clsx(
                    "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
                    isFormatModeExpanded
                      ? "bg-surface-active text-text-primary"
                      : composerVisualStyles.attachmentButton,
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                  aria-label="Định dạng tin nhắn"
                  title="Định dạng tin nhắn (Cmd+Shift+X)"
                  disabled={disabled}
                >
                  <div
                    className={clsx(
                      "relative flex items-center justify-center",
                      "h-[18px] w-[18px]",
                    )}
                  >
                    <span className="font-bold text-sm tracking-tighter">
                      A
                    </span>
                    <PencilIcon
                      className="absolute bottom-[2px] -right-[4px] h-[10px] w-[10px]"
                      strokeWidth={2.5}
                    />
                  </div>
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setShowAttachmentMenu((previous) => !previous)
                    }
                    className={clsx(
                      "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
                      showAttachmentMenu
                        ? "bg-surface-active text-text-primary"
                        : composerVisualStyles.attachmentButton,
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                      disableAttachmentActions &&
                        "cursor-not-allowed opacity-50",
                    )}
                    aria-label={t("chat:header.moreActions", {
                      defaultValue: "Thêm hành động",
                    })}
                    aria-haspopup="menu"
                    aria-expanded={showAttachmentMenu}
                    disabled={disableAttachmentActions}
                  >
                    <EllipsisHorizontalIcon className="h-[20px] w-[20px]" />
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

            {isFormatModeExpanded && (
              <div className="px-3 pb-2 pt-0">
                <RichTextToolbar
                  editor={tipTapEditor}
                  onToggleExpand={() => setIsFormatModeExpanded(false)}
                  disabled={disabled}
                />
              </div>
            )}
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
            className="shrink-0"
          />
        </div>

        <p className="mt-1 px-1 text-[11px] leading-4 text-text-muted">
          Nhấn Enter để gửi, Shift + Enter để xuống dòng
        </p>

        {(messageValidation.showCounter ||
          messageValidation.isOverSoftLimit ||
          messageValidation.isOverHardLimit) && (
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {messageValidation.isOverHardLimit ? (
                <InlineNotice
                  tone="error"
                  className="mb-0"
                  message={t("chat:composer.hardLimitError", {
                    max: messageValidation.hardLimit.toLocaleString("vi-VN"),
                    defaultValue: "Tin nhắn vượt giới hạn 20.000 ký tự.",
                  })}
                  action={
                    onAddFiles ? (
                      <button
                        type="button"
                        onClick={handleSendAsTextFile}
                        className="text-xs font-semibold underline-offset-2 hover:underline"
                      >
                        {t("chat:composer.sendAsTextFile", {
                          defaultValue: "Gửi dưới dạng tệp .txt",
                        })}
                      </button>
                    ) : undefined
                  }
                />
              ) : messageValidation.isOverSoftLimit || showLongPasteNotice ? (
                <InlineNotice
                  tone="warning"
                  className="mb-0"
                  message={
                    showLongPasteNotice
                      ? t("chat:composer.longPasteNotice", {
                          defaultValue:
                            "Nội dung quá dài. Bạn có thể gửi dưới dạng tệp văn bản.",
                        })
                      : t("chat:composer.softLimitWarning", {
                          defaultValue:
                            "Tin nhắn khá dài. Hãy cân nhắc gửi dưới dạng tệp nếu là log hoặc tài liệu.",
                        })
                  }
                  action={
                    onAddFiles ? (
                      <button
                        type="button"
                        onClick={handleSendAsTextFile}
                        className="text-xs font-semibold underline-offset-2 hover:underline"
                      >
                        {t("chat:composer.sendAsTextFile", {
                          defaultValue: "Gửi dưới dạng tệp .txt",
                        })}
                      </button>
                    ) : undefined
                  }
                />
              ) : null}
            </div>

            {messageValidation.showCounter && (
              <p
                className={clsx(
                  "shrink-0 text-[11px] font-medium",
                  messageValidation.isOverHardLimit
                    ? "text-danger"
                    : messageValidation.isOverSoftLimit
                      ? "text-warning"
                      : "text-text-muted",
                )}
              >
                {messageValidation.charCount.toLocaleString("vi-VN")}/
                {messageValidation.hardLimit.toLocaleString("vi-VN")}
              </p>
            )}
          </div>
        )}

        {onShareContact && currentUserId && (
          <ShareContactModal
            isOpen={isShareContactOpen}
            currentUserId={currentUserId}
            onClose={() => setIsShareContactOpen(false)}
            onShare={onShareContact}
          />
        )}

        <PollCreateDialog
          isOpen={isPollDialogOpen}
          onClose={() => setIsPollDialogOpen(false)}
          onSubmit={handleCreatePoll}
        />
      </ConversationLane>
    </div>
  );
});

MessageInputComponent.displayName = "MessageInput";

export const MessageInput = React.memo(MessageInputComponent);
MessageInput.displayName = "MessageInput";

export default MessageInput;
