/**
 * @fileoverview FileProgress - Progress bar component for file upload/download.
 *
 * Features:
 * - 3px height, rounded corners
 * - Animated fill
 * - Shows percentage when loading
 */

import React from "react";
import clsx from "clsx";

interface FileProgressProps {
  progress: number; // 0-100
  isLoading: boolean;
  showPercentage?: boolean;
  className?: string;
}

export const FileProgress: React.FC<FileProgressProps> = ({
  progress,
  isLoading,
  showPercentage = true,
  className,
}) => {
  if (!isLoading) {
    return null;
  }

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/10 dark:bg-white/10">
        {/* Track */}
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundColor: "currentColor" }}
        />

        {/* Fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[#C41E3A] to-[#FFC857] transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {showPercentage && (
        <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
          {Math.round(clampedProgress)}%
        </span>
      )}
    </div>
  );
};

/**
 * Circular progress variant for more compact displays
 */
interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 20,
  strokeWidth = 2,
  className,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className={clsx("transform -rotate-90", className)}
      aria-label={`${Math.round(progress)}% complete`}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-20"
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--color-primary))"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300 ease-out"
      />
    </svg>
  );
};

export default FileProgress;
