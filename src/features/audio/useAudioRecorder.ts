/**
 * Phase 2C — useAudioRecorder (Web)
 *
 * Manages the complete audio recording lifecycle:
 *   permission → record → stop/cancel → blob → playback → upload
 *
 * Uses MediaRecorder API + Web Audio API for real amplitude.
 * Strict state machine with guards.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_TRANSITIONS,
  AUDIO_DURATION_LIMITS,
  type AudioRecorderError,
  type AudioRecorderErrorCode,
  type AudioRecorderState,
  type RecordedClip,
} from "./AudioRecorderState";

// ---------------------------------------------------------------------------
// MIME candidates (from Phase 2A results)
// ---------------------------------------------------------------------------

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const ANALYSER_FFT = 256;
const AMPLITUDE_BARS = 40;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

interface UseAudioRecorderReturn {
  state: AudioRecorderState;
  error: AudioRecorderError | null;
  elapsedMs: number;
  amplitude: number[];
  clip: RecordedClip | null;
  selectedMime: string;
  permissionState: PermissionState | null;

  requestPermission: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => Promise<RecordedClip>;
  cancelRecording: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<AudioRecorderState>("IDLE");
  const [error, setError] = useState<AudioRecorderError | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [amplitude, setAmplitude] = useState<number[]>(
    Array.from({ length: AMPLITUDE_BARS }, () => 0),
  );
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [selectedMime, setSelectedMime] = useState("");
  const [permissionState, setPermissionState] =
    useState<PermissionState | null>(null);

  // Refs — survive re-renders, cleaned up on unmount/cancel
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef(0);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- State transition helper ----
  const transition = useCallback(
    (to: AudioRecorderState): boolean => {
      let currentState: AudioRecorderState = "IDLE";
      setState((prev) => {
        currentState = prev;
        return prev;
      });

      // Re-read current state
      const from = currentState;
      const allowed = ALLOWED_TRANSITIONS.get(from);
      if (!allowed?.has(to)) {
        console.warn(
          `[AudioRecorder] Forbidden transition: ${from} → ${to}`,
        );
        return false;
      }
      setState(to);
      return true;
    },
    [],
  );

  const setErrorState = useCallback(
    (code: AudioRecorderErrorCode, message: string, retryable = false) => {
      setError({ code, message, retryable });
      setState("FAILED");
    },
    [],
  );

  // ---- Cleanup ALL resources ----
  const fullCleanup = useCallback(() => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop max duration timer
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    // Stop amplitude loop
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    // Stop MediaRecorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    // Stop all MediaStream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Close AudioContext
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    // Clear chunks
    chunksRef.current = [];
    // Revoke old blob URL
    setClip((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setElapsedMs(0);
    setAmplitude(Array.from({ length: AMPLITUDE_BARS }, () => 0));
  }, []);

  // ---- Unmount cleanup ----
  useEffect(() => {
    return () => {
      fullCleanup();
    };
  }, [fullCleanup]);

  // ---- Amplitude loop ----
  const startAmplitudeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(dataArray);
      const binCount = dataArray.length;
      const step = Math.max(1, Math.floor(binCount / AMPLITUDE_BARS));
      const bars: number[] = [];
      for (let i = 0; i < AMPLITUDE_BARS; i++) {
        let sum = 0;
        const start = i * step;
        const end = Math.min(start + step, binCount);
        for (let j = start; j < end; j++) sum += dataArray[j];
        bars.push(Math.min(1, (sum / (end - start)) / 255));
      }
      setAmplitude(bars);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  // ---- Probe MIME support ----
  const probeMime = useCallback(() => {
    for (const mime of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(mime)) {
        setSelectedMime(mime);
        return mime;
      }
    }
    setSelectedMime("");
    return "";
  }, []);

  // ---- Request microphone permission ----
  const requestPermission = useCallback(async () => {
    if (!transition("REQUESTING_PERMISSION")) return;

    // HTTPS check (except localhost)
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setErrorState(
        "RECORDER_UNSUPPORTED",
        "Microphone requires HTTPS (except localhost).",
        false,
      );
      return;
    }

    // Browser support check
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setErrorState(
        "RECORDER_UNSUPPORTED",
        "Audio recording is not supported in this browser.",
        false,
      );
      return;
    }

    try {
      // Check permission state
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setPermissionState(status.state);
          if (status.state === "denied") {
            setErrorState(
              "PERMISSION_BLOCKED",
              "Microphone access is blocked. Please enable it in your browser settings.",
              false,
            );
            return;
          }
        } catch {
          // Permissions API may not be available
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
        },
      });

      streamRef.current = stream;

      // Set up Web Audio analyser
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = ANALYSER_FFT;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      probeMime();
      transition("READY");
    } catch (err) {
      const message =
        err instanceof DOMException
          ? err.name === "NotAllowedError"
            ? "Microphone access was denied."
            : err.name === "NotFoundError"
              ? "No microphone found."
              : err.message
          : (err as Error).message;

      setErrorState(
        message.includes("denied") || message.includes("NotAllowed")
          ? "PERMISSION_DENIED"
          : "RECORDER_UNSUPPORTED",
        message,
        true,
      );
    }
  }, [transition, setErrorState, probeMime]);

  // ---- Start recording ----
  const startRecording = useCallback(() => {
    if (!transition("RECORDING")) return;

    const stream = streamRef.current;
    if (!stream) {
      setErrorState("RECORDER_UNSUPPORTED", "No microphone stream.", false);
      return;
    }

    fullCleanup();
    chunksRef.current = [];

    const mime = selectedMime || undefined;
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        setErrorState(
          "RECORDING_INTERRUPTED",
          "Recording was interrupted.",
          true,
        );
      };

      recorder.start(250);
      startTimeRef.current = Date.now();

      // Timer
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

      // Auto-stop at max duration
      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          // Will be handled by stopRecording
          void (async () => {
            try {
              await stopRecording();
            } catch {
              // ignore
            }
          })();
        }
      }, AUDIO_DURATION_LIMITS.MAX_DURATION_MS);

      startAmplitudeLoop();
      setElapsedMs(0);
    } catch (err) {
      setErrorState(
        "RECORDER_UNSUPPORTED",
        `Cannot create recorder: ${(err as Error).message}`,
        false,
      );
      setState("READY");
    }
  }, [transition, fullCleanup, selectedMime, startAmplitudeLoop, setErrorState]);

  // ---- Stop recording ----
  const stopRecording = useCallback((): Promise<RecordedClip> => {
    return new Promise((resolve, reject) => {
      if (!transition("STOPPING")) {
        reject(new Error("Invalid state transition"));
        return;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        reject(new Error("No active recorder"));
        return;
      }

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (maxDurationTimerRef.current) {
        clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = null;
      }
      // Stop amplitude loop
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }

      recorder.onstop = () => {
        const actualMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        const url = URL.createObjectURL(blob);
        const durationMs = Date.now() - startTimeRef.current;

        const recordedClip: RecordedClip = {
          blob,
          mimeType: actualMime,
          sizeBytes: blob.size,
          durationMs,
          url,
        };

        // Validate min duration
        if (durationMs < AUDIO_DURATION_LIMITS.MIN_DURATION_MS) {
          URL.revokeObjectURL(url);
          setErrorState(
            "FILE_TOO_SHORT",
            `Recording too short (${durationMs}ms < ${AUDIO_DURATION_LIMITS.MIN_DURATION_MS}ms minimum).`,
            false,
          );
          setElapsedMs(durationMs);
          reject(new Error("Recording too short"));
          return;
        }

        setClip(recordedClip);
        setElapsedMs(durationMs);
        setState("STOPPING"); // stays in STOPPING until upload begins
        resolve(recordedClip);
      };

      recorder.requestData();
      recorder.stop();
    });
  }, [transition, setErrorState]);

  // ---- Cancel recording ----
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      // Override onstop to prevent clip creation
      recorder.onstop = () => {
        chunksRef.current = [];
      };
      recorder.requestData();
      recorder.stop();
    }

    fullCleanup();
    transition("CANCELLED");
  }, [fullCleanup, transition]);

  // ---- Reset to IDLE ----
  const reset = useCallback(() => {
    fullCleanup();
    setError(null);
    setState("IDLE");
    setPermissionState(null);
    setSelectedMime("");
  }, [fullCleanup]);

  return {
    state,
    error,
    elapsedMs,
    amplitude,
    clip,
    selectedMime,
    permissionState,

    requestPermission,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  };
}
