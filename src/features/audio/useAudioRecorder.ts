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
const PERMISSION_REQUEST_TIMEOUT_MS = 25_000;

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

  requestPermission: () => Promise<boolean>;
  startRecording: () => void;
  stopRecording: () => Promise<RecordedClip>;
  cancelRecording: () => void;
  beginUpload: () => boolean;
  beginFinalizingUpload: () => boolean;
  beginSending: () => boolean;
  markSent: () => boolean;
  markFailed: (error: AudioRecorderError) => void;
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
  const stateRef = useRef<AudioRecorderState>("IDLE");
  const activeRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef(0);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permissionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedMimeRef = useRef("");

  // ---- State transition helper ----
  const transition = useCallback(
    (to: AudioRecorderState): boolean => {
      const from = stateRef.current;
      const allowed = ALLOWED_TRANSITIONS.get(from);
      if (!allowed?.has(to)) {
        console.warn(
          `[AudioRecorder] Forbidden transition: ${from} → ${to}`,
        );
        return false;
      }
      stateRef.current = to;
      setState(to);
      return true;
    },
    [],
  );

  const setErrorState = useCallback(
    (code: AudioRecorderErrorCode, message: string, retryable = false) => {
      setError({ code, message, retryable });
      stateRef.current = "FAILED";
      setState("FAILED");
    },
    [],
  );

  // ---- Cleanup ALL resources ----
  const fullCleanup = useCallback(() => {
    activeRequestIdRef.current += 1;
    if (permissionTimeoutRef.current) {
      clearTimeout(permissionTimeoutRef.current);
      permissionTimeoutRef.current = null;
    }
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
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Recorder may already be inactive/stopping.
      }
    }
    mediaRecorderRef.current = null;
    // Stop all MediaStream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        if (t.readyState !== "ended") t.stop();
      });
      streamRef.current = null;
    }
    // Close AudioContext
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
        selectedMimeRef.current = mime;
        setSelectedMime(mime);
        return mime;
      }
    }
    selectedMimeRef.current = "";
    setSelectedMime("");
    return "";
  }, []);

  // ---- Request microphone permission ----
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!transition("REQUESTING_PERMISSION")) return false;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

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
      return false;
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
      return false;
    }

    permissionTimeoutRef.current = setTimeout(() => {
      if (
        mountedRef.current &&
        activeRequestIdRef.current === requestId &&
        stateRef.current === "REQUESTING_PERMISSION"
      ) {
        setErrorState(
          "PERMISSION_DENIED",
          "Không thể truy cập microphone. Hãy thử lại hoặc kiểm tra quyền microphone của trình duyệt.",
          true,
        );
      }
    }, PERMISSION_REQUEST_TIMEOUT_MS);

    try {
      // Check permission state
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setPermissionState(status.state);
          if (status.state === "denied") {
            if (permissionTimeoutRef.current) {
              clearTimeout(permissionTimeoutRef.current);
              permissionTimeoutRef.current = null;
            }
            setErrorState(
              "PERMISSION_BLOCKED",
              "Microphone access is blocked. Please enable it in your browser settings.",
              false,
            );
            return false;
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

      if (
        !mountedRef.current ||
        activeRequestIdRef.current !== requestId ||
        stateRef.current !== "REQUESTING_PERMISSION"
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
        permissionTimeoutRef.current = null;
      }

      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (
            mountedRef.current &&
            activeRequestIdRef.current === requestId &&
            stateRef.current === "RECORDING"
          ) {
            setErrorState(
              "RECORDING_INTERRUPTED",
              "Microphone stopped unexpectedly.",
              true,
            );
            fullCleanup();
          }
        };
      });

      // Set up Web Audio analyser as a visual enhancement only.
      try {
        const audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => undefined);
        }
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = ANALYSER_FFT;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        sourceNodeRef.current = source;
        analyserRef.current = analyser;
      } catch {
        sourceNodeRef.current = null;
        analyserRef.current = null;
      }

      probeMime();
      return transition("READY");
    } catch (err) {
      if (
        !mountedRef.current ||
        activeRequestIdRef.current !== requestId ||
        stateRef.current !== "REQUESTING_PERMISSION"
      ) {
        return false;
      }
      if (permissionTimeoutRef.current) {
        clearTimeout(permissionTimeoutRef.current);
        permissionTimeoutRef.current = null;
      }

      const errorName = err instanceof DOMException ? err.name : "";
      if (errorName === "NotAllowedError") {
        setErrorState(
          "PERMISSION_DENIED",
          "Không thể truy cập microphone. Hãy cho phép trình duyệt sử dụng microphone để gửi tin nhắn thoại.",
          true,
        );
      } else if (errorName === "NotFoundError") {
        setErrorState(
          "RECORDER_UNSUPPORTED",
          "Không tìm thấy microphone. Hãy kiểm tra thiết bị thu âm của bạn.",
          false,
        );
      } else if (errorName === "NotReadableError") {
        setErrorState(
          "RECORDING_INTERRUPTED",
          "Microphone đang được ứng dụng khác sử dụng.",
          true,
        );
      } else if (errorName === "SecurityError") {
        setErrorState(
          "RECORDER_UNSUPPORTED",
          "Không thể sử dụng microphone trong kết nối hiện tại.",
          false,
        );
      } else {
        setErrorState(
          "RECORDER_UNSUPPORTED",
          err instanceof Error ? err.message : "Không thể bắt đầu ghi âm.",
          true,
        );
      }
      return false;
    }
  }, [transition, setErrorState, fullCleanup, probeMime]);

  // ---- Start recording ----
  function startRecording(): void {
    if (!transition("RECORDING")) return;

    const stream = streamRef.current;
    if (!stream) {
      setErrorState("RECORDER_UNSUPPORTED", "No microphone stream.", false);
      return;
    }
    if (stream.getAudioTracks().every((track) => track.readyState === "ended")) {
      setErrorState(
        "RECORDING_INTERRUPTED",
        "Microphone stopped before recording could start.",
        true,
      );
      return;
    }

    chunksRef.current = [];

    const mime = selectedMimeRef.current || undefined;
    try {
      const recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
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
        fullCleanup();
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
        `Không thể bắt đầu ghi âm: ${(err as Error).message}`,
        false,
      );
      fullCleanup();
    }
  }

  // ---- Stop recording ----
  function stopRecording(): Promise<RecordedClip> {
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

        // A preview must retain only the Blob URL, never the microphone.
        // Releasing the input here turns off the browser mic indicator before
        // upload/send and avoids retaining a live stream while previewing.
        streamRef.current?.getTracks().forEach((track) => {
          track.onended = null;
          if (track.readyState !== "ended") track.stop();
        });
        streamRef.current = null;
        sourceNodeRef.current?.disconnect();
        sourceNodeRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          void audioCtxRef.current.close().catch(() => undefined);
        }
        audioCtxRef.current = null;
        mediaRecorderRef.current = null;

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
        stateRef.current = "PREVIEW";
        setState("PREVIEW");
        resolve(recordedClip);
      };

      recorder.requestData();
      recorder.stop();
    });
  }

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
    stateRef.current = "IDLE";
    setState("IDLE");
    setPermissionState(null);
    selectedMimeRef.current = "";
    setSelectedMime("");
  }, [fullCleanup]);

  const beginUpload = useCallback(() => transition("UPLOADING"), [transition]);
  const beginFinalizingUpload = useCallback(
    () => transition("FINALIZING_UPLOAD"),
    [transition],
  );
  const beginSending = useCallback(() => transition("CREATING_MESSAGE"), [transition]);
  const markSent = useCallback(() => transition("SENT"), [transition]);
  const markFailed = useCallback((nextError: AudioRecorderError) => {
    setError(nextError);
    stateRef.current = "FAILED";
    setState("FAILED");
  }, []);

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
    beginUpload,
    beginFinalizingUpload,
    beginSending,
    markSent,
    markFailed,
    reset,
  };
}
