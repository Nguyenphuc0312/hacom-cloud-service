/**
 * PHASE 2A — Audio Recorder POC (Web)
 *
 * ISOLATED proof-of-concept. Do NOT merge into production flow.
 *
 * Features:
 *  - Microphone permission after user gesture
 *  - Record with timer display
 *  - Stop / Cancel with cleanup
 *  - Local Blob creation
 *  - Local playback via <audio>
 *  - Controlled logging:
 *      - actual mimeType produced
 *      - file size
 *      - duration
 *      - MediaRecorder.isTypeSupported for all candidates
 *  - Tries MIME candidates in order; does NOT hard-code a single format
 *  - Amplitude via Web Audio API AnalyserNode (real values, not random)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MIME candidates to probe, in descending preference. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

const AMPLITUDE_BARS = 60;
const ANALYSER_FFT = 256;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecorderState =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "recording"
  | "stopped"
  | "cancelled";

interface CandidateSupport {
  mime: string;
  supported: boolean;
}

interface RecordedClip {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  url: string;
}

interface POCLogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "result";
  message: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTime = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const AudioRecorderPoc: React.FC = () => {
  // -- state ----------------------------------------------------------------
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [permissionState, setPermissionState] =
    useState<PermissionState | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [playbackState, setPlaybackState] = useState<
    "idle" | "playing" | "paused" | "ended"
  >("idle");
  const [playbackCurrentMs, setPlaybackCurrentMs] = useState(0);
  const [mimeCandidates, setMimeCandidates] = useState<CandidateSupport[]>([]);
  const [selectedMime, setSelectedMime] = useState<string>("");
  const [amplitude, setAmplitude] = useState<number[]>(
    Array.from({ length: AMPLITUDE_BARS }, () => 0),
  );
  const [logs, setLogs] = useState<POCLogEntry[]>([]);

  // -- refs -----------------------------------------------------------------
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- logging helper -------------------------------------------------------
  const addLog = useCallback(
    (level: POCLogEntry["level"], message: string, data?: Record<string, unknown>) => {
      setLogs((prev) => [
        ...prev,
        { ts: new Date().toISOString(), level, message, data },
      ]);
    },
    [],
  );

  // -- cleanup helpers ------------------------------------------------------
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAmplitudeLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  const releaseStream = useCallback(() => {
    stopTimer();
    stopAmplitudeLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
  }, [stopTimer, stopAmplitudeLoop]);

  const cleanupClip = useCallback(() => {
    if (clip?.url) {
      URL.revokeObjectURL(clip.url);
    }
    setClip(null);
    setPlaybackState("idle");
    setPlaybackCurrentMs(0);
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.src = "";
      playbackAudioRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.url]);

  const fullCleanup = useCallback(() => {
    stopTimer();
    stopAmplitudeLoop();
    releaseStream();
    cleanupClip();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setElapsedMs(0);
    setAmplitude(Array.from({ length: AMPLITUDE_BARS }, () => 0));
  }, [stopTimer, stopAmplitudeLoop, releaseStream, cleanupClip]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      fullCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- amplitude loop -------------------------------------------------------
  const startAmplitudeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getByteFrequencyData(dataArray);
      // Downsample to AMPLITUDE_BARS
      const binCount = dataArray.length;
      const step = Math.max(1, Math.floor(binCount / AMPLITUDE_BARS));
      const bars: number[] = [];
      for (let i = 0; i < AMPLITUDE_BARS; i++) {
        let sum = 0;
        const start = i * step;
        const end = Math.min(start + step, binCount);
        for (let j = start; j < end; j++) {
          sum += dataArray[j];
        }
        bars.push((sum / (end - start)) / 255); // normalize 0–1
      }
      setAmplitude(bars);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  // -- probe MIME support ---------------------------------------------------
  const probeMimeSupport = useCallback(() => {
    const results: CandidateSupport[] = MIME_CANDIDATES.map((mime) => ({
      mime,
      supported: MediaRecorder.isTypeSupported(mime),
    }));
    setMimeCandidates(results);
    addLog("info", "MIME support probed", {
      candidates: results.map((r) => `${r.mime}=${r.supported}`),
    });

    const firstSupported = results.find((r) => r.supported);
    const selected = firstSupported?.mime ?? "";
    setSelectedMime(selected);
    if (!selected) {
      addLog("error", "No supported MIME type found for MediaRecorder");
    } else {
      addLog("info", `Selected MIME: ${selected}`);
    }
  }, [addLog]);

  // -- request microphone permission ----------------------------------------
  const requestPermission = useCallback(async () => {
    setRecorderState("requesting_permission");
    addLog("info", "Requesting microphone permission...");

    try {
      // Check current permission state first
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setPermissionState(status.state);
          addLog("info", `Permission state: ${status.state}`);

          status.onchange = () => {
            setPermissionState(status.state);
            addLog("info", `Permission state changed: ${status.state}`);
          };
        } catch {
          addLog("warn", "Permissions API not available for microphone");
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
      addLog("info", "Microphone permission granted, stream acquired", {
        tracks: stream.getAudioTracks().map((t) => ({
          label: t.label,
          kind: t.kind,
          settings: t.getSettings(),
        })),
      });

      // Set up Web Audio analyser
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = ANALYSER_FFT;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      // Don't connect to destination (we don't want feedback)
      analyserRef.current = analyser;

      // Probe MIME support now that we have a user gesture context
      probeMimeSupport();

      setRecorderState("ready");
    } catch (err) {
      const error = err as Error;
      addLog("error", `Permission denied or error: ${error.message}`);
      setRecorderState("idle");
      setPermissionState("denied");
    }
  }, [addLog, probeMimeSupport]);

  // -- start recording ------------------------------------------------------
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      addLog("error", "No stream available");
      return;
    }

    fullCleanup();
    chunksRef.current = [];

    // Re-acquire stream for recording (analyser may have consumed it)
    // Actually we can re-use the same stream
    let mimeToUse = selectedMime;
    if (!mimeToUse || !MediaRecorder.isTypeSupported(mimeToUse)) {
      // fallback to browser default
      mimeToUse = "";
      addLog("warn", "Selected MIME not supported, using browser default");
    }

    const recorderOptions: MediaRecorderOptions = mimeToUse
      ? { mimeType: mimeToUse, audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 };

    try {
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstart = () => {
        addLog("info", "MediaRecorder started", {
          mimeType: recorder.mimeType,
          audioBitsPerSecond: recorder.audioBitsPerSecond,
          state: recorder.state,
        });
      };

      recorder.onstop = () => {
        addLog("info", "MediaRecorder stopped", {
          mimeType: recorder.mimeType,
          state: recorder.state,
        });
      };

      recorder.onerror = (e) => {
        addLog("error", `MediaRecorder error`, {
          error: String(e),
        });
      };

      // Request data every 250ms for smooth chunking
      recorder.start(250);
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

      // Start amplitude visualization
      startAmplitudeLoop();

      setRecorderState("recording");
      setElapsedMs(0);
    } catch (err) {
      const error = err as Error;
      addLog("error", `Failed to create MediaRecorder: ${error.message}`);
    }
  }, [selectedMime, addLog, fullCleanup, startAmplitudeLoop]);

  // -- stop recording -------------------------------------------------------
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    stopTimer();
    stopAmplitudeLoop();

    // We need to wait for the final ondataavailable + onstop
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const actualMime = blob.type;
      const url = URL.createObjectURL(blob);
      const durationMs = Date.now() - startTimeRef.current;

      const recordedClip: RecordedClip = {
        blob,
        mimeType: actualMime,
        sizeBytes: blob.size,
        durationMs,
        url,
      };

      setClip(recordedClip);
      setElapsedMs(durationMs);
      setRecorderState("stopped");

      addLog("result", "Recording completed", {
        actualMimeType: actualMime,
        requestedMimeType: recorder.mimeType,
        fileSize: blob.size,
        fileSizeHuman: formatBytes(blob.size),
        durationMs,
        durationHuman: formatTime(durationMs),
        audioBitsPerSecond: recorder.audioBitsPerSecond,
        chunks: chunksRef.current.length,
      });

      // Log the actual blob type vs what was requested
      addLog("info", `Requested MIME: ${recorder.mimeType}, Actual Blob MIME: ${actualMime}`);
    };

    recorder.requestData();
    recorder.stop();
  }, [stopTimer, stopAmplitudeLoop, addLog]);

  // -- cancel recording -----------------------------------------------------
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.onstop = () => {
        addLog("info", "Recording cancelled, data discarded", {
          discardedChunks: chunksRef.current.length,
        });
        chunksRef.current = [];
      };
      recorder.requestData();
      recorder.stop();
    }

    fullCleanup();
    setRecorderState("cancelled");
  }, [fullCleanup, addLog]);

  // -- playback controls ----------------------------------------------------
  const startPlayback = useCallback(() => {
    if (!clip) return;

    if (!playbackAudioRef.current) {
      const audio = new Audio(clip.url);
      playbackAudioRef.current = audio;

      audio.onloadedmetadata = () => {
        addLog("info", "Playback loaded", {
          audioDuration: audio.duration,
          clipDuration: clip.durationMs / 1000,
        });
      };

      audio.onerror = () => {
        const error = audio.error;
        addLog("error", "Playback error", {
          code: error?.code,
          message: error?.message,
        });
        setPlaybackState("idle");
      };

      audio.onended = () => {
        setPlaybackState("ended");
        setPlaybackCurrentMs(0);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      };

      audio.ontimeupdate = () => {
        setPlaybackCurrentMs(audio.currentTime * 1000);
      };
    }

    const audio = playbackAudioRef.current;
    if (playbackState === "playing") {
      audio.pause();
      setPlaybackState("paused");
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    audio.play().then(() => {
      setPlaybackState("playing");
    }).catch((err) => {
      addLog("error", `Playback failed: ${(err as Error).message}`);
    });
  }, [clip, playbackState, addLog]);

  const seekPlayback = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = playbackAudioRef.current;
      if (!audio) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
    },
    [],
  );

  // -- reset everything -----------------------------------------------------
  const resetAll = useCallback(() => {
    fullCleanup();
    cleanupClip();
    setRecorderState("idle");
    setPermissionState(null);
    setElapsedMs(0);
    setMimeCandidates([]);
    setSelectedMime("");
    setPlaybackState("idle");
    setPlaybackCurrentMs(0);
  }, [fullCleanup, cleanupClip]);

  // -- derived values -------------------------------------------------------
  const durationMs = clip ? clip.durationMs : elapsedMs;
  const canStartRecording = recorderState === "ready";

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        Phase 2A — Audio Recorder POC (Web)
      </h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 13 }}>
        Isolated POC. Do NOT use in production flow.
      </p>

      {/* ---- Permission / Start ---- */}
      <div
        style={{
          background: "#f5f5f5",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {recorderState === "idle" && (
            <button
              onClick={requestPermission}
              style={btnStyle("blue")}
            >
              Request Microphone
            </button>
          )}

          {recorderState === "requesting_permission" && (
            <span style={{ color: "#666" }}>Requesting permission...</span>
          )}

          {(recorderState === "ready" || recorderState === "recording" || recorderState === "stopped" || recorderState === "cancelled") && (
            <span style={{ color: "green", fontWeight: 600 }}>
              Microphone: {permissionState ?? "granted (assumed)"}
              {selectedMime && ` | Recording MIME: ${selectedMime}`}
            </span>
          )}
        </div>
      </div>

      {/* ---- Recording controls ---- */}
      {canStartRecording && recorderState !== "recording" && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={startRecording} style={btnStyle("red")}>
            Start Recording
          </button>
        </div>
      )}

      {recorderState === "recording" && (
        <div
          style={{
            background: "#fff3f3",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            border: "1px solid #ffcccc",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "red",
                animation: "pulse 1s infinite",
              }}
            />
            <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(elapsedMs)}
            </span>
          </div>

          {/* Real amplitude bars */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: 48,
              gap: 2,
              marginBottom: 12,
            }}
          >
            {amplitude.map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(4, v * 100)}%`,
                  background:
                    recorderState === "recording" ? "#ff4444" : "#ccc",
                  borderRadius: 2,
                  transition: "height 0.05s linear",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={stopRecording} style={btnStyle("green")}>
              Stop
            </button>
            <button onClick={cancelRecording} style={btnStyle("gray")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Playback ---- */}
      {(recorderState === "stopped") && clip && (
        <div
          style={{
            background: "#f0fff0",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            border: "1px solid #ccffcc",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>
            Recorded Clip
          </h3>
          <div style={{ fontSize: 12, color: "#333", marginBottom: 12 }}>
            <div>MIME: <code>{clip.mimeType}</code></div>
            <div>Size: {formatBytes(clip.sizeBytes)} ({clip.sizeBytes} bytes)</div>
            <div>Duration: {formatTime(clip.durationMs)}</div>
          </div>

          {/* Playback controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <button onClick={startPlayback} style={btnStyle("blue")}>
              {playbackState === "playing" ? "Pause" : playbackState === "ended" ? "Replay" : "Play"}
            </button>
            <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(playbackCurrentMs)} / {formatTime(clip.durationMs)}
            </span>
          </div>

          {/* Seek bar */}
          <div
            onClick={seekPlayback}
            style={{
              height: 8,
              background: "#e0e0e0",
              borderRadius: 4,
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${clip.durationMs > 0 ? (playbackCurrentMs / clip.durationMs) * 100 : 0}%`,
                background: "#1976D2",
                borderRadius: 4,
                transition: "width 0.1s linear",
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button onClick={resetAll} style={btnStyle("gray")}>
              Record New
            </button>
            <button
              onClick={() => {
                if (!clip) return;
                // Trigger download
                const a = document.createElement("a");
                const ext = clip.mimeType.includes("webm")
                  ? "webm"
                  : clip.mimeType.includes("mp4")
                    ? "m4a"
                    : clip.mimeType.includes("ogg")
                      ? "ogg"
                      : "audio";
                a.href = clip.url;
                a.download = `poc-recording-${Date.now()}.${ext}`;
                a.click();
              }}
              style={btnStyle("blue")}
            >
              Download File
            </button>
          </div>
        </div>
      )}

      {/* ---- Cancelled state ---- */}
      {recorderState === "cancelled" && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: "#999" }}>Recording cancelled.</p>
          <button onClick={resetAll} style={btnStyle("gray")}>
            Try Again
          </button>
        </div>
      )}

      {/* ---- MIME Support Table ---- */}
      {mimeCandidates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            MediaRecorder.isTypeSupported() Results
          </h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={thStyle}>MIME Type</th>
                <th style={thStyle}>Supported</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mimeCandidates.map((c) => (
                <tr key={c.mime} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={tdStyle}>
                    <code>{c.mime}</code>
                  </td>
                  <td style={tdStyle}>{c.supported ? "Yes" : "No"}</td>
                  <td style={tdStyle}>
                    {c.supported
                      ? selectedMime === c.mime
                        ? "SELECTED"
                        : ""
                      : ""}
                  </td>
                </tr>
              ))}
              <tr style={{ borderBottom: "1px solid #eee", background: "#fffff0" }}>
                <td style={tdStyle}>
                  <code>(browser default)</code>
                </td>
                <td style={tdStyle}>Always</td>
                <td style={tdStyle}>
                  {!selectedMime ? "SELECTED (fallback)" : "fallback"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Log Panel ---- */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Event Log
        </h3>
        <div
          style={{
            background: "#1a1a2e",
            color: "#e0e0e0",
            borderRadius: 8,
            padding: 12,
            maxHeight: 320,
            overflowY: "auto",
            fontSize: 11,
            fontFamily: "monospace",
            lineHeight: 1.6,
          }}
        >
          {logs.length === 0 && (
            <div style={{ color: "#666" }}>No events yet. Click "Request Microphone" to begin.</div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                color:
                  log.level === "error"
                    ? "#ff6b6b"
                    : log.level === "warn"
                      ? "#ffd93d"
                      : log.level === "result"
                        ? "#6bff6b"
                        : "#a0a0c0",
              }}
            >
              <span style={{ color: "#555" }}>[{log.ts.slice(11, 23)}]</span>{" "}
              {log.message}
              {log.data && (
                <span style={{ color: "#888" }}>
                  {" "}
                  {JSON.stringify(log.data, null, 2)}
                  {/* Don't pretty-print inline to avoid clutter */}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Keyframes for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default AudioRecorderPoc;

// ---------------------------------------------------------------------------
// Inline style helpers (avoid external deps for isolated POC)
// ---------------------------------------------------------------------------

const btnStyle = (
  color: "blue" | "red" | "green" | "gray",
): React.CSSProperties => ({
  padding: "10px 20px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  color: "#fff",
  background:
    color === "blue"
      ? "#1976D2"
      : color === "red"
        ? "#d32f2f"
        : color === "green"
          ? "#388e3c"
          : "#757575",
});

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  borderBottom: "2px solid #ccc",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 12px",
};
