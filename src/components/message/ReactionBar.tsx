import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Reaction } from "../../types";
import { reactionEmojis } from "../../data/mockData";

interface ReactionBarProps {
  reactions?: Reaction[];
  onReact: (emoji: string) => void;
  showPicker?: boolean;
  onTogglePicker?: () => void;
  className?: string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  reactions = [],
  onReact,
  showPicker = false,
  onTogglePicker,
  className,
}) => {
  const { t } = useTranslation();
  const hasReactions = reactions.length > 0;

  return (
    <div className={clsx("flex flex-col gap-0.5", className)}>
      {showPicker && (
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1.5 shadow-elev2 animate-bounce-in">
          {reactionEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition-micro hover:scale-110 hover:bg-surface-overlay active:scale-95"
              aria-label={t("chat:reaction.reactWith", { emoji })}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      )}

      {hasReactions && (
        <div className="flex flex-wrap items-center gap-1">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => onReact(reaction.emoji)}
              className={clsx(
                "flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[11px]",
                "transition-micro hover:scale-105 hover:bg-surface-overlay hover:shadow-xs active:scale-100",
              )}
            >
              <span>{reaction.emoji}</span>
              {reaction.count > 1 && (
                <span className="font-medium text-text-secondary">
                  {reaction.count}
                </span>
              )}
            </button>
          ))}

          {onTogglePicker && (
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
    </div>
  );
};

export default ReactionBar;
