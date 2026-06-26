import React from "react";
import ReactDOM from "react-dom";
import {
  CheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";
import { messageApi } from "../../services/api";
import { toast } from "../ui";
import { useAuthStore } from "../../stores";
import { UserProfile } from "../info/UserProfile";
import { loadUserProfiles } from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { dispatchStartDirectMessage } from "../../features/chat/events/chatUiEvents";
import { PollDetailModal } from "./PollDetailModal";

interface PollMessageProps {
  poll: PollInfo;
  isOwn: boolean;
  currentUserId?: string;
  messageId?: string;
  senderName?: string;
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
  senderName,
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
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);
  const [resolvedProfiles, setResolvedProfiles] = React.useState<Record<string, ResolvedProfile>>({});
  const [, setProfilesLoading] = React.useState(false);

  const hasVoted = voted.size > 0;
  const isClosed = poll.isClosed;
  const showResults = hasVoted || isClosed;
  const canVote = !isClosed && !!currentUserId;

  const totalVotes =
    Object.values(localVotes).reduce((s, v) => s + v, 0) || poll.totalVotes;
  const maxVotes = Math.max(...Object.values(localVotes), 1);

  // Batch-load voter profiles whenever non-anonymous results / detail modal become visible
  React.useEffect(() => {
    if (poll.anonymous || (!showResults && !detailOpen)) return;
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
  }, [poll.anonymous, showResults, detailOpen, poll.options]);

  // Commit a full selection from the detail modal (already-diffed draft)
  const commitVote = (selected: Set<string>) => {
    if (!canVote) return;
    setLocalVotes((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const wasOn = voted.has(id);
        const isOn = selected.has(id);
        if (wasOn && !isOn) next[id] = Math.max(0, (next[id] ?? 0) - 1);
        if (!wasOn && isOn) next[id] = (next[id] ?? 0) + 1;
      }
      return next;
    });
    const prevVoted = voted;
    setVoted(new Set(selected));
    if (messageId && selected.size > 0) {
      messageApi.votePoll(messageId, poll.id, Array.from(selected)).catch(() => {
        toast.error("Không thể ghi nhận bình chọn");
        setVoted(prevVoted);
      });
    }
  };

  const hasAnyVotes = totalVotes > 0;
  const allVoters = !poll.anonymous
    ? [...new Set(poll.options.flatMap((o) => o.voterIds ?? []))]
    : [];
  const voterCount = allVoters.length;

  return (
    <div className="-mx-[var(--chat-message-padding-x)] -my-[var(--chat-message-padding-y)] min-w-[300px] max-w-[340px] overflow-hidden rounded-2xl bg-surface px-3.5 pb-3.5 pt-3">

      {/* Question */}
      <p className="text-[15px] font-semibold leading-snug text-text-primary">
        {poll.question}
      </p>

      {/* Subtitle: multiple-choice hint */}
      {poll.allowMultiple && (
        <p className="mt-0.5 text-[12.5px] text-text-muted">Chọn nhiều phương án</p>
      )}
      {isClosed && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-text-muted">
          <LockClosedIcon className="h-3 w-3" />
          Đã kết thúc
        </p>
      )}

      {/* "N người bình chọn ▸" — opens detail modal */}
      {!poll.anonymous && voterCount > 0 && (
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="mt-1.5 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
        >
          {voterCount} người bình chọn
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Options */}
      <div className="mt-2.5 space-y-2">
        {poll.options.map((option) => {
          const votes = localVotes[option.id] ?? option.votes;
          const barPct = hasAnyVotes ? Math.round((votes / maxVotes) * 100) : 0;
          const isVoted = voted.has(option.id);

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => !isClosed && setDetailOpen(true)}
              disabled={isClosed}
              className={clsx(
                "relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
                isClosed ? "cursor-default" : "cursor-pointer",
                isVoted
                  ? "border-[#1565C0]/40 bg-[#EBF3FF]"
                  : "border-border/60 bg-surface-overlay/40 hover:bg-surface-overlay/70",
              )}
            >
              {/* progress bar fill */}
              {hasAnyVotes && (
                <div
                  className="absolute inset-y-0 left-0 bg-[#1565C0]/[0.07] transition-all duration-500 ease-out"
                  style={{ width: `${barPct}%` }}
                />
              )}

              {/* option text */}
              <span
                className={clsx(
                  "relative flex-1 truncate text-[13.5px] leading-snug",
                  isVoted ? "font-medium text-text-primary" : "text-text-secondary",
                )}
              >
                {option.text}
              </span>

              {/* vote count */}
              <span className="relative shrink-0 text-[13px] font-semibold tabular-nums text-text-secondary">
                {votes}
              </span>

              {/* selected tick — blue circle */}
              {isVoted && (
                <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#1565C0]">
                  <CheckIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Primary action — Bình chọn / Đổi lựa chọn (opens detail modal) */}
      {!isClosed && (
        <button
          type="button"
          disabled={!canVote}
          onClick={() => setDetailOpen(true)}
          className={clsx(
            "mt-3 w-full rounded-lg border py-2.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-none",
            "border-[#1565C0]/50 text-[#1565C0] hover:bg-[#1565C0]/[0.06]",
            !canVote && "cursor-not-allowed opacity-50",
          )}
        >
          {hasVoted ? "Đổi lựa chọn" : "Bình chọn"}
        </button>
      )}

      {/* Owner close action */}
      {isOwn && !isClosed && messageId && (
        <button
          type="button"
          onClick={() => {
            messageApi.closePoll(messageId, poll.id).catch(() => {
              toast.error("Không thể kết thúc bình chọn");
            });
          }}
          className="mt-2 w-full rounded-lg py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-overlay focus-visible:outline-none"
        >
          Kết thúc bình chọn
        </button>
      )}

      {/* Poll detail modal — "Bình chọn" / "Chi tiết bình chọn" + gear menu */}
      <PollDetailModal
        poll={poll}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        voted={voted}
        localVotes={localVotes}
        totalVotes={totalVotes}
        canVote={canVote}
        isOwn={isOwn}
        senderName={senderName}
        currentUserId={currentUserId}
        profiles={resolvedProfiles}
        onConfirm={(selected) => commitVote(selected)}
        onPin={
          messageId
            ? () => {
                messageApi
                  .pinMessage(messageId)
                  .then(() => toast.success("Đã ghim lên đầu trò chuyện"))
                  .catch(() => toast.error("Không thể ghim bình chọn"));
              }
            : undefined
        }
        onClosePoll={
          isOwn && messageId
            ? () => {
                messageApi.closePoll(messageId, poll.id).catch(() => {
                  toast.error("Không thể kết thúc bình chọn");
                });
              }
            : undefined
        }
        onViewProfile={(uid) => {
          setDetailOpen(false);
          setViewingUserId(uid);
        }}
      />

      {/* Profile modal — same portal pattern as MessageCluster */}
      {viewingUserId &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[210] flex items-center justify-center p-4"
            onClick={() => setViewingUserId(null)}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative z-10 flex max-h-[88vh] w-full max-w-[340px] flex-col overflow-y-auto rounded-2xl shadow-2xl"
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

export default PollMessage;
