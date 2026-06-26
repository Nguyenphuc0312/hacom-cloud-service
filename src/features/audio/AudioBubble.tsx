/**
 * Phase 2C — AudioBubble (Web)
 *
 * Renders an audio message bubble with:
 *  - Play/pause button
 *  - Real waveform or progress bar
 *  - Duration display
 *  - Current position
 *  - Loading / uploading / failed states
 *  - Lazy URL resolution (don't download until user wants to play)
 *
 * Uses GlobalAudioPlayer for coordinated playback.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Attachment } from "../../types";
import {
  useGlobalAudioPlayer,
  useIsMessagePlaying,
  usePlaybackInfo,
} from "./GlobalAudioPlayer";
import { AUDIO_DURATION_LIMITS } from "./AudioRecorderState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AudioBubbleProps {
  messageId: string;
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  /** Message send status for uploading/failed states */
  sendStatus?: "uploading" | "sending" | "sent" | "failed";
  /** Retry callback */
  onRetry?: () => void;
  /** Resolve playback URL (lazy) */
  resolvePlaybackUrl: (attachment: Attachment) => Promise<string | null>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDuration = (ms: number): string => {
  const totalS = Math.round(ms / 1000);
  const mins = Math.floor(totalS / 60);
  const secs = totalS % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Waveform (client-side generated from real data or placeholder)
// ---------------------------------------------------------------------------

const FakeWaveform: React.FC<{ progress: number; isOwn: boolean; bars?: number }> = ({
  progress,
  isOwn,
  bars = 30,
}) => {
  // Deterministic pseudo-waveform based on messageId would be better,
  // but for MVP we use a simple static shape until server provides waveform.
  const heights = Array.from({ length: bars }, (_, i) => {
    const t = i / bars;
    return 0.2 + 0.6 * Math.sin(t * Math.PI * 3) * Math.cos(t * Math.PI * 5) + 0.2;
  });

  return (
    <div className="flex items-end gap-[2px] h-8">
      {heights.map((h, i) => {
        const barProgress = (i / bars) * 100;
        const played = barProgress <= progress;
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px] transition-colors"
            style={{
              height: `${Math.max(8, h * 100)}%`,
              backgroundColor: played
                ? isOwn
                  ? "var(--chat-bubble-sent-text)"
                  : "#1976D2"
                : isOwn
                  ? "rgba(var(--chat-bubble-sent-text-rgb), 0.35)"
                  : "rgba(0,0,0,0.15)",
            }}
          />
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AudioBubble: React.FC<AudioBubbleProps> = ({
  messageId,
  conversationId: _conversationId,
  attachment,
  isOwn,
  sendStatus,
  onRetry,
  resolvePlaybackUrl,
  className,
}) => {
  const isPlaying = useIsMessagePlaying(messageId);
  const playback = usePlaybackInfo(messageId);
  const { play, pause, resume, seek, setCurrentTime, setDuration, setError } =
    useGlobalAudioPlayer();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const urlResolvedRef = useRef(false);

  const durationMs = (attachment.duration ?? 0) * 1000 || AUDIO_DURATION_LIMITS.MIN_DURATION_MS;

  // ---- Lazy URL resolution ----
  const ensureUrl = useCallback(async () => {
    if (urlResolvedRef.current && resolvedUrl) return resolvedUrl;
    if (isLoadingUrl) return null;

    setIsLoadingUrl(true);
    setUrlError(false);
    try {
      const url = await resolvePlaybackUrl(attachment);
      if (url) {
        setResolvedUrl(url);
        urlResolvedRef.current = true;
        return url;
      }
      setUrlError(true);
      return null;
    } catch {
      setUrlError(true);
      return null;
    } finally {
      setIsLoadingUrl(false);
    }
  }, [attachment, resolvePlaybackUrl, resolvedUrl, isLoadingUrl]);

  // ---- Play/pause toggle ----
  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      pause();
      audioRef.current?.pause();
      return;
    }

    // Lazy load URL if not yet resolved
    let url = resolvedUrl;
    if (!url) {
      url = await ensureUrl();
      if (!url) return;
    }

    // Create or reuse audio element
    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.preload = "metadata";
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setDuration(audio.duration * 1000);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime * 1000);
      };

      audio.onended = () => {
        useGlobalAudioPlayer.getState().stop();
      };

      audio.onerror = () => {
        const error = audio.error;
        if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          setError("CODEC_UNSUPPORTED");
        } else if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
          // Try refreshing URL
          setUrlError(true);
          urlResolvedRef.current = false;
          setResolvedUrl(null);
        }
      };
    } else {
      audioRef.current.src = url;
    }

    play(messageId, url, durationMs);

    try {
      await audioRef.current.play();
      useGlobalAudioPlayer.getState().resume();
    } catch (err) {
      setError("PLAYBACK_URL_EXPIRED");
    }
  }, [
    isPlaying,
    resolvedUrl,
    messageId,
    durationMs,
    play,
    pause,
    resume,
    setDuration,
    setCurrentTime,
    setError,
    ensureUrl,
  ]);

  // ---- Seek ----
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const timeMs = ratio * durationMs;
      if (audioRef.current) {
        audioRef.current.currentTime = timeMs / 1000;
      }
      seek(timeMs);
    },
    [durationMs, seek],
  );

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  // ---- Progress (for own message's current position) ----
  const progress =
    playback.isActive && durationMs > 0
      ? (playback.currentTimeMs / durationMs) * 100
      : 0;

  // ---- Send status overlay ----
  if (sendStatus === "uploading" || sendStatus === "sending") {
    return (
      <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/50", className)}>
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-muted">
          {sendStatus === "uploading" ? "Uploading audio..." : "Sending..."}
        </span>
      </div>
    );
  }

  if (sendStatus === "failed" && onRetry) {
    return (
      <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-lg bg-error/5", className)}>
        <span className="text-xs text-error">Failed to send</span>
        <button onClick={onRetry} className="text-xs text-primary font-medium">
          Retry
        </button>
      </div>
    );
  }

  // ---- Normal playback bubble ----
  return (
    <div className={clsx("flex items-center gap-3 min-w-[160px] max-w-[280px]", className)}>
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={isLoadingUrl}
        className={clsx(
          "flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isOwn
            ? "bg-[hsl(var(--chat-bubble-sent-text))/0.2] text-[hsl(var(--chat-bubble-sent-text))]"
            : "bg-primary text-white",
        )}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isLoadingUrl ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <PauseIcon className="w-5 h-5" />
        ) : (
          <PlayIcon className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Waveform + Time */}
      <div className="flex-1 min-w-0">
        <div
          className="relative flex items-end h-8 gap-[2px] cursor-pointer"
          onClick={handleSeek}
          role="slider"
          aria-label="Seek"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <FakeWaveform progress={progress} isOwn={isOwn} />
        </div>
        <span
          className={clsx(
            "text-xs mt-0.5 block",
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.6]" : "text-text-muted",
          )}
        >
          {urlError
            ? "⚠ Playback error"
            : playback.isActive
              ? `${formatDuration(playback.currentTimeMs)} / ${formatDuration(durationMs)}`
              : formatDuration(durationMs)}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

export default AudioBubble;
