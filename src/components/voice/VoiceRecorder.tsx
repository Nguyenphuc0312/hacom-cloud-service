/**
 * @fileoverview VoiceRecorder - UI component for voice recording.
 * Provides recording controls, timer, and preview before sending.
 */

import React, { useCallback, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  MicrophoneIcon,
  StopIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { formatDuration } from "../../utils/formatTime";

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number, mimeType: string) => void;
  onCancel?: () => void;
  maxDurationMs?: number;
  className?: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSend,
  onCancel,
  maxDurationMs = 5 * 60 * 1000,
  className,
}) => {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioPreviewRef = React.useRef<HTMLAudioElement | null>(null);
  const recordedBlobRef = React.useRef<Blob | null>(null);
  const recordedMimeTypeRef = React.useRef<string>("");

  const handleRecordingComplete = useCallback((result: { blob: Blob; duration: number; mimeType: string }) => {
    recordedBlobRef.current = result.blob;
    recordedMimeTypeRef.current = result.mimeType;
  }, []);

  const {
    state,
    duration,
    permissionStatus,
    startRecording,
    stopRecording,
    cancelRecording,
    pauseRecording,
    resumeRecording,
    getRecordingBlob,
    reset,
  } = useVoiceRecorder({
    maxDuration: maxDurationMs,
    onRecordingComplete: handleRecordingComplete,
  });

  const formattedDuration = useMemo(() => formatDuration(duration / 1000), [duration]);
  const maxDurationFormatted = useMemo(() => formatDuration(maxDurationMs / 1000), [maxDurationMs]);

  const progressPercent = useMemo(() => {
    return Math.min((duration / maxDurationMs) * 100, 100);
  }, [duration, maxDurationMs]);

  const handleSend = useCallback(() => {
    const result = getRecordingBlob();
    if (result) {
      onSend(result.blob, result.duration, result.mimeType);
      reset();
    }
  }, [getRecordingBlob, onSend, reset]);

  const handleCancel = useCallback(() => {
    cancelRecording();
    onCancel?.();
  }, [cancelRecording, onCancel]);

  const handlePlayPreview = useCallback(() => {
    if (!audioPreviewRef.current) return;

    if (isPlaying) {
      audioPreviewRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Set up audio preview when entering preview state
  React.useEffect(() => {
    if (state === "preview" && audioPreviewRef.current) {
      const result = getRecordingBlob();
      if (result) {
        const url = URL.createObjectURL(result.blob);
        audioPreviewRef.current.src = url;
        audioPreviewRef.current.onended = () => setIsPlaying(false);
      }
    }
  }, [state, getRecordingBlob]);

  // Idle state - show record button
  if (state === "idle" || state === "requesting_permission") {
    return (
      <div className={clsx("flex items-center gap-3", className)}>
        <button
          type="button"
          onClick={() => void startRecording()}
          disabled={state === "requesting_permission"}
          className={clsx(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            "bg-primary text-text-inverse",
            "hover:bg-primary-hover",
            "disabled:opacity-50",
            state === "requesting_permission" && "animate-pulse",
          )}
          aria-label={t("chat:voice.startRecording")}
        >
          <MicrophoneIcon className="h-5 w-5" />
        </button>
        <div className="text-sm text-text-muted">
          {t("chat:voice.holdToRecord", { defaultValue: "Giữ để ghi âm" })}
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className={clsx("flex items-center gap-3", className)}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <XMarkIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-danger">
            {permissionStatus === "denied"
              ? t("chat:voice.permissionDenied", { defaultValue: "Quyền truy cập microphone bị từ chối" })
              : t("chat:voice.recordingError", { defaultValue: "Không thể ghi âm. Vui lòng thử lại." })}
          </p>
          {permissionStatus !== "denied" && (
            <p className="text-xs text-text-muted">
              {t("chat:voice.tryAgain", { defaultValue: "Bấm để thử lại" })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-full",
            "bg-surface text-text-secondary hover:bg-surface-hover",
          )}
          aria-label={t("chat:common.retry")}
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Preview state - show send/cancel buttons
  if (state === "preview") {
    return (
      <div className={clsx("flex items-center gap-3", className)}>
        <audio ref={audioPreviewRef} className="hidden" />

        <button
          type="button"
          onClick={handlePlayPreview}
          className={clsx(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            "bg-surface text-text-primary hover:bg-surface-hover",
          )}
          aria-label={isPlaying ? t("chat:voice.pause") : t("chat:voice.play")}
        >
          {isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>

        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            {t("chat:voice.recordingComplete", { defaultValue: "Ghi âm sẵn sàng" })}
          </p>
          <p className="text-xs text-text-muted">
            {formattedDuration}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSend}
          className={clsx(
            "flex h-12 w-12 items-center justify-center rounded-full transition-all",
            "bg-primary text-text-inverse hover:bg-primary-hover",
          )}
          aria-label={t("chat:voice.sendRecording")}
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={handleCancel}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-full transition-all",
            "bg-surface text-text-secondary hover:bg-surface-hover hover:text-danger",
          )}
          aria-label={t("chat:common.cancel")}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Recording or paused state
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      {/* Progress indicator */}
      <div className="relative flex h-12 w-12 items-center justify-center">
        <svg className="h-12 w-12 -rotate-90 transform" viewBox="0 0 48 48">
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-border"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - progressPercent / 100)}`}
            className="text-danger transition-all duration-100"
          />
        </svg>
        <span className="absolute text-xs font-medium text-text-primary">
          {progressPercent.toFixed(0)}%
        </span>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={clsx(
            "h-2 w-2 rounded-full animate-pulse",
            state === "recording" ? "bg-danger" : "bg-warning"
          )} />
          <p className="text-sm font-medium text-text-primary">
            {state === "paused"
              ? t("chat:voice.paused", { defaultValue: "Đã tạm dừng" })
              : t("chat:voice.recording", { defaultValue: "Đang ghi" })}
          </p>
        </div>
        <p className="text-xs text-text-muted">
          {formattedDuration} / {maxDurationFormatted}
        </p>
      </div>

      {/* Pause/Resume button */}
      {state === "recording" && (
        <button
          type="button"
          onClick={pauseRecording}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-full transition-all",
            "bg-surface text-text-secondary hover:bg-surface-hover",
          )}
          aria-label={t("chat:voice.pause")}
        >
          <PauseIcon className="h-4 w-4" />
        </button>
      )}

      {state === "paused" && (
        <button
          type="button"
          onClick={resumeRecording}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-full transition-all",
            "bg-surface text-text-secondary hover:bg-surface-hover",
          )}
          aria-label={t("chat:voice.resume")}
        >
          <PlayIcon className="h-4 w-4" />
        </button>
      )}

      {/* Stop button */}
      <button
        type="button"
        onClick={stopRecording}
        className={clsx(
          "flex h-12 w-12 items-center justify-center rounded-full transition-all",
          "bg-danger text-text-inverse hover:bg-danger/90",
        )}
        aria-label={t("chat:voice.stop")}
      >
        <StopIcon className="h-5 w-5" />
      </button>

      {/* Cancel button */}
      <button
        type="button"
        onClick={handleCancel}
        className={clsx(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all",
          "bg-surface text-text-secondary hover:bg-surface-hover hover:text-danger",
        )}
        aria-label={t("chat:common.cancel")}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default VoiceRecorder;
