import React from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBarIcon,
  CheckIcon,
  LockClosedIcon,
  TrophyIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";
import { messageApi } from "../../services/api";
import { toast } from "../ui";
import { useAuthStore } from "../../stores";
import { Avatar } from "../common/Avatar";
import { UserProfile } from "../info/UserProfile";
import { loadUserProfiles } from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { dispatchStartDirectMessage } from "../../features/chat/events/chatUiEvents";

interface PollMessageProps {
  poll: PollInfo;
  isOwn: boolean;
  currentUserId?: string;
  messageId?: string;
}

type ResolvedProfile = {
  name: string;
  avatar: string | null;
  position: string | null;
  department: string | null;
};

export const PollMessage: React.FC<PollMessageProps> = ({
  poll,
  isOwn,
  currentUserId: currentUserIdProp,
  messageId,
}) => {
  // ponytail: read from store — prop is often undefined (not threaded through MessageCluster)
  const storeUserId = useAuthStore((s) => s.user?.id);
  const currentUserId = currentUserIdProp ?? storeUserId;

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
  const [activeOptionId, setActiveOptionId] = React.useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);
  const [resolvedProfiles, setResolvedProfiles] = React.useState<Record<string, ResolvedProfile>>({});
  const [profilesLoading, setProfilesLoading] = React.useState(false);

  const hasVoted = voted.size > 0;
  const isClosed = poll.isClosed;
  const showResults = hasVoted || isClosed;
  const canVote = !isClosed && !!currentUserId;

  const totalVotes =
    Object.values(localVotes).reduce((s, v) => s + v, 0) || poll.totalVotes;
  const maxVotes = Math.max(...Object.values(localVotes), 1);

  // Batch-load voter profiles whenever non-anonymous results become visible
  React.useEffect(() => {
    if (poll.anonymous || !showResults) return;
    const allIds = [
      ...new Set(poll.options.flatMap((o) => o.voterIds ?? [])),
    ];
    if (allIds.length === 0) return;
    setProfilesLoading(true);
    void loadUserProfiles(allIds).then((results) => {
      const map: Record<string, ResolvedProfile> = {};
      for (const [id, s] of Object.entries(results)) {
        map[id] = {
          name: s?.displayName ?? s?.username ?? id,
          avatar: resolvePublicResourceUrl((s as { avatar?: string })?.avatar || s?.avatarUrl || undefined) ?? null,
          position: s?.position ?? null,
          department: s?.department ?? null,
        };
      }
      setResolvedProfiles(map);
      setProfilesLoading(false);
    });
  }, [poll.anonymous, showResults, poll.options]);

  const getProfile = (userId: string): ResolvedProfile =>
    resolvedProfiles[userId] ?? {
      name: userId,
      avatar: null,
      position: null,
      department: null,
    };

  const handleSelect = (optionId: string) => {
    if (!canVote) return;
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
      voted.forEach((id) => {
        setLocalVotes((lv) => ({ ...lv, [id]: Math.max(0, (lv[id] ?? 0) - 1) }));
      });
      nextVoted = prev ? new Set([prev]) : new Set();
      if (prev) {
        setLocalVotes((lv) => ({ ...lv, [prev]: (lv[prev] ?? 0) + 1 }));
      }
    }

    setVoted(nextVoted);
    if (messageId && nextVoted.size > 0) {
      messageApi.votePoll(messageId, poll.id, Array.from(nextVoted)).catch(() => {
        toast.error("Không thể ghi nhận bình chọn");
        setVoted(voted);
      });
    }
  };

  return (
    <div className="-mx-[var(--chat-message-padding-x)] -my-[var(--chat-message-padding-y)] min-w-[280px] overflow-hidden bg-surface">

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#1565C0]/12 px-4 py-2.5">
        <ChartBarIcon className="h-3.5 w-3.5 shrink-0 text-[#1565C0]" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-[#1565C0]">
          Bình chọn
        </span>
        {poll.allowMultiple && (
          <span className="text-[10px] text-[#1565C0]/60">Chọn nhiều</span>
        )}
        {poll.anonymous && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#1565C0]/60">
            <UserIcon className="h-3 w-3" />
            Ẩn danh
          </span>
        )}
        {isClosed && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            <LockClosedIcon className="h-3 w-3" />
            Đã kết thúc
          </span>
        )}
      </div>

      {/* Question */}
      <div className="px-4 pb-2 pt-3">
        <p className="text-[13.5px] font-semibold leading-snug text-text-primary">
          {poll.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-1.5 px-3 pb-3">
        {poll.options.map((option) => {
          const votes = localVotes[option.id] ?? option.votes;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const barPct = totalVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0;
          const isVoted = voted.has(option.id);
          const isWinner = showResults && votes === maxVotes && totalVotes > 0;
          const voters = !poll.anonymous ? (option.voterIds ?? []) : [];
          const hasVoters = showResults && voters.length > 0;
          const isVoterListOpen = activeOptionId === option.id;

          return (
            <div key={option.id} className="overflow-hidden rounded-xl">

              {/* Voting row */}
              <button
                type="button"
                onClick={() => handleSelect(option.id)}
                disabled={!canVote}
                className={clsx(
                  "relative w-full overflow-hidden text-left transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
                  canVote ? "cursor-pointer" : "cursor-default",
                  !showResults && (
                    isVoted
                      ? "border border-[#1565C0]/40 bg-[#EBF3FF]"
                      : "border border-border/60 hover:bg-surface-overlay/60"
                  ),
                  showResults && "border border-transparent",
                  hasVoters ? "rounded-t-xl" : "rounded-xl",
                )}
              >
                {showResults && (
                  <div
                    className={clsx(
                      "absolute inset-y-0 left-0 transition-all duration-500 ease-out",
                      isWinner ? "bg-[#1565C0]/[0.14]" : "bg-[#1565C0]/[0.06]",
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                )}

                <div className="relative flex items-center gap-2.5 px-3 py-2.5">
                  {/* Radio / checkbox */}
                  <div
                    className={clsx(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition-colors",
                      poll.allowMultiple ? "rounded-[4px]" : "rounded-full",
                      isVoted
                        ? "border-[#1565C0] bg-[#1565C0]"
                        : "border-border/70 bg-transparent",
                    )}
                  >
                    {isVoted && (
                      <CheckIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    )}
                  </div>

                  {/* Option text */}
                  <span
                    className={clsx(
                      "flex-1 text-[13px] leading-snug",
                      isWinner
                        ? "font-semibold text-text-primary"
                        : isVoted
                          ? "font-medium text-text-primary"
                          : "text-text-secondary",
                    )}
                  >
                    {option.text}
                  </span>

                  {/* Winner trophy */}
                  {isWinner && (
                    <TrophyIcon className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" />
                  )}

                  {/* pct — always rendered to hold space */}
                  <span
                    className={clsx(
                      "w-[38px] shrink-0 text-right text-[11px] tabular-nums transition-opacity duration-150",
                      showResults
                        ? isWinner
                          ? "font-semibold text-[#1565C0]"
                          : "text-[#1565C0]/55"
                        : "pointer-events-none select-none opacity-0",
                    )}
                  >
                    <span className="text-[#1565C0]/50 font-normal">{pct}%</span>
                    {showResults && votes > 0 && (
                      <span className="ml-1 text-[13px] font-semibold text-[#1565C0]">{votes}</span>
                    )}
                  </span>
                </div>
              </button>

              {/* Avatar strip — toggle voter list */}
              {hasVoters && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveOptionId((prev) => (prev === option.id ? null : option.id))
                  }
                  className={clsx(
                    "flex w-full items-center gap-1.5 border border-t-0 border-[#1565C0]/10",
                    "bg-[#1565C0]/[0.03] px-3 py-1.5 transition-colors",
                    "hover:bg-[#1565C0]/[0.07] focus-visible:outline-none",
                    isVoterListOpen ? "rounded-none border-b-0" : "rounded-b-xl",
                  )}
                >
                  {/* Stacked avatars — up to 3 with tooltip title */}
                  <div className="flex items-center">
                    {voters.slice(0, 3).map((uid, i) => {
                      const p = getProfile(uid);
                      return (
                        <div
                          key={uid}
                          title={p.name}
                          className="ring-[1.5px] ring-surface"
                          style={{ marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: 3 - i }}
                        >
                          <Avatar src={p.avatar} alt={p.name} size="xs" />
                        </div>
                      );
                    })}
                  </div>

                  {voters.length > 3 && (
                    <span className="rounded-full bg-[#1565C0]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1565C0]/70">
                      +{voters.length - 3}
                    </span>
                  )}

                  <span className="flex-1 text-left text-[11px] text-[#1565C0]/55">
                    {isVoterListOpen ? "Ẩn danh sách" : "Xem ai đã chọn"}
                  </span>

                  <svg
                    className={clsx(
                      "h-3 w-3 shrink-0 text-[#1565C0]/40 transition-transform duration-200",
                      isVoterListOpen && "rotate-180",
                    )}
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2 4l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}

              {/* Expanded voter list — Framer Motion slide-down */}
              <AnimatePresence initial={false}>
                {hasVoters && isVoterListOpen && (
                  <motion.div
                    key="voter-list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden rounded-b-xl border border-t-0 border-[#1565C0]/10 bg-surface"
                  >
                    <div className="max-h-[220px] overflow-y-auto py-1">
                      {profilesLoading
                        ? Array.from({ length: Math.min(voters.length, 3) }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                              <div className="h-8 w-8 animate-pulse rounded-full bg-surface-overlay" />
                              <div className="flex flex-col gap-1">
                                <div className="h-2.5 w-24 animate-pulse rounded bg-surface-overlay" />
                                <div className="h-2 w-16 animate-pulse rounded bg-surface-overlay/70" />
                              </div>
                            </div>
                          ))
                        : voters.map((uid) => {
                            const p = getProfile(uid);
                            const isSelf = uid === currentUserId;
                            const subtitle = [p.position, p.department]
                              .filter(Boolean)
                              .join(" · ");

                            return (
                              <button
                                key={uid}
                                type="button"
                                onClick={() => setViewingUserId(uid)}
                                className={clsx(
                                  "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                                  "transition-colors hover:bg-[#1565C0]/06 focus-visible:outline-none",
                                  isSelf && "bg-[#1565C0]/[0.04]",
                                )}
                              >
                                <Avatar src={p.avatar} alt={p.name} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[12.5px] font-medium text-text-primary">
                                      {p.name}
                                    </span>
                                    {isSelf && (
                                      <span className="shrink-0 rounded-full bg-[#1565C0]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">
                                        Bạn
                                      </span>
                                    )}
                                  </div>
                                  {subtitle && (
                                    <p className="truncate text-[11px] text-text-muted">
                                      {subtitle}
                                    </p>
                                  )}
                                </div>
                                <svg
                                  className="h-3.5 w-3.5 shrink-0 text-text-muted"
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path
                                    d="M5 3l4 4-4 4"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            );
                          })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-[#1565C0]/12 px-4 py-2">
        <span className="text-[11px] text-[#1565C0]/55">
          {totalVotes === 0
            ? "Chưa có lượt nào"
            : `${totalVotes} lượt bình chọn`}
          {poll.endsAt && !isClosed && (
            <span className="ml-1.5 font-medium text-[#1565C0]/80">
              · Còn {formatTimeLeft(poll.endsAt)}
            </span>
          )}
        </span>

        {isOwn && !isClosed && messageId && (
          <button
            type="button"
            onClick={() => {
              messageApi.closePoll(messageId, poll.id).catch(() => {
                toast.error("Không thể kết thúc bình chọn");
              });
            }}
            className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-medium text-[#1565C0] transition-colors hover:bg-[#1565C0]/08 focus-visible:outline-none"
          >
            Kết thúc
          </button>
        )}
      </div>

      {/* Profile modal — same portal pattern as MessageCluster */}
      {viewingUserId &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setViewingUserId(null)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <UserProfile
                userId={viewingUserId}
                currentUserId={currentUserId ?? ""}
                conversationContext="standalone"
                initialUser={(() => {
                  const p = resolvedProfiles[viewingUserId];
                  return p ? { id: viewingUserId, username: viewingUserId, displayName: p.name, avatar: p.avatar ?? undefined } : null;
                })()}
                onClose={() => setViewingUserId(null)}
                onStartConversation={(uid) => {
                  setViewingUserId(null);
                  dispatchStartDirectMessage({ userId: uid });
                }}
              />
            </div>
          </div>,
          document.body,
        )}
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
