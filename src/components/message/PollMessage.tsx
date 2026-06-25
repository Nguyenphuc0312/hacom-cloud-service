import React from "react";
import {
  ChartBarIcon,
  CheckIcon,
  LockClosedIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";

interface PollMessageProps {
  poll: PollInfo;
  isOwn: boolean;
  currentUserId?: string;
  /** Phase 2: wire to real API */
  onVote?: (pollId: string, optionIds: string[]) => void;
  onClose?: (pollId: string) => void;
}

export const PollMessage: React.FC<PollMessageProps> = ({
  poll,
  isOwn,
  currentUserId,
  onVote,
  onClose,
}) => {
  // ponytail: local voted state — Phase 2 replaces with server state from PollInfo.options[].voterIds
  const myInitialVotes = React.useMemo(
    () =>
      new Set(
        poll.options
          .filter((o) => o.voterIds?.includes(currentUserId ?? ""))
          .map((o) => o.id),
      ),
    [poll.options, currentUserId],
  );
  const [voted, setVoted] = React.useState<Set<string>>(myInitialVotes);
  const [localVotes, setLocalVotes] = React.useState<Record<string, number>>(
    () => Object.fromEntries(poll.options.map((o) => [o.id, o.votes])),
  );

  const hasVoted = voted.size > 0;
  const isClosed = poll.isClosed;
  const showResults = hasVoted || isClosed;

  const totalVotes =
    Object.values(localVotes).reduce((s, v) => s + v, 0) || poll.totalVotes;
  const maxVotes = Math.max(...Object.values(localVotes), 1);

  const handleSelect = (optionId: string) => {
    if (isClosed || !currentUserId) return;

    let nextVoted: Set<string>;

    if (poll.allowMultiple) {
      nextVoted = new Set(voted);
      if (nextVoted.has(optionId)) {
        nextVoted.delete(optionId);
        setLocalVotes((prev) => ({
          ...prev,
          [optionId]: Math.max(0, (prev[optionId] ?? 0) - 1),
        }));
      } else {
        nextVoted.add(optionId);
        setLocalVotes((prev) => ({
          ...prev,
          [optionId]: (prev[optionId] ?? 0) + 1,
        }));
      }
    } else {
      const prev = voted.has(optionId) ? null : optionId;
      // remove old vote count
      voted.forEach((id) => {
        setLocalVotes((lv) => ({ ...lv, [id]: Math.max(0, (lv[id] ?? 0) - 1) }));
      });
      nextVoted = prev ? new Set([prev]) : new Set();
      if (prev) {
        setLocalVotes((lv) => ({ ...lv, [prev]: (lv[prev] ?? 0) + 1 }));
      }
    }

    setVoted(nextVoted);
    if (onVote) onVote(poll.id, Array.from(nextVoted));
  };

  const baseCard = clsx(
    "w-full min-w-[220px] max-w-[320px] overflow-hidden rounded-2xl",
    isOwn
      ? "border border-white/15 bg-white/10 backdrop-blur-sm"
      : "border border-border bg-surface shadow-sm",
  );

  return (
    <div className={baseCard}>
      {/* Header */}
      <div
        className={clsx(
          "flex items-center gap-2 px-4 py-3",
          isOwn ? "border-b border-white/10" : "border-b border-border/60",
        )}
      >
        <ChartBarIcon
          className={clsx(
            "h-4 w-4 shrink-0",
            isOwn ? "text-white/70" : "text-[#1565C0]",
          )}
        />
        <span
          className={clsx(
            "flex-1 text-xs font-semibold uppercase tracking-wider",
            isOwn ? "text-white/70" : "text-text-muted",
          )}
        >
          Bình chọn
        </span>
        {poll.anonymous && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              isOwn
                ? "bg-white/10 text-white/60"
                : "bg-surface-overlay text-text-muted",
            )}
          >
            <UserIcon className="h-3 w-3" />
            Ẩn danh
          </span>
        )}
        {isClosed && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              isOwn
                ? "bg-white/10 text-white/60"
                : "bg-surface-overlay text-text-muted",
            )}
          >
            <LockClosedIcon className="h-3 w-3" />
            Đã kết thúc
          </span>
        )}
      </div>

      {/* Question */}
      <div className="px-4 pt-3 pb-2">
        <p
          className={clsx(
            "text-sm font-semibold leading-snug",
            isOwn ? "text-white" : "text-text-primary",
          )}
        >
          {poll.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2 px-4 pb-3">
        {poll.options.map((option) => {
          const votes = localVotes[option.id] ?? option.votes;
          const pct = totalVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0;
          const isVoted = voted.has(option.id);
          const isWinner =
            showResults &&
            votes === maxVotes &&
            totalVotes > 0;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option.id)}
              disabled={isClosed || !currentUserId}
              className={clsx(
                "relative w-full overflow-hidden rounded-xl border text-left transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/40",
                isClosed || !currentUserId
                  ? "cursor-default"
                  : "cursor-pointer",
                isOwn
                  ? isVoted
                    ? "border-white/40 bg-white/20"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                  : isVoted
                    ? "border-[#1976D2]/50 bg-[#DBEAFE]/40"
                    : "border-border/60 bg-surface-overlay/30 hover:bg-surface-overlay/70",
              )}
            >
              {/* Progress bar */}
              {showResults && (
                <div
                  className={clsx(
                    "absolute inset-y-0 left-0 rounded-xl transition-all duration-500",
                    isOwn
                      ? "bg-white/10"
                      : isWinner
                        ? "bg-[#1565C0]/12"
                        : "bg-[#1976D2]/6",
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}

              <div className="relative flex items-center gap-2 px-3 py-2.5">
                {/* Check indicator */}
                <div
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    poll.allowMultiple ? "rounded-md" : "rounded-full",
                    isOwn
                      ? isVoted
                        ? "border-white bg-white/90"
                        : "border-white/30"
                      : isVoted
                        ? "border-[#1565C0] bg-[#1565C0]"
                        : "border-border",
                  )}
                >
                  {isVoted && (
                    <CheckIcon
                      className={clsx(
                        "h-3 w-3",
                        isOwn ? "text-[#1565C0]" : "text-white",
                      )}
                    />
                  )}
                </div>

                {/* Option text */}
                <span
                  className={clsx(
                    "flex-1 text-sm leading-snug",
                    isOwn
                      ? isVoted
                        ? "font-semibold text-white"
                        : "text-white/85"
                      : isVoted
                        ? "font-semibold text-text-primary"
                        : "text-text-secondary",
                  )}
                >
                  {option.text}
                </span>

                {/* Vote count / percent */}
                {showResults && (
                  <div className="ml-1 flex shrink-0 flex-col items-end">
                    <span
                      className={clsx(
                        "text-xs font-semibold tabular-nums",
                        isOwn
                          ? isWinner
                            ? "text-white"
                            : "text-white/70"
                          : isWinner
                            ? "text-[#1565C0]"
                            : "text-text-muted",
                      )}
                    >
                      {pct}%
                    </span>
                    <span
                      className={clsx(
                        "text-[10px] tabular-nums",
                        isOwn ? "text-white/50" : "text-text-muted",
                      )}
                    >
                      {votes}
                    </span>
                  </div>
                )}

                {isWinner && (
                  <CheckCircleIcon
                    className={clsx(
                      "ml-0.5 h-3.5 w-3.5 shrink-0",
                      isOwn ? "text-white/80" : "text-[#1565C0]",
                    )}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className={clsx(
          "flex items-center justify-between gap-2 border-t px-4 py-2.5",
          isOwn ? "border-white/10" : "border-border/60",
        )}
      >
        <span
          className={clsx(
            "text-xs",
            isOwn ? "text-white/55" : "text-text-muted",
          )}
        >
          {totalVotes === 0
            ? "Chưa có lượt bình chọn"
            : `${totalVotes} lượt bình chọn`}
          {poll.endsAt && !isClosed && (
            <span className="ml-2">
              · Còn {formatTimeLeft(poll.endsAt)}
            </span>
          )}
        </span>

        {isOwn && !isClosed && onClose && (
          <button
            type="button"
            onClick={() => onClose(poll.id)}
            className="rounded-lg px-2 py-1 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none"
          >
            Kết thúc
          </button>
        )}
      </div>
    </div>
  );
};

function formatTimeLeft(endsAt: Date | string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Đã hết hạn";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)} ngày`;
  if (h > 0) return `${h}g ${m}p`;
  return `${m} phút`;
}

export default PollMessage;
