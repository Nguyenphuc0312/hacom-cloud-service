/**
 * @fileoverview useVoiceRecorder - Hook for audio recording using MediaRecorder API.
 * Handles permission requests, recording state, and provides controls for recording.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "preview"
  | "error";

export interface UseVoiceRecorderOptions {
  /** Maximum recording duration in milliseconds */
  maxDuration?: number;
  /** Preferred MIME type for recording */
  mimeType?: string;
  /** Callback when recording completes */
  onRecordingComplete?: (result: { blob: Blob; duration: number; mimeType: string }) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

export interface UseVoiceRecorderReturn {
  /** Current recording state */
  state: VoiceRecorderState;
  /** Current recording duration in milliseconds */
  duration: number;
  /** Error message if state is "error" */
  error: string | null;
  /** Microphone permission status */
  permissionStatus: PermissionState | "unknown";
  /** Start recording */
  startRecording: () => Promise<void>;
  /** Stop recording and enter preview state */
  stopRecording: () => void;
  /** Cancel recording and reset */
  cancelRecording: () => void;
  /** Pause recording */
  pauseRecording: () => void;
  /** Resume recording */
  resumeRecording: () => void;
  /** Get the recorded blob */
  getRecordingBlob: () => { blob: Blob; duration: number; mimeType: string } | null;
  /** Reset to idle state */
  reset: () => void;
}

const DEFAULT_MAX_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get supported MIME type for recording
 */
const getSupportedMimeType = (preferredMimeType?: string): string => {
  const types = [
    preferredMimeType,
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ].filter(Boolean) as string[];

  for (const mimeType of types) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    } catch {
      // Ignore errors
    }
  }

  // Fallback to any supported type
  return "audio/webm";
};

/**
 * Hook for voice recording functionality
 */
export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {},
): UseVoiceRecorderReturn {
  const {
    maxDuration = DEFAULT_MAX_DURATION,
    mimeType: preferredMimeType,
    onRecordingComplete,
    onError,
  } = options;

  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | "unknown">("unknown");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>(getSupportedMimeType(preferredMimeType));
  const maxDurationRef = useRef<number>(maxDuration);
  const stopRecordingRef = useRef<() => void>(() => {});

  // Keep maxDuration ref updated
  useEffect(() => {
    maxDurationRef.current = maxDuration;
  }, [maxDuration]);

  // Clean up resources
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    pausedDurationRef.current = 0;
  }, []);

  // Reset to idle state
  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    setDuration(0);
    setError(null);
  }, [cleanup]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    cleanup();
    setState("idle");
    setDuration(0);
    setError(null);
  }, [cleanup]);

  // Stop recording - defined first to allow cross-referencing
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Accumulate paused duration
    if (startTimeRef.current > 0) {
      pausedDurationRef.current += Date.now() - startTimeRef.current;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setState("preview");
  }, []);

  // Keep stopRecording ref updated
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setState("requesting_permission");

      // Check microphone permission
      let permission: PermissionState;
      try {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        permission = result.state;
        setPermissionStatus(permission);
        result.addEventListener("change", () => {
          setPermissionStatus(result.state);
        });
      } catch {
        permission = "prompt";
      }

      if (permission === "denied") {
        throw new Error("Microphone access denied. Please enable microphone permissions in your browser settings.");
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mimeType = getSupportedMimeType(preferredMimeType);
      mimeTypeRef.current = mimeType;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        // Fallback without mimeType option
        recorder = new MediaRecorder(stream);
        mimeTypeRef.current = recorder.mimeType;
      }

      mediaRecorderRef.current = recorder;

      // Handle data available
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        const finalDuration = pausedDurationRef.current || (Date.now() - startTimeRef.current);

        if (onRecordingComplete) {
          onRecordingComplete({
            blob,
            duration: finalDuration,
            mimeType: mimeTypeRef.current,
          });
        }
      };

      // Handle error
      recorder.onerror = (event) => {
        const errorMessage = (event as unknown as { error?: Error }).error?.message || "Recording error occurred";
        setError(errorMessage);
        setState("error");
        onError?.(errorMessage);
        cleanup();
      };

      // Start recording
      recorder.start(1000); // Collect data every second
      startTimeRef.current = Date.now();
      setState("recording");

      // Start timer using ref for maxDuration and stopRecording to avoid circular deps
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current + pausedDurationRef.current;
        setDuration(elapsed);

        // Auto-stop at max duration using ref
        if (elapsed >= maxDurationRef.current) {
          stopRecordingRef.current();
        }
      }, 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start recording";
      setError(errorMessage);
      setState("error");
      onError?.(errorMessage);
      cleanup();
    }
  }, [cleanup, onError, onRecordingComplete, preferredMimeType]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      pausedDurationRef.current += Date.now() - startTimeRef.current;
      startTimeRef.current = 0;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setState("paused");
    }
  }, []);

  // Resume recording - uses ref to avoid circular dependency with stopRecording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      setState("recording");

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current + pausedDurationRef.current;
        setDuration(elapsed);

        if (elapsed >= maxDurationRef.current) {
          stopRecordingRef.current();
        }
      }, 100);
    }
  }, []);

  // Get recording blob
  const getRecordingBlob = useCallback(() => {
    if (audioChunksRef.current.length === 0) {
      return null;
    }

    const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
    const finalDuration = pausedDurationRef.current || duration;

    return {
      blob,
      duration: finalDuration,
      mimeType: mimeTypeRef.current,
    };
  }, [duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    duration,
    error,
    permissionStatus,
    startRecording,
    stopRecording,
    cancelRecording,
    pauseRecording,
    resumeRecording,
    getRecordingBlob,
    reset,
  };
}

export default useVoiceRecorder;
