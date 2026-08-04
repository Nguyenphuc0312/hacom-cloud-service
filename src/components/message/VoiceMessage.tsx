import React, { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";
import type { Attachment } from "../../types";
import { formatDuration } from "../../utils/formatTime";
import { useAttachmentDownloadUrl } from "../../hooks";

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

interface VoiceMessageProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  className?: string;
}

export const VoiceMessage: React.FC<VoiceMessageProps> = ({
  conversationId,
  attachment,
  isOwn,
  className,
}) => {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const refreshedSourceRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { url: resolvedUrl, resolveUrl, isLoading } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: false },
  );

  const duration = attachment.duration || 0;

  const togglePlay = async () => {
    const nextAudio = audioRef.current;
    if (!nextAudio) return;

    if (!resolvedUrl) {
      const nextUrl = await resolveUrl();
      if (!nextUrl || !audioRef.current) {
        return;
      }
    }

    if (isPlaying) {
      nextAudio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await nextAudio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration || duration;
      setCurrentTime(current);
      setProgress((current / total) * 100);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const handleAudioError = () => {
    const activeSource = resolvedUrl || null;
    if (!activeSource) return;

    if (refreshedSourceRef.current !== activeSource) {
      refreshedSourceRef.current = activeSource;
      void resolveUrl(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * (audioRef.current.duration || duration);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setProgress(percentage * 100);
    }
  };

  const waveformBars = useMemo(() => {
    const seed = resolvedUrl?.length ?? attachment.id.length ?? 0;
    // Dense, fine bars (Zalo/Telegram feel); min floor keeps quiet parts visible.
    return Array.from(
      { length: 28 },
      (_, i) => seededRandom(seed + i) * 68 + 32,
    );
  }, [attachment.id, resolvedUrl]);

  return (
    <div className={clsx("flex min-w-[176px] max-w-[300px] items-center gap-2.5", className)}>
      <audio
        ref={audioRef}
        src={resolvedUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleAudioError}
        preload="metadata"
      />

      <button
        onClick={togglePlay}
        disabled={isLoading}
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1565C0] text-white shadow-sm transition-colors hover:bg-[#1976D2] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
        )}
        aria-label={isPlaying ? t("chat:voice.pause") : t("chat:voice.play")}
      >
        {isPlaying ? (
          <PauseIcon className="h-[18px] w-[18px]" />
        ) : (
          <PlayIcon className="ml-0.5 h-[18px] w-[18px]" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className="relative flex h-7 cursor-pointer items-center gap-[2px]"
          onClick={handleSeek}
          role="slider"
          aria-label={t("chat:voice.progress")}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {waveformBars.map((height, index) => {
            const barProgress = (index / waveformBars.length) * 100;
            const isPlayed = barProgress <= progress;

            return (
              <div
                key={index}
                className={clsx(
                  "min-w-[2px] flex-1 rounded-full transition-colors duration-150",
                  isPlaying && "voice-bar-playing",
                  isPlayed
                    ? "bg-[#1565C0]"
                    : isOwn
                      ? "bg-[#1565C0]/25"
                      : "bg-[#1565C0]/20",
                )}
                style={{
                  height: `${height}%`,
                  animationDelay: isPlaying ? `${-(index * 70)}ms` : undefined,
                }}
              />
            );
          })}
        </div>

        <span
          className={clsx(
            "text-[11px] font-medium tabular-nums leading-none",
            isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.6]" : "text-text-muted",
          )}
        >
          {isPlaying || currentTime > 0
            ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
            : formatDuration(duration)}
        </span>
      </div>
    </div>
  );
};

export default VoiceMessage;
