/**
 * @fileoverview StickerGrid - Grid display of stickers.
 *
 * Features:
 * - 4 columns on mobile, 5 columns on desktop
 * - 8px gap between items
 * - Hover scale animation (1.1x)
 * - HD badge for high-quality stickers
 */

import React, { useCallback, useState } from "react";
import clsx from "clsx";
import type { Sticker } from "./StickerPicker";

interface StickerGridProps {
  stickers: Sticker[];
  onSelect: (sticker: Sticker) => void;
  className?: string;
}

export const StickerGrid: React.FC<StickerGridProps> = ({
  stickers,
  onSelect,
  className,
}) => {
  if (stickers.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <span className="text-sm">No stickers</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "grid grid-cols-4 gap-2 sm:grid-cols-5",
        className,
      )}
    >
      {stickers.map((sticker) => (
        <StickerGridItem
          key={sticker.id}
          sticker={sticker}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

interface StickerGridItemProps {
  sticker: Sticker;
  onSelect: (sticker: Sticker) => void;
}

const StickerGridItem: React.FC<StickerGridItemProps> = ({
  sticker,
  onSelect,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = useCallback(() => {
    onSelect(sticker);
  }, [onSelect, sticker]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(false);
    setError(true);
  }, []);

  // Use emoji fallback for demo stickers without images
  const hasImage = sticker.imageUrl && sticker.imageUrl.length > 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={clsx(
        "group/sticker relative aspect-square overflow-hidden rounded-lg",
        "transition-transform duration-150 hover:scale-110 active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC857]/30",
      )}
      aria-label={sticker.name}
      title={sticker.name}
    >
      {/* Emoji fallback */}
      {!hasImage && (
        <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-3xl">
          {getEmojiForSticker(sticker.name)}
        </div>
      )}

      {/* Image sticker */}
      {hasImage && (
        <>
          {/* Loading skeleton */}
          {!loaded && !error && (
            <div className="absolute inset-0 animate-pulse bg-surface-overlay" />
          )}

          {/* Error state */}
          {error && (
            <div className="flex h-full w-full items-center justify-center bg-surface-overlay text-2xl">
              🖼️
            </div>
          )}

          {/* Image */}
          <img
            src={sticker.imageUrl}
            alt={sticker.name}
            loading="lazy"
            decoding="async"
            className={clsx(
              "h-full w-full object-contain transition-opacity",
              loaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={handleLoad}
            onError={handleError}
          />
        </>
      )}

      {/* HD badge */}
      {sticker.isHd && (
        <div className="absolute left-0.5 top-0.5 rounded bg-black/50 px-1 py-0.5 text-[9px] font-semibold text-white">
          HD
        </div>
      )}

      {/* Sticker name tooltip on hover */}
      <div className={clsx(
        "absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[10px] text-white",
        "opacity-0 transition-opacity group-hover/sticker:opacity-100",
        "truncate text-center",
      )}>
        {sticker.name}
      </div>
    </button>
  );
};

/**
 * Get emoji for demo stickers
 */
function getEmojiForSticker(name: string): string {
  const emojiMap: Record<string, string> = {
    // Emoji pack
    "laugh": "😂",
    "sleepy": "😴",
    "sad": "😭",
    "angry": "😤",
    "love": "❤️",
    "wow": "😮",
    // Animals pack
    "cat": "🐱",
    "dog": "🐶",
    "bunny": "🐰",
    "panda": "🐼",
    // Common
    "happy": "😊",
    "smile": "😄",
    "cry": "😢",
    "cool": "😎",
    "thinking": "🤔",
    "thumbsup": "👍",
    "fire": "🔥",
    "heart": "❤️",
    "star": "⭐",
    "sun": "🌅",
    "wave": "👋",
  };

  return emojiMap[name.toLowerCase()] || "😊";
}

export default StickerGrid;
