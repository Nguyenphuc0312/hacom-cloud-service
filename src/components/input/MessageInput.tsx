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
import { messageApi } from "../../services/api";
import {
  PollCreateDialog,
  type PollCreatePayload,
} from "../../features/chat/components/PollCreateDialog";
import {
  ReminderCreateDialog,
  type ReminderCreatePayload,
} from "../../features/chat/components/ReminderCreateDialog";
import { useAutoResizeTextarea, useTypingIndicator } from "../../hooks";
import { useSendMessage } from "../../features/chat/hooks/useSendMessage";
import type { AttachmentPickerMode } from "../../features/chat/hooks/useSendMessage";
import {
  chatApi,
  fetchConversationTail,
  useSendMessageMutation,
} from "../../features/api/chatApi";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { FileType, MessageType, type LocationMessagePayload } from "../../types";
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
import { MapPinIcon } from "@heroicons/react/24/outline";
import {
  formatLocationTime,
  getFriendlyAccuracyLabel,
  tryBuildGoogleMapsSearchUrl,
} from "../../utils/locationMessage";
import {
  AudioUploadError,
  RecordingBar,
  useAudioRecorder,
  useAudioUpload,
} from "../../features/audio";

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

type LocationFlowStatus =
  | "idle"
  | "requesting_permission"
  | "acquiring_location"
  | "confirming"
  | "sending"
  | "sent"
  | "permission_denied"
  | "permission_blocked"
  | "timeout"
  | "unavailable"
  | "error"
  | "send_failed"
  | "retrying";

type LocationFlowState = {
  status: LocationFlowStatus;
  location?: LocationMessagePayload;
  clientMessageId?: string;
  message?: string;
};

const getAudioSendErrorMessage = (
  error: unknown,
  t: ReturnType<typeof useTranslation>["t"],
): string => {
  if (error instanceof AudioUploadError) {
    switch (error.code) {
      case "AUTHENTICATION_REQUIRED":
        return t("chat:voice.authExpired", {
          defaultValue: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        });
      case "UPLOAD_URL_FAILURE":
        return t("chat:voice.uploadUrlError", {
          defaultValue: "Không thể chuẩn bị tải tin nhắn thoại lên. Vui lòng thử lại.",
        });
      case "STORAGE_UPLOAD_FAILURE":
      case "UPLOAD_NETWORK_FAILURE":
        return t("chat:voice.storageUploadError", {
          defaultValue: "Không thể tải tin nhắn thoại lên. Kiểm tra kết nối rồi thử lại.",
        });
      case "FINALIZE_FAILURE":
        return t("chat:voice.finalizeError", {
          defaultValue: "Tin nhắn thoại đã tải lên nhưng chưa thể hoàn tất. Vui lòng thử lại.",
        });
      default:
        return t("chat:voice.sendError", {
          defaultValue: "Không thể gửi tin nhắn thoại. Vui lòng thử lại.",
        });
    }
  }

  return t("chat:voice.sendError", {
    defaultValue: "Không thể gửi tin nhắn thoại. Vui lòng thử lại.",
  });
};

const createLocationClientMessageId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `location-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isLocalhost = (): boolean => {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
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
    onShareLocation,
    conversationName,
    conversationType,
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
  const [isReminderDialogOpen, setIsReminderDialogOpen] = React.useState(false);
  const [isComposerFocused, setIsComposerFocused] = React.useState(false);
  const [mentionMatch, setMentionMatch] = React.useState<MentionMatch | null>(
    null,
  );
  const [activeMentionIndex, setActiveMentionIndex] = React.useState(0);
  const [liveRegionMessage, setLiveRegionMessage] = React.useState("");
  const [isPrimarySendLocked, setIsPrimarySendLocked] = React.useState(false);
  const [showLongPasteNotice, setShowLongPasteNotice] = React.useState(false);
  const [locationFlow, setLocationFlow] = React.useState<LocationFlowState>({
    status: "idle",
  });
  const locationRequestSeqRef = React.useRef(0);
  const locationFlowState = locationFlow.status;
  const pendingLocation = locationFlow.location ?? null;
  const locationError = locationFlow.message ?? null;
  const setLocationFlowState = React.useCallback((status: LocationFlowStatus) => {
    setLocationFlow((current) => ({ ...current, status }));
  }, []);
  const setPendingLocation = React.useCallback((location: LocationMessagePayload | null) => {
    setLocationFlow((current) => ({
      ...current,
      location: location ?? undefined,
    }));
  }, []);
  const setLocationError = React.useCallback((message: string | null) => {
    setLocationFlow((current) => ({
      ...current,
      message: message ?? undefined,
    }));
  }, []);
  const primarySendLockedRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const [pendingLinkPreview, setPendingLinkPreview] = React.useState<import("../message/linkPreviewUtils").LinkPreviewMeta | null>(null);

  // ---- Audio recording flow ----
  const {
    state: audioState,
    error: audioError,
    elapsedMs: audioElapsedMs,
    amplitude: audioAmplitude,
    permissionState: audioPermissionState,
    requestPermission: audioRequestPermission,
    startRecording: audioStartRecording,
    stopRecording: audioStopRecording,
    cancelRecording: audioCancelRecording,
    reset: audioReset,
  } = useAudioRecorder();
  const audioUpload = useAudioUpload();
  const [sendVoiceMessage] = useSendMessageMutation();
  const audioFlowActive = audioState !== "IDLE" && audioState !== "CANCELLED" && audioState !== "SENT";

  const handleAudioCancel = React.useCallback(() => {
    audioCancelRecording();
    audioReset();
  }, [audioCancelRecording, audioReset]);

  const handleAudioSend = React.useCallback(async () => {
    if (!conversationId) return;
    try {
      const clip = await audioStopRecording();
      if (!clip || clip.blob.size === 0) {
        toast.warning(t("chat:audio.tooShort", { defaultValue: "Recording too short" }));
        audioReset();
        return;
      }
      const clientMessageId = (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`) || `voice-${Date.now()}`;
      const uploadResult = await audioUpload.uploadAudio({
        clip,
        conversationId,
        clientMessageId,
        durationMs: clip.durationMs,
      });
      const originalFileName = `voice-recording.${
        clip.mimeType.includes("webm")
          ? "webm"
          : clip.mimeType.includes("mp4")
            ? "m4a"
            : "ogg"
      }`;
      await sendVoiceMessage({
        conversationId,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        senderId: currentUserId ?? undefined,
        type: MessageType.VOICE,
        content: "",
        attachments: [
          {
            id: uploadResult.fileId,
            type: FileType.AUDIO,
            fileName: originalFileName,
            mimeType: clip.mimeType,
            fileSize: clip.sizeBytes,
            duration: Math.max(1, Math.round(clip.durationMs / 1000)),
          },
        ],
        audio: {
          fileId: uploadResult.fileId,
          mimeType: clip.mimeType,
          durationMs: clip.durationMs,
          sizeBytes: clip.sizeBytes,
          waveform: audioAmplitude,
          originalFileName,
        },
      }).unwrap();
      toast.success(t("chat:voice.sendRecording", { defaultValue: "Sent" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(getAudioSendErrorMessage(err, t));
      console.error("[AudioSend]", msg);
    } finally {
      audioReset();
    }
  }, [audioStopRecording, audioUpload, conversationId, audioReset, sendVoiceMessage, currentUserId, t]);

  const handleAudioStart = React.useCallback(async () => {
    const permissionReady = await audioRequestPermission();
    if (permissionReady) {
      audioStartRecording();
    }
  }, [audioRequestPermission, audioStartRecording]);

  const canStartAudio = !disabled && navigator?.mediaDevices?.getUserMedia != null;

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

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const {
    isSending,
    sendTextMessage,
    openFilePicker,
  } = useSendMessage({
    conversationId,
    disabled: submitDisabled,
    onSend,
  });

  // Poll create goes through the RTK mutation (not raw axios) so the new poll
  // gets an optimistic timeline row + ack-replace — appears instantly, no reload.
  const [sendPollMessage] = useSendMessageMutation();
  const dispatch = useAppDispatch();
  const newestLoadedSeq = useAppSelector((s) =>
    conversationId
      ? (chatApi.endpoints.getMessages.select({ conversationId })(s).data
          ?.newestLoadedSeq ?? null)
      : null,
  );

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
      focus: (options?: { scrollIntoView?: boolean }) => {
        tipTapRef.current?.focus(options);
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
      } else if (type === "location") {
        if (locationFlowState !== "idle") {
          setShowAttachmentMenu(false);
          return;
        }
        if (!onShareLocation) {
          toast.info(t("common:toast.featureInDevelopment"));
          setShowAttachmentMenu(false);
          return;
        }
        setLocationError(null);
        setPendingLocation(null);
        const requestSeq = locationRequestSeqRef.current + 1;
        locationRequestSeqRef.current = requestSeq;
        const clientMessageId = createLocationClientMessageId();
        setLocationFlow({ status: "requesting_permission", clientMessageId });
        if (typeof window !== "undefined" && !window.isSecureContext && !isLocalhost()) {
          setLocationFlowState("unavailable");
          setLocationError("Trình duyệt chỉ cho phép gửi vị trí trên HTTPS hoặc localhost.");
          setShowAttachmentMenu(false);
          return;
        }
        if (!("geolocation" in navigator)) {
          setLocationFlowState("error");
          setLocationError(
            t("chat:location.unavailable", {
              defaultValue: "Trình duyệt hiện không hỗ trợ lấy vị trí.",
            }),
          );
          setShowAttachmentMenu(false);
          return;
        }

        setLocationFlowState("acquiring_location");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!isMountedRef.current || locationRequestSeqRef.current !== requestSeq) return;
            setPendingLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              ...(typeof position.coords.accuracy === "number"
                ? { accuracyM: position.coords.accuracy }
                : {}),
              capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
            });
            setLocationFlowState("confirming");
          },
          (error) => {
            if (!isMountedRef.current || locationRequestSeqRef.current !== requestSeq) return;
            setLocationFlowState("error");
            if (error.code === error.PERMISSION_DENIED) {
              setLocationError(
                t("chat:location.permissionDenied", {
                  defaultValue:
                    "Bạn đã từ chối quyền vị trí. Hãy bật quyền vị trí cho trình duyệt rồi thử lại.",
                }),
              );
            } else if (error.code === error.TIMEOUT) {
              setLocationError(
                t("chat:location.timeout", {
                  defaultValue: "Không lấy được vị trí trong thời gian chờ. Bạn có thể thử lại.",
                }),
              );
            } else {
              setLocationError(
                t("chat:location.failed", {
                  defaultValue: "Không thể lấy vị trí hiện tại. Vui lòng thử lại.",
                }),
              );
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          },
        );
      } else if (type === "contact") {
        if (onShareContact && currentUserId && conversationId) {
          setIsShareContactOpen(true);
        } else {
          toast.info(t("common:toast.featureInDevelopment"));
        }
      } else if (type === "poll") {
        setIsPollDialogOpen(true);
      } else if (type === "reminder") {
        setIsReminderDialogOpen(true);
      } else if (type === "audio") {
        if (locationFlowState !== "idle") {
          setShowAttachmentMenu(false);
          return;
        }
        if (!canStartAudio) {
          toast.warning(t("chat:audio.unsupported", { defaultValue: "This browser does not support audio recording" }));
        } else {
          void handleAudioStart();
        }
      } else {
        toast.info(t("common:toast.featureInDevelopment"));
      }
      setShowAttachmentMenu(false);
    },
    [
      attachmentsDisabled,
      canStartAudio,
      conversationId,
      currentUserId,
      disabledReason,
      handleAudioStart,
      locationFlowState,
      onShareContact,
      onShareLocation,
      openFilePicker,
      setLocationError,
      setLocationFlowState,
      setPendingLocation,
      t,
    ],
  );

  const resetLocationFlow = React.useCallback(() => {
    locationRequestSeqRef.current += 1;
    setLocationFlow({ status: "idle" });
  }, []);

  const confirmLocationSend = React.useCallback(async () => {
    if (!pendingLocation || !onShareLocation) return;
    if (locationFlowState === "sending" || locationFlowState === "retrying") return;
    setLocationFlowState(locationFlowState === "send_failed" ? "retrying" : "sending");
    setLocationError(null);
    try {
      await Promise.resolve(onShareLocation(pendingLocation, locationFlow.clientMessageId));
      if (!isMountedRef.current) return;
      setLocationFlowState("sent");
      setPendingLocation(null);
      setLiveRegionMessage(optimisticAnnouncement);
      window.setTimeout(() => {
        if (isMountedRef.current) {
          setLocationFlowState("idle");
        }
      }, 300);
    } catch {
      if (!isMountedRef.current) return;
      setLocationFlowState("send_failed");
      setLocationError(
        t("chat:location.sendFailed", {
          defaultValue: "Gửi vị trí thất bại. Bạn có thể thử gửi lại.",
        }),
      );
    }
  }, [
    locationFlow.clientMessageId,
    locationFlowState,
    onShareLocation,
    optimisticAnnouncement,
    pendingLocation,
    setLocationError,
    setLocationFlowState,
    setPendingLocation,
    t,
  ]);

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
    (payload: PollCreatePayload, options: { pinToTop: boolean }) => {
      if (!conversationId) return;
      const clientMessageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `poll-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sendPollMessage({
        conversationId,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        content: payload.question,
        type: MessageType.POLL,
        poll: payload,
        senderId: currentUserId ?? undefined,
      })
        .unwrap()
        .then((created) => {
          // "Ghim lên đầu trò chuyện" toggle: the create DTO has no pin field, so
          // pin the real message once it's acked (same path as PollMessage's pin).
          if (options.pinToTop && created?.id) {
            messageApi
              .pinMessage(created.id)
              .then(() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("group:pin:updated", {
                      detail: { conversationId },
                    }),
                  );
                }
              })
              .catch(() =>
                toast.error(
                  t("common:toast.error", {
                    defaultValue: "Không thể ghim bình chọn",
                  }),
                ),
              );
          }
          // The "Bạn tạo cuộc bình chọn mới… Xem" system line is BE-generated and
          // only reaches us via a later message:new echo — pull the tail so it
          // shows now instead of waiting for a reload.
          dispatch(fetchConversationTail(conversationId, newestLoadedSeq));
        })
        .catch(() => {
          toast.error(t("common:toast.error", { defaultValue: "Không thể tạo bình chọn" }));
        });
    },
    [conversationId, sendPollMessage, currentUserId, t, dispatch, newestLoadedSeq],
  );

  const handleCreateReminder = React.useCallback(
    (payload: ReminderCreatePayload) => {
      if (!conversationId) return;
      const clientMessageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Same path as poll: route through the sendMessage mutation so the reminder
      // card renders optimistically and gets ack-replaced by the canonical
      // ReminderInfo (real id + full participant list) — no reload.
      sendPollMessage({
        conversationId,
        clientMessageId,
        localId: `temp-${clientMessageId}`,
        content: payload.content,
        type: MessageType.REMINDER,
        reminder: {
          content: payload.content,
          remindAt: payload.reminderDate.toISOString(),
          repeat: payload.repeatType,
        },
        senderId: currentUserId ?? undefined,
      })
        .unwrap()
        .then(() => {
          toast.success(t("chat:reminder.created", { defaultValue: "Đã tạo nhắc hẹn" }));
          // The "Bạn tạo nhắc hẹn mới… Xem" system line is BE-generated; pull the
          // tail so it appears immediately instead of waiting for a reload.
          dispatch(fetchConversationTail(conversationId, newestLoadedSeq));
        })
        .catch(() => {
          toast.error(t("common:toast.error", { defaultValue: "Không thể tạo nhắc hẹn" }));
        });
    },
    [conversationId, sendPollMessage, currentUserId, t, dispatch, newestLoadedSeq],
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
  const isLocationFlowBusy =
    locationFlowState !== "idle" && locationFlowState !== "sent";
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
        "chat-composer-root relative border-t border-border/55 bg-[hsl(var(--chat-panel-bg))/0.96] pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur",
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

        {/* Audio recording bar — replaces composer when recording is active */}
        {audioFlowActive && (
          <RecordingBar
            state={audioState}
            elapsedMs={audioElapsedMs}
            amplitude={audioAmplitude}
            error={audioError}
            permissionState={audioPermissionState}
            onCancel={handleAudioCancel}
            onSend={() => void handleAudioSend()}
            onRequestPermission={() => void audioRequestPermission()}
          />
        )}

        {!audioFlowActive && (
          <>
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

        {locationFlowState !== "idle" && (
          <div
            className="absolute bottom-full right-3 z-30 mb-2 w-[min(340px,calc(100vw-24px))] max-w-[440px] sm:w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-2xl shadow-black/25 ring-1 ring-black/5"
            role="dialog"
            aria-modal="false"
            aria-labelledby="composer-location-title"
            aria-describedby="composer-location-description"
          >
            {(locationFlowState === "requesting_permission" ||
              locationFlowState === "acquiring_location") && (
              <div className="flex items-center gap-3 px-3.5 py-3">
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[#1565C0] border-t-transparent animate-spin" />
                <div className="min-w-0 flex-1">
                  <p id="composer-location-title" className="text-sm font-semibold text-text-primary">
                    Đang xác định vị trí…
                  </p>
                  <p id="composer-location-description" className="text-xs text-text-muted">
                    Có thể mất vài giây
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-border px-2.5 py-1 text-sm font-medium text-text-secondary hover:bg-surface-overlay"
                  onClick={resetLocationFlow}
                >
                  Hủy
                </button>
              </div>
            )}

            {locationFlowState === "confirming" && pendingLocation && (
              <div>
                <div className="flex items-start gap-2.5 px-4 pb-3 pt-3.5">
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1565C0]/10 text-[#1565C0]"
                    aria-hidden="true"
                  >
                    <MapPinIcon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p id="composer-location-title" className="text-sm font-semibold text-text-primary">
                        Gửi vị trí hiện tại
                      </p>
                      {tryBuildGoogleMapsSearchUrl(pendingLocation) && (
                        <a
                          href={tryBuildGoogleMapsSearchUrl(pendingLocation) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs font-semibold text-[#1565C0] underline-offset-2 hover:underline"
                        >
                          Xem bản đồ
                        </a>
                      )}
                    </div>
                    <p id="composer-location-description" className="mt-0.5 truncate font-mono text-xs text-text-muted">
                      {pendingLocation.latitude.toFixed(5)}, {pendingLocation.longitude.toFixed(5)}
                    </p>
                    <p
                      className={clsx(
                        "mt-0.5 text-xs",
                        getFriendlyAccuracyLabel(pendingLocation.accuracyM).tone === "warning"
                          ? "text-warning"
                          : "text-text-muted",
                      )}
                    >
                      {[
                        getFriendlyAccuracyLabel(pendingLocation.accuracyM).label,
                        formatLocationTime(pendingLocation.capturedAt) &&
                          `lúc ${formatLocationTime(pendingLocation.capturedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-border/70 bg-surface-overlay/40 px-3 py-2.5">
                  <button
                    type="button"
                    className="h-9 flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
                    onClick={resetLocationFlow}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="h-9 min-w-[108px] flex-[1.4] whitespace-nowrap rounded-lg bg-[#1565C0] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void confirmLocationSend()}
                    aria-label="Gửi vị trí"
                  >
                    Gửi vị trí
                  </button>
                </div>
              </div>
            )}

            {(locationFlowState === "sending" || locationFlowState === "retrying") && (
              <div className="flex items-center gap-3 px-3.5 py-3">
                <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#1565C0] border-t-transparent animate-spin" />
                <div className="min-w-0 flex-1">
                  <p id="composer-location-title" className="text-sm font-semibold text-text-primary">
                    Đang gửi...
                  </p>
                  <p id="composer-location-description" className="text-xs text-text-muted">
                    Vui lòng đợi trong giây lát
                  </p>
                </div>
              </div>
            )}

            {["error", "permission_denied", "permission_blocked", "timeout", "unavailable", "send_failed"].includes(locationFlowState) && (
              <div>
                <p className="px-3.5 pb-2.5 pt-3 text-sm text-danger">
                  {locationError ?? "Không thể lấy vị trí hiện tại."}
                </p>
                <div className="flex items-center gap-2 border-t border-border/70 bg-surface-overlay/40 px-3 py-2.5">
                  <button
                    type="button"
                    className="h-9 flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
                    onClick={resetLocationFlow}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="h-9 flex-[1.4] rounded-lg bg-[#1565C0] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1976D2]"
                    onClick={() =>
                      pendingLocation
                        ? void confirmLocationSend()
                        : handleAttachmentSelect("location")
                    }
                  >
                    {pendingLocation ? "Thử lại" : "Lấy lại vị trí"}
                  </button>
                </div>
              </div>
            )}
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
                canPoll={
                  conversationType !== "direct" &&
                  conversationType !== "private"
                }
                disabledAttachmentItemIds={isLocationFlowBusy ? ["location"] : []}
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

        <ReminderCreateDialog
          isOpen={isReminderDialogOpen}
          onClose={() => setIsReminderDialogOpen(false)}
          onSubmit={handleCreateReminder}
        />
          </>
        )}
      </ConversationLane>
    </div>
  );
});

MessageInputComponent.displayName = "MessageInput";

export const MessageInput = React.memo(MessageInputComponent);
MessageInput.displayName = "MessageInput";

export default MessageInput;
