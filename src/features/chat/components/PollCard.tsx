import React from "react";
import clsx from "clsx";

export interface PollCardOption {
  id: string;
  label: string;
  votes: number;
  percent: number;
  isSelected?: boolean;
}

export interface PollCardProps {
  title: string;
  description?: string;
  totalVotes: number;
  options: PollCardOption[];
  allowMultiple?: boolean;
  closesAtLabel?: string;
  onVote?: (optionId: string) => void;
  onViewDetails?: () => void;
  onRevote?: () => void;
  className?: string;
}

export const PollCard: React.FC<PollCardProps> = ({
  title,
  description,
  totalVotes,
  options,
  allowMultiple = false,
  closesAtLabel,
  onVote,
  onViewDetails,
  onRevote,
  className,
}) => {
  return (
    <article
      className={clsx(
        "w-[min(26rem,100%)] rounded-lg border border-border/80 bg-surface p-4 shadow-xs",
        className,
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-normal text-primary">
        Bình chọn nhóm
      </p>
      <h3 className="mt-1 text-base font-semibold leading-6 text-text-primary">
        {title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        {description ||
          `${allowMultiple ? "Chọn nhiều đáp án" : "Chọn 1 đáp án"}${
            closesAtLabel ? `. Đóng bình chọn vào ${closesAtLabel}` : ""
          }`}
      </p>

      <div className="mt-4 space-y-3">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onVote?.(option.id)}
            className={clsx(
              "w-full rounded-lg border p-3 text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
              option.isSelected
                ? "border-primary/50 bg-primary/5"
                : "border-border/70 bg-surface hover:bg-surface-hover",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                {option.label}
              </span>
              <span className="text-xs font-semibold tabular-nums text-text-secondary">
                {option.percent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, option.percent))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {option.votes.toLocaleString("vi-VN")} lượt chọn
            </p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs">
        <span className="text-text-muted">
          Tổng: {totalVotes.toLocaleString("vi-VN")} người đã bình chọn
        </span>
        <div className="flex shrink-0 items-center gap-3 font-semibold">
          <button
            type="button"
            onClick={onViewDetails}
            className="text-primary hover:underline"
          >
            Xem chi tiết
          </button>
          <button
            type="button"
            onClick={onRevote}
            className="text-primary hover:underline"
          >
            Bình chọn lại
          </button>
        </div>
      </div>
    </article>
  );
};

export default PollCard;
