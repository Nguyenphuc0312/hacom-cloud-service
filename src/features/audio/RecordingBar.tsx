/**
 * Phase 2C — RecordingBar (Web)
 *
 * Replaces the composer when recording is active.
 * Shows: cancel button, timer, real amplitude waveform, send button.
 */

import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AUDIO_DURATION_LIMITS,
  type AudioRecorderError,
  type AudioRecorderState,
} from "./AudioRecorderState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecordingBarProps {
  state: AudioRecorderState;
  elapsedMs: number;
  amplitude: number[];
  error: AudioRecorderError | null;
  permissionState: PermissionState | null;
  onCancel: () => void;
  onSend: () => void;
  onRequestPermission: () => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

const formatTime = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const formatTimeVerbose = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RecordingBar: React.FC<RecordingBarProps> = ({
  state,
  elapsedMs,
  amplitude,
  error,
  permissionState,
  onCancel,
  onSend,
  onRequestPermission,
  disabled = false,
}) => {
  const { t } = useTranslation();

  // Warning when approaching max duration
  const isWarning =
    state === "RECORDING" &&
    elapsedMs >= AUDIO_DURATION_LIMITS.WARNING_THRESHOLD_MS;
  const remainingMs = AUDIO_DURATION_LIMITS.MAX_DURATION_MS - elapsedMs;

  // Normalize amplitude for display
  const displayAmplitude = useMemo(() => {
    if (state !== "RECORDING") return Array.from({ length: 40 }, () => 0.05);
    return amplitude.length > 0 ? amplitude : Array.from({ length: 40 }, () => 0.1);
  }, [state, amplitude]);

  // ---- IDLE / Initial state ----
  if (state === "IDLE" || state === "CANCELLED" || state === "SENT") {
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border-light bg-surface">
        <button
          onClick={onRequestPermission}
          disabled={disabled}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-full",
            "bg-primary text-white hover:bg-primary-hover",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors",
          )}
          aria-label={t("chat:audio.record", { defaultValue: "Record voice message" })}
        >
          <MicIcon className="w-5 h-5" />
          <span className="text-sm font-medium">
            {t("chat:audio.holdToRecord", { defaultValue: "Voice" })}
          </span>
        </button>
      </div>
    );
  }

  // ---- REQUESTING_PERMISSION ----
  if (state === "REQUESTING_PERMISSION") {
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border-light bg-surface">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">
            {t("chat:audio.requestingPermission", {
              defaultValue: "Requesting microphone...",
            })}
          </span>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto px-3 py-1 text-sm text-text-muted hover:text-text"
          aria-label={t("common:cancel")}
        >
          {t("common:cancel")}
        </button>
      </div>
    );
  }

  // ---- PERMISSION DENIED / ERROR ----
  if (state === "FAILED" && error) {
    const isDenied =
      error.code === "PERMISSION_DENIED" || error.code === "PERMISSION_BLOCKED";
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border-light bg-surface">
        <div className="flex-1">
          <p className="text-sm text-error">
            {isDenied
              ? t("chat:audio.permissionDenied", {
                  defaultValue:
                    "Microphone access is blocked. Check your browser settings.",
                })
              : error.message}
          </p>
          {isDenied && (
            <p className="text-xs text-text-muted mt-1">
              {t("chat:audio.permissionGuide", {
                defaultValue:
                  "Go to Settings → Privacy → Microphone to enable access.",
              })}
            </p>
          )}
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-sm text-text-muted hover:text-text"
          aria-label={t("common:dismiss")}
        >
          {t("common:dismiss")}
        </button>
        {error.retryable && (
          <button
            onClick={onRequestPermission}
            className="px-3 py-1 text-sm text-primary"
          >
            {t("common:retry")}
          </button>
        )}
      </div>
    );
  }

  // ---- READY (permission granted, not yet recording) ----
  if (state === "READY") {
    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border-light bg-surface">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm">
            {t("chat:audio.ready", { defaultValue: "Ready to record" })}
          </span>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto px-3 py-1 text-sm text-text-muted hover:text-text"
        >
          {t("common:cancel")}
        </button>
      </div>
    );
  }

  // ---- RECORDING ----
  if (state === "RECORDING") {
    return (
      <div className="flex flex-col gap-2 px-3 py-2 border-t border-border-light bg-surface">
        {/* Timer + Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-error/10 text-error hover:bg-error/20 transition-colors"
            aria-label={t("chat:audio.cancel", { defaultValue: "Cancel recording" })}
          >
            <TrashIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 flex-1">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span
              className={clsx(
                "text-lg font-mono font-semibold tabular-nums",
                isWarning ? "text-error" : "text-text",
              )}
            >
              {isWarning
                ? `-${formatTime(remainingMs)}`
                : formatTimeVerbose(elapsedMs)}
            </span>
          </div>

          <button
            onClick={onSend}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-white hover:bg-primary-hover transition-colors"
            aria-label={t("chat:audio.send", { defaultValue: "Send voice message" })}
          >
            <SendIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Real amplitude waveform */}
        <div className="flex items-end h-12 gap-[2px]">
          {displayAmplitude.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-[2px] transition-all duration-75"
              style={{
                height: `${Math.max(4, v * 100)}%`,
                backgroundColor: isWarning ? "#ef4444" : "#1976D2",
                opacity: 0.8,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ---- STOPPING / UPLOADING / FINALIZING / CREATING_MESSAGE ----
  if (
    state === "STOPPING" ||
    state === "UPLOADING" ||
    state === "FINALIZING_UPLOAD" ||
    state === "CREATING_MESSAGE"
  ) {
    const label =
      state === "UPLOADING"
        ? t("chat:audio.uploading", { defaultValue: "Uploading..." })
        : state === "FINALIZING_UPLOAD"
          ? t("chat:audio.processing", { defaultValue: "Processing..." })
          : state === "CREATING_MESSAGE"
            ? t("chat:audio.sending", { defaultValue: "Sending..." })
            : t("chat:audio.stopping", { defaultValue: "Stopping..." });

    return (
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border-light bg-surface">
        <div className="flex items-center gap-2 text-text-muted">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{label}</span>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto px-3 py-1 text-sm text-text-muted hover:text-text"
        >
          {t("common:cancel")}
        </button>
      </div>
    );
  }

  // Fallback
  return null;
};

// ---------------------------------------------------------------------------
// Inline SVG icons (avoid extra deps for isolated feature)
// ---------------------------------------------------------------------------

const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19 10v2a7 7 0 0 1-14 0v-2"
    />
    <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" />
    <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" />
  </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

export default RecordingBar;
