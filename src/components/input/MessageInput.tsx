import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";

import { AttachmentTray } from "./AttachmentTray";
import { TipTapEditor, type TipTapEditorHandle } from "./TipTapEditor";
import { RichTextToolbar } from "./RichTextToolbar";
import { SendButton, type SendButtonState } from "./SendButton";
import { ShareContactModal } from "../modals/ShareContactModal";
import { ConversationLane } from "../layout/ConversationLane";
import {
  PollCreateDialog,
  type PollCreatePayload,
} from "../../features/chat/components/PollCreateDialog";
import { useAutoResizeTextarea, useTypingIndicator } from "../../hooks";
import { useSendMessage } from "../../features/chat/hooks/useSendMessage";
import type { AttachmentPickerMode } from "../../features/chat/hooks/useSendMessage";
import { logMessageDebug } from "../../utils/messageDebug";
import { toast } from "../ui";
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

import { ComposerStatusBanner } from "./MessageInput/ComposerStatusBanner";
import { ComposerReplyBanner } from "./MessageInput/ComposerReplyBanner";
import { ComposerEditBanner } from "./MessageInput/ComposerEditBanner";
import { ComposerMentionPanel } from "./MessageInput/ComposerMentionPanel";
import { ComposerLinkPreview } from "./MessageInput/ComposerLinkPreview";
import { ComposerActionBar } from "./MessageInput/ComposerActionBar";
import { ComposerLengthFooter } from "./MessageInput/ComposerLengthFooter";
import { COMPOSER_VISUAL_STATE_MAP } from "./MessageInput/constants";
import { buildMentionMatch, normalizeMentionCandidates } from "./MessageInput/utils";
import type {
  MentionCandidate,
  MessageInputHandle,
  MessageInputProps,
  MentionMatch,
  ComposerVisualState,
} from "./MessageInput/types";

export type { MentionCandidate, MessageInputHandle };

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
    conversationName,
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
  const [pendingLinkPreview, setPendingLinkPreview] = React.useState<import("../message/linkPreviewUtils").LinkPreviewMeta | null>(null);

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
    isSending,
    sendTextMessage,
    openFilePicker,
  } = useSendMessage({
    conversationId,
    disabled: submitDisabled,
    onSend,
  });

  // Expose imperative methods to parent components
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
        }
      },
      focus: () => {
        tipTapRef.current?.focus();
      },
    }),
    [onAddFiles],
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
        const fullName = candidate.fullName?.toLowerCase() || "";
        const employeeCode = candidate.employeeCode?.toLowerCase() || "";
        return (
          username.includes(query) ||
          displayName.includes(query) ||
          fullName.includes(query) ||
          employeeCode.includes(query)
        );
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
      }
      event.target.value = "";
      // Trả focus về editor: sau khi hộp thoại chọn file native đóng, focus
      // còn nằm trên nút đính kèm nên Enter sẽ mở lại picker thay vì gửi.
      tipTapRef.current?.focus();
    },
    [attachmentsDisabled, disabledReason, onAddFiles, t],
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
      linkPreview: pendingLinkPreview ?? undefined,
    });
    if (result === "failed") {
      setLiveRegionMessage(t("chat:composer.failedAnnouncement"));
      return;
    }

    setPendingLinkPreview(null);
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
    pendingLinkPreview,
    scheduleComposerResize,
    optimisticAnnouncement,
    sendTextMessage,
    stopTypingNow,
    t,
    messageValidation.canSendInlineMessage,
    messageValidation.hardLimit,
  ]);

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
      disabled,
      submitDisabled,
    });
    try {
      if (hasQueueDrafts) {
        // Capture TipTap content before clearing — preserves rich text formatting
        const html = tipTapRef.current?.getHTML() ?? "";
        const plainText = tipTapRef.current?.getText().trim() ?? draftValue.trim();
        const isEmpty = tipTapRef.current?.isEmpty() ?? !plainText;
        const hasFormatting = !isEmpty && hasRichFormatting(html);
        const content = isEmpty ? undefined : (hasFormatting ? html : plainText);
        // ChatWindow gathers ready attachment metadata; only clear once it
        // confirms the send was accepted into the optimistic/server flow.
        await Promise.resolve(onSend(content));
        tipTapRef.current?.clearContent();
        setDraftValue("");
        onChange("");
        scheduleComposerResize();
        clearMentionState();
        stopTypingNow();
        setLiveRegionMessage(optimisticAnnouncement);
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
    handleSendText,
    hasReadyDrafts,
    optimisticAnnouncement,
    onChange,
    onSend,
    releasePrimarySendLock,
    scheduleComposerResize,
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

  const handleFocusEditor = React.useCallback((e: React.MouseEvent) => {
    // Do not focus if the click was on an interactive element like a button or menu
    const target = e.target as HTMLElement;
    const isInteractive = !!target.closest("button, input, select, textarea, [role='button'], [role='menuitem'], .z-dropdown");
    const isInsideEditor = !!target.closest(".tiptap-composer");

    if (!isInteractive && !isInsideEditor && tipTapRef.current) {
      // Focus the editor (TipTapEditor exposes focus() which focuses at the end)
      tipTapRef.current.focus();
    }
  }, []);

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

      // Insert @fullName (display name) for better readability, NOT @username.
      // Backend resolves userId from the content via extractMentionUserIds on the server side.
      const resolvedName = candidate.resolvedName || candidate.displayName || candidate.username;
      const insertion = `@${resolvedName} `;
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
      // While an IME composition is active (e.g. typing Vietnamese with Unikey /
      // Windows VN keyboard), Arrow/Enter/Tab keys are used by the IME to pick
      // diacritic candidates. Never intercept them here or the user can't type
      // Vietnamese while the mention panel is open. keyCode 229 is the legacy
      // "composing" signal some IMEs send when event.isComposing isn't set.
      if (event.isComposing || event.keyCode === 229) {
        return false;
      }

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
        if (
          (event.key === "Enter" && !event.shiftKey && !event.isComposing) ||
          event.key === "Tab"
        ) {
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

  const hasText = draftValue.trim().length > 0;
  const hasQueueDrafts = (uploadDrafts?.length ?? 0) > 0;
  const isSubmitBusy = isSending || isPrimarySendLocked;
  const canSend =
    !submitDisabled &&
    !isSubmitBusy &&
    messageValidation.canSendInlineMessage &&
    !hasUploadingDrafts &&
    (hasQueueDrafts ? hasReadyDrafts || hasText : hasText);
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
      onClick={handleFocusEditor}
      className={clsx(
        "chat-composer-root border-t border-border/55 bg-[hsl(var(--chat-panel-bg))/0.96] pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur",
        "cursor-text",
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
          <ComposerStatusBanner
            disabledReason={disabledReason}
            disabledReasonTone={disabledReasonTone}
            composerMode={composerMode}
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
          <ComposerReplyBanner
            replyToMessage={replyToMessage}
            conversationId={conversationId}
            onCancelReply={onCancelReply}
          />
        )}

        {mode === "edit" && editingMessage && (
          <ComposerEditBanner
            editingMessage={editingMessage}
            onCancelEdit={onCancelEdit}
          />
        )}

        {mode !== "edit" && (
          <ComposerLinkPreview
            draftValue={draftValue}
            onMetaChange={setPendingLinkPreview}
          />
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

        <div className="flex items-end gap-2">
          <div
            data-composer-state={composerVisualState}
            className={clsx(
              "chat-composer-shell relative flex min-w-0 flex-1 flex-col rounded-xl border transition-micro cursor-text",
              composerVisualStyles.shell,
            )}
          >
            <div className="flex w-full items-end px-3 py-2">
              {showMentionPanel && (
                <ComposerMentionPanel
                  mentionListId={mentionListId}
                  activeMentionIndex={activeMentionIndex}
                  mentionSuggestions={mentionSuggestions}
                  onSelectMention={handleMentionSelect}
                />
              )}

              <TipTapEditor
                ref={tipTapRef}
                data-testid="chat-composer-input"
                placeholder={
                  conversationName
                    ? t("chat:composer.dynamicPlaceholder", {
                      name: conversationName,
                      defaultValue: `Nhập @, tin nhắn tới ${conversationName}`,
                    })
                    : t("chat:composer.placeholder", {
                      defaultValue: "Nhập @, tin nhắn tới...",
                    })
                }
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
                onPasteFiles={(files) => {
                  if (onAddFiles && !disabled && !attachmentsDisabled) {
                    const result = onAddFiles(files);
                    const errors = result?.errors;
                    if (Array.isArray(errors) && errors.length > 0) {
                      Array.from(new Set(errors))
                        .slice(0, 2)
                        .forEach((msg) => toast.error(msg));
                    }
                  }
                }}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => {
                  setIsComposerFocused(false);
                  notifyBlur();
                  clearMentionState();
                }}
                onEditorReady={setTipTapEditor}
              />

              <ComposerActionBar
                composerVisualStyles={composerVisualStyles}
                draftValue={draftValue}
                disabled={disabled}
                disableAttachmentActions={disableAttachmentActions}
                isFormatModeExpanded={isFormatModeExpanded}
                showAttachmentMenu={showAttachmentMenu}
                canShareContact={
                  Boolean(onShareContact) &&
                  Boolean(currentUserId) &&
                  Boolean(conversationId)
                }
                onEmojiChange={handleEmojiChange}
                onEmojiInsert={(emoji) => {
                  tipTapRef.current?.insertAtCursor(emoji);
                }}
                onOpenFilePicker={() =>
                  openFilePicker("mixed", fileInputRef.current)
                }
                onToggleFormatMode={() =>
                  setIsFormatModeExpanded((prev) => !prev)
                }
                onToggleAttachmentMenu={() =>
                  setShowAttachmentMenu((previous) => !previous)
                }
                onCloseAttachmentMenu={() => setShowAttachmentMenu(false)}
                onAttachmentSelect={handleAttachmentSelect}
              />
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
          {t("chat:composer.shortcutHint")}
        </p>

        <ComposerLengthFooter
          messageValidation={messageValidation}
          showLongPasteNotice={showLongPasteNotice}
          onSendAsTextFile={onAddFiles ? handleSendAsTextFile : undefined}
        />

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
