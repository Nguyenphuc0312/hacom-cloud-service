import React from "react";
import clsx from "clsx";
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
  const hasReactions = reactions.length > 0;

  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {/* Reaction picker */}
      {showPicker && (
        <div className="flex items-center gap-1 p-1.5 rounded-full bg-white shadow-lg border border-gray-100 animate-bounce-in">
          {reactionEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all hover:scale-125"
              aria-label={`React with ${emoji}`}
            >
              <span className="text-lg">{emoji}</span>
            </button>
          ))}
        </div>
      )}

      {/* Existing reactions */}
      {hasReactions && (
        <div className="flex flex-wrap items-center gap-1">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => onReact(reaction.emoji)}
              className={clsx(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                "bg-white border border-gray-200 hover:bg-gray-50",
                "transition-all hover:scale-105 animate-reaction-pop",
              )}
            >
              <span>{reaction.emoji}</span>
              {reaction.count > 1 && (
                <span className="text-gray-600 font-medium">
                  {reaction.count}
                </span>
              )}
            </button>
          ))}

          {/* Add reaction button */}
          {onTogglePicker && (
            <button
              onClick={onTogglePicker}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-400 text-sm"
              aria-label="Add reaction"
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
