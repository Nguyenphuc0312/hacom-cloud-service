import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { reactionEmojis } from "../../constants/emojis";
import type { Reaction } from "../../types";

interface ReactionBarProps {
  reactions?: Reaction[];
  /** Current authenticated user ID — used to highlight user's own reactions */
  currentUserId?: string;
  onReact: (emoji: string) => void;
  showPicker?: boolean;
  onTogglePicker?: () => void;
  className?: string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  reactions = [],
  currentUserId,
  onReact,
  showPicker = false,
  onTogglePicker,
  className,
}) => {
  const { t } = useTranslation();
  const hasReactions = reactions.length > 0;
  const canTogglePicker = Boolean(onTogglePicker);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Set of emoji codes that the current user has reacted to
  const myEmojiSet = React.useMemo(() => {
    if (!currentUserId) return new Set<string>();
    return new Set(
      reactions
        .filter((r) => r.userIds?.includes(currentUserId))
        .map((r) => r.emoji),
    );
  }, [reactions, currentUserId]);

  // Close picker when clicking outside
  React.useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onTogglePicker?.();
      }
    };

    document.addEventListener("click", handleClickOutside, true);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [showPicker, onTogglePicker]);

  const handleEmojiClick = React.useCallback(
    (emoji: string) => {
      onReact(emoji);
      onTogglePicker?.();
    },
    [onReact, onTogglePicker],
  );

  return (
    <div ref={containerRef} className={clsx("flex flex-col gap-0.5", className)}>
      {showPicker && (
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1.5 shadow-elev2 animate-bounce-in">
          {reactionEmojis.map((emoji) => {
            const isOwn = myEmojiSet.has(emoji);
            return (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[15px]",
                  "transition-all duration-100",
                  "hover:scale-125 hover:bg-surface-overlay active:scale-95",
                  // Highlight the emoji if current user already reacted
                  isOwn && "ring-2 ring-primary ring-offset-1 dark:ring-offset-[#1a1c2e]",
                )}
                aria-label={t("chat:reaction.reactWith", { emoji })}
                aria-pressed={isOwn}
              >
                <span>{emoji}</span>
              </button>
            );
          })}
        </div>
      )}

      {(hasReactions || (canTogglePicker && showPicker)) && (
        <div className="flex flex-wrap items-center gap-1">
          {reactions.map((reaction) => {
            const isOwn = currentUserId
              ? reaction.userIds?.includes(currentUserId)
              : false;

            return (
              <button
                key={reaction.emoji}
                onClick={() => handleEmojiClick(reaction.emoji)}
                className={clsx(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]",
                  "transition-all duration-100 hover:scale-105 hover:shadow-xs active:scale-100",
                  // Active state when current user has reacted
                  isOwn
                    ? "border-primary/40 bg-primary/8 text-primary font-medium"
                    : "border-border bg-surface hover:bg-surface-overlay",
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span
                    className={clsx(
                      "font-medium",
                      isOwn ? "text-primary" : "text-text-secondary",
                    )}
                  >
                    {reaction.count}
                  </span>
                )}
              </button>
            );
          })}

          {onTogglePicker && !showPicker && (
            <button
              onClick={onTogglePicker}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
              aria-label={t("chat:reaction.add")}
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Standalone trigger button when no reactions and picker is not open */}
      {!hasReactions && canTogglePicker && !showPicker && (
        <button
          onClick={onTogglePicker}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          aria-label={t("chat:reaction.add")}
        >
          +
        </button>
      )}
    </div>
  );
};

export default ReactionBar;
