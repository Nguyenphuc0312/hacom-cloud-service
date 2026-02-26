import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [didRefreshOnError, setDidRefreshOnError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { url: resolvedUrl, resolveUrl } = useAttachmentDownloadUrl(
    conversationId,
    attachment,
    { autoResolve: true },
  );

  useEffect(() => {
    setDidRefreshOnError(false);
  }, [resolvedUrl]);

  const duration = attachment.duration || 0;

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
    if (!didRefreshOnError) {
      setDidRefreshOnError(true);
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
    return Array.from(
      { length: 30 },
      (_, i) => seededRandom(seed + i) * 60 + 20,
    );
  }, [attachment.id, resolvedUrl]);

  return (
    <div className={clsx("flex min-w-voice-message-min items-center gap-3", className)}>
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
        disabled={!resolvedUrl}
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          isOwn
            ? "bg-surface/25 text-text-inverse hover:bg-surface/35"
            : "bg-primary text-text-inverse hover:bg-secondary",
        )}
        aria-label={isPlaying ? t("chat:voice.pause") : t("chat:voice.play")}
      >
        {isPlaying ? (
          <PauseIcon className="h-5 w-5" />
        ) : (
          <PlayIcon className="ml-1 h-5 w-5" />
        )}
      </button>

      <div className="flex-1">
        <div
          className="relative flex h-8 cursor-pointer items-center gap-1"
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
                  "w-1 rounded-full transition-colors",
                  isPlayed
                    ? isOwn
                      ? "bg-text-inverse"
                      : "bg-primary"
                    : isOwn
                      ? "bg-text-inverse/45"
                      : "bg-border-strong/45",
                )}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        <p className={clsx("mt-1 text-xs", isOwn ? "text-text-inverse/70" : "text-text-muted")}>
          {isPlaying || currentTime > 0
            ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
            : formatDuration(duration)}
        </p>
      </div>
    </div>
  );
};

export default VoiceMessage;


