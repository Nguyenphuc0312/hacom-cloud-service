import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { QUICK_REACTIONS } from "../../constants/emojis";
import { MoreReactionPicker } from "./MoreReactionPicker";
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
  const [showMore, setShowMore] = React.useState(false);

  // Set of emoji codes that the current user has reacted to
  const myEmojiSet = React.useMemo(() => {
    if (!currentUserId) return new Set<string>();
    return new Set(
      reactions
        .filter((r) => r.userIds?.includes(currentUserId))
        .map((r) => r.emoji),
    );
  }, [reactions, currentUserId]);

  // Close picker when clicking outside — but NOT when clicking inside the more picker
  React.useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking inside our own picker elements
      if (containerRef.current && !containerRef.current.contains(target)) {
        onTogglePicker?.();
        setShowMore(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onTogglePicker?.();
        setShowMore(false);
      }
    };

    document.addEventListener("click", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPicker, onTogglePicker]);

  // When picker closes, also reset showMore
  React.useEffect(() => {
    if (!showPicker) setShowMore(false);
  }, [showPicker]);

  const handleEmojiClick = React.useCallback(
    (emoji: string) => {
      onReact(emoji);
      onTogglePicker?.();
      setShowMore(false);
    },
    [onReact, onTogglePicker],
  );

  return (
    <div ref={containerRef} className={clsx("flex flex-col gap-0.5", className)}>
      {showPicker && (
        <>
          {/* Quick reaction pill — Zalo-style: only 6 emojis + "+" button */}
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1.5 shadow-elev2 animate-bounce-in">
            {QUICK_REACTIONS.map((emoji) => {
              const isOwn = myEmojiSet.has(emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[15px]",
                    "transition-all duration-100",
                    "hover:scale-125 hover:bg-surface-hover active:scale-95",
                    isOwn && "ring-2 ring-primary ring-offset-1 dark:ring-offset-[hsl(var(--ring-offset))]",
                  )}
                  aria-label={t("chat:reaction.reactWith", { emoji })}
                  aria-pressed={isOwn}
                >
                  <span>{emoji}</span>
                </button>
              );
            })}
            {/* "+" toggles the extended picker; when more is open, show "×" */}
            <button
              onClick={() => setShowMore((v) => !v)}
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground",
                "transition-all duration-100 hover:scale-110 hover:bg-surface-hover active:scale-95",
              )}
              aria-label={showMore ? t("common:actions.close") : t("chat:reaction.moreReactions")}
              aria-expanded={showMore}
            >
              {showMore ? (
                <X size={13} strokeWidth={2} />
              ) : (
                <Plus size={13} strokeWidth={2.2} />
              )}
            </button>
          </div>

          {/* MoreReactionPicker — floating panel below the pill, never a vertical column */}
          {showMore && (
            <div className="mt-1">
              <MoreReactionPicker
                onSelect={handleEmojiClick}
                onClose={() => setShowMore(false)}
                isOpen={showMore}
              />
            </div>
          )}
        </>
      )}

      {(hasReactions || (canTogglePicker && showPicker)) && (
        <div className="flex flex-wrap items-center gap-1 max-w-[var(--chat-bubble-max)]">
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
                  isOwn
                    ? "border-primary/40 bg-primary/8 text-primary font-medium"
                    : "border-border bg-surface hover:bg-surface-hover",
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
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
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
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("chat:reaction.add")}
        >
          +
        </button>
      )}
    </div>
  );
};

export default ReactionBar;
