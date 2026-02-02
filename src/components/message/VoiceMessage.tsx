import React, { useState, useRef, useMemo } from "react";
import clsx from "clsx";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";
import type { Attachment } from "../../types";
import { formatDuration } from "../../utils/formatTime";

// Seeded random number generator for consistent waveform
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

interface VoiceMessageProps {
  attachment: Attachment;
  isOwn: boolean;
  className?: string;
}

export const VoiceMessage: React.FC<VoiceMessageProps> = ({
  attachment,
  isOwn,
  className,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  // Generate stable waveform bars using seeded random
  const waveformBars = useMemo(() => {
    const seed = attachment.url?.length ?? 0;
    return Array.from(
      { length: 30 },
      (_, i) => seededRandom(seed + i) * 60 + 20,
    );
  }, [attachment.url]);

  return (
    <div className={clsx("flex items-center gap-3 min-w-[200px]", className)}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={attachment.url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={clsx(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
          isOwn
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-telegram-primary hover:bg-telegram-secondary text-white",
        )}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <PauseIcon className="w-5 h-5" />
        ) : (
          <PlayIcon className="w-5 h-5 ml-0.5" />
        )}
      </button>

      {/* Waveform */}
      <div className="flex-1">
        <div
          className="relative h-8 flex items-center gap-0.5 cursor-pointer"
          onClick={handleSeek}
          role="slider"
          aria-label="Audio progress"
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
                      ? "bg-white"
                      : "bg-telegram-primary"
                    : isOwn
                      ? "bg-white/40"
                      : "bg-gray-300",
                )}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        {/* Duration */}
        <p
          className={clsx(
            "text-xs mt-1",
            isOwn ? "text-white/70" : "text-gray-500",
          )}
        >
          {isPlaying || currentTime > 0
            ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
            : formatDuration(duration)}
        </p>
      </div>
    </div>
  );
};

export default VoiceMessage;
