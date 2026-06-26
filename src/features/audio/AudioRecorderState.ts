/**
 * Phase 2C — Audio Recording State Machine (shared types)
 *
 * Strict state transitions with guards.
 * Used by both Web and Mobile implementations.
 */

// ---------------------------------------------------------------------------
// State enum
// ---------------------------------------------------------------------------

export type AudioRecorderState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "READY"
  | "RECORDING"
  | "STOPPING"
  | "UPLOADING"
  | "FINALIZING_UPLOAD"
  | "CREATING_MESSAGE"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

// ---------------------------------------------------------------------------
// Error types — distinct, not generic
// ---------------------------------------------------------------------------

export type AudioRecorderErrorCode =
  | "PERMISSION_DENIED"
  | "PERMISSION_BLOCKED"
  | "RECORDER_UNSUPPORTED"
  | "RECORDING_INTERRUPTED"
  | "FILE_TOO_SHORT"
  | "FILE_TOO_LARGE"
  | "UPLOAD_NETWORK_FAILURE"
  | "PRESIGNED_URL_EXPIRED"
  | "FINALIZE_FAILURE"
  | "MESSAGE_CREATE_FAILURE"
  | "PLAYBACK_URL_EXPIRED"
  | "CODEC_UNSUPPORTED"
  | "OBJECT_MISSING"
  | "UNKNOWN";

export interface AudioRecorderError {
  code: AudioRecorderErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Recorded clip (before upload)
// ---------------------------------------------------------------------------

export interface RecordedClip {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  url: string; // blob URL for local playback
}

// ---------------------------------------------------------------------------
// Upload progress
// ---------------------------------------------------------------------------

export interface UploadProgress {
  fileId?: string;
  uploadId?: string;
  /** 0–100 */
  percent: number;
  status: "uploading" | "finalizing" | "completed" | "failed";
}

// ---------------------------------------------------------------------------
// Message send result
// ---------------------------------------------------------------------------

export interface AudioMessageSendResult {
  clientMessageId: string;
  fileId: string;
  disposition: "optimistic" | "sent" | "failed";
}

// ---------------------------------------------------------------------------
// State machine transitions
// ---------------------------------------------------------------------------

/**
 * Allowed transitions. Any transition not listed here is forbidden.
 */
export const ALLOWED_TRANSITIONS: ReadonlyMap<AudioRecorderState, ReadonlySet<AudioRecorderState>> = new Map<AudioRecorderState, ReadonlySet<AudioRecorderState>>([
  ["IDLE", new Set(["REQUESTING_PERMISSION"])],
  ["REQUESTING_PERMISSION", new Set(["READY", "FAILED", "CANCELLED"])],
  ["READY", new Set(["RECORDING", "CANCELLED"])],
  ["RECORDING", new Set(["STOPPING", "CANCELLED"])],
  ["STOPPING", new Set(["UPLOADING", "CANCELLED"])],
  ["UPLOADING", new Set(["FINALIZING_UPLOAD", "FAILED"])],
  ["FINALIZING_UPLOAD", new Set(["CREATING_MESSAGE", "FAILED"])],
  ["CREATING_MESSAGE", new Set(["SENT", "FAILED"])],
  ["SENT", new Set(["IDLE"])],
  ["FAILED", new Set(["UPLOADING", "IDLE", "CANCELLED"])], // retry from UPLOADING
  ["CANCELLED", new Set(["IDLE"])],
]);

export function canTransition(
  from: AudioRecorderState,
  to: AudioRecorderState,
): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export interface RecordingGuards {
  /** Prevent starting a second recorder while one is active */
  canStartRecording: boolean;
  /** Prevent sending text/files while recording (if UI doesn't support) */
  canSendWhileRecording: boolean;
  /** Prevent multiple Send clicks creating multiple uploads */
  canSendMessage: boolean;
}

export function getGuards(state: AudioRecorderState): RecordingGuards {
  const isActive = state === "RECORDING" || state === "STOPPING";
  const isUploading =
    state === "UPLOADING" ||
    state === "FINALIZING_UPLOAD" ||
    state === "CREATING_MESSAGE";

  return {
    canStartRecording:
      state === "IDLE" || state === "CANCELLED" || state === "SENT",
    canSendWhileRecording: !isActive,
    canSendMessage: !isUploading && state !== "SENT",
  };
}

// ---------------------------------------------------------------------------
// Duration limits (mirrors backend config)
// ---------------------------------------------------------------------------

export const AUDIO_DURATION_LIMITS = {
  /** Minimum recording duration in ms (server-enforced) */
  MIN_DURATION_MS: 500,
  /** Maximum recording duration in ms (client auto-stops) */
  MAX_DURATION_MS: 300_000, // 5 minutes
  /** Warning threshold — client shows countdown */
  WARNING_THRESHOLD_MS: 270_000, // 4:30
} as const;

// ---------------------------------------------------------------------------
// Playback state
// ---------------------------------------------------------------------------

export type PlaybackState =
  | "IDLE"
  | "LOADING"
  | "PLAYING"
  | "PAUSED"
  | "ENDED"
  | "ERROR";

export interface PlaybackInfo {
  messageId: string;
  state: PlaybackState;
  currentTimeMs: number;
  durationMs: number;
  url: string | null;
  errorCode?: AudioRecorderErrorCode;
}
