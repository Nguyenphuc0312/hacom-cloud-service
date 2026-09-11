import React from "react";
import {
  CheckIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";
import { messageApi } from "../../services/api";
import { toast } from "../ui";
import { useAuthStore } from "../../stores";
import { resolveStoredDisplayName } from "../../stores/useResolvedDisplayName";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { chatApi, fetchConversationTail } from "../../features/api/chatApi";
import { UserProfile } from "../info/UserProfile";
import { DraggableProfileModal } from "../info/DraggableProfileModal";
import { Avatar } from "../common/Avatar";
import {
  loadUserProfiles,
  invalidateUserProfileSummary,
} from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { dispatchStartDirectMessage } from "../../features/chat/events/chatUiEvents";
import { PollDetailModal } from "./PollDetailModal";

interface PollMessageProps {
  poll: PollInfo;
  isOwn: boolean;
  currentUserId?: string;
  messageId?: string;
  conversationId?: string;
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
  conversationId,
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

  const dispatch = useAppDispatch();

  // Re-sync optimistic state to authoritative poll data when it changes via
  // realtime/refetch. useState seeds once on mount, so without this an observer
  // watching someone else vote (or our own vote after the refresh below) keeps
  // showing stale counts until reload. Done in render (React's "adjust state on
  // prop change" pattern) rather than an effect to avoid a cascading re-render.
  const pollSignature =
    poll.options
      .map((o) => `${o.id}:${o.votes}:${(o.voterIds ?? []).join(",")}`)
      .join("|") + `#${currentUserId ?? ""}`;
  const [syncedSignature, setSyncedSignature] = React.useState(pollSignature);
  if (pollSignature !== syncedSignature) {
    setSyncedSignature(pollSignature);
    setLocalVotes(Object.fromEntries(poll.options.map((o) => [o.id, o.votes])));
    setVoted(new Set(myInitialVotes));
  }

  // The actor never receives an optimistic copy nor a usable HTTP body for the
  // BE-generated poll system message ("Bạn tham gia/đổi lựa chọn… Xem"); it only
  // lives on the server until the next message:new echo. Force-refetch the
  // timeline after our own poll action so that system line appears immediately
  // instead of waiting for a reload. ponytail: invalidateTags reuses the existing
  // getMessages replace-merge; no new sync code.
  const newestLoadedSeq = useAppSelector((s) =>
    conversationId
      ? (chatApi.endpoints.getMessages.select({ conversationId })(s).data
          ?.newestLoadedSeq ?? null)
      : null,
  );
  const refreshTimeline = React.useCallback(() => {
    if (!conversationId) return;
    dispatch(fetchConversationTail(conversationId, newestLoadedSeq));
  }, [conversationId, dispatch, newestLoadedSeq]);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);
  const [resolvedProfiles, setResolvedProfiles] = React.useState<Record<string, ResolvedProfile>>({});
  const [, setProfilesLoading] = React.useState(false);

  const hasVoted = voted.size > 0;
  const isClosed = poll.isClosed;
  const canVote = !isClosed && !!currentUserId;

  // "Ẩn kết quả khi chưa bình chọn": BE masks REST to 0, but the WS frame still
  // carries real counts (room-wide broadcast can't mask per-viewer) — so we also
  // hide visually until this viewer votes. Closed poll → results public to all.
  const resultsHidden = !!poll.hideResultsBeforeVote && !hasVoted && !isClosed;

  const totalVotes =
    Object.values(localVotes).reduce((s, v) => s + v, 0) || poll.totalVotes;
  const maxVotes = Math.max(...Object.values(localVotes), 1);

  // Batch-load voter profiles for non-anonymous polls whenever there are voters —
  // option rows now show voter avatars regardless of whether the viewer has voted.
  const loadProfiles = React.useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setProfilesLoading(true);
    void loadUserProfiles(ids).then((results) => {
      setResolvedProfiles((prev) => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(results)) {
          next[id] = {
            name: resolveStoredDisplayName(id, s?.displayName ?? s?.username ?? id),
            avatar: resolvePublicResourceUrl((s as { avatar?: string })?.avatar || s?.avatarUrl || undefined) ?? null,
            position: s?.position ?? null,
            department: s?.department ?? null,
          };
        }
        return next;
      });
      setProfilesLoading(false);
    });
  }, []);

  React.useEffect(() => {
    if (poll.anonymous) return;
    const allIds = [
      ...new Set(poll.options.flatMap((o) => o.voterIds ?? [])),
    ];
    loadProfiles(allIds);
  }, [poll.anonymous, poll.options, loadProfiles]);

  // Presigned avatar URLs expire (~15min). On a 403/load failure, drop the
  // cached summary and re-resolve that one voter so a fresh URL is signed.
  const handleAvatarError = React.useCallback(
    (uid: string) => {
      invalidateUserProfileSummary(uid);
      loadProfiles([uid]);
    },
    [loadProfiles],
  );

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
    // Send even when selected is empty: that clears my vote server-side
    // (BE filters me out of every option). Skipping it left voterIds — and so
    // the avatars — stale until a reload.
    if (messageId) {
      messageApi
        .votePoll(messageId, poll.id, Array.from(selected))
        .then(refreshTimeline)
        .catch(() => {
          toast.error("Không thể ghi nhận bình chọn");
          setVoted(prevVoted);
        });
    }
  };

  // Add a new option (only when poll.allowAddOption). Realtime message:updated
  // brings the new option back to everyone; we refetch our own tail for the
  // system line, same as vote/close.
  const addOption = (text: string) => {
    if (!messageId) return Promise.reject(new Error("no messageId"));
    return messageApi
      .addPollOption(messageId, poll.id, text.trim())
      .then(refreshTimeline)
      .catch((e) => {
        toast.error("Không thể thêm lựa chọn");
        throw e;
      });
  };

  const hasAnyVotes = !resultsHidden && totalVotes > 0;
  const allVoters = !poll.anonymous
    ? [...new Set(poll.options.flatMap((o) => o.voterIds ?? []))]
    : [];
  const voterCount = resultsHidden ? 0 : allVoters.length;

  return (
    <div className="min-w-[300px] max-w-[340px] overflow-hidden rounded-2xl border border-border/60 bg-surface px-3.5 pb-3.5 pt-3 shadow-sm">

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
      {resultsHidden && (
        <p className="mt-0.5 text-[12px] text-text-muted">
          Bình chọn để xem kết quả
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
          const optionVoters =
            poll.anonymous || resultsHidden ? [] : option.voterIds ?? [];

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

              {/* voter avatars on this option (non-anonymous) */}
              {optionVoters.length > 0 && (
                <div className="relative flex shrink-0 items-center">
                  {optionVoters.slice(0, 3).map((uid, i) => {
                    const p = resolvedProfiles[uid];
                    return (
                      <div
                        key={uid}
                        title={p?.name ?? uid}
                        className="rounded-full"
                        style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}
                      >
                        <Avatar
                          src={p?.avatar ?? undefined}
                          alt={p?.name ?? uid}
                          size="xs"
                          onImageError={() => handleAvatarError(uid)}
                        />
                      </div>
                    );
                  })}
                  {optionVoters.length > 3 && (
                    <span className="ml-1 text-[11px] font-medium text-text-muted">
                      +{optionVoters.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* vote count — hidden until viewer votes when hideResultsBeforeVote */}
              {!resultsHidden && (
                <span className="relative shrink-0 text-[13px] font-semibold tabular-nums text-text-secondary">
                  {votes}
                </span>
              )}

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
            messageApi
              .closePoll(messageId, poll.id)
              .then(refreshTimeline)
              .catch(() => {
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
        resultsHidden={resultsHidden}
        canVote={canVote}
        isOwn={isOwn}
        senderName={senderName}
        currentUserId={currentUserId}
        profiles={resolvedProfiles}
        onConfirm={(selected) => commitVote(selected)}
        onAddOption={poll.allowAddOption && messageId ? addOption : undefined}
        onPin={
          messageId
            ? () => {
                messageApi
                  .pinMessage(messageId)
                  .then(() => {
                    toast.success("Đã ghim lên đầu trò chuyện");
                    // ponytail: usePinnedMessages only refetches on this event; the direct
                    // pin call (vs MessageActions path) wasn't firing it → panel stayed empty.
                    if (conversationId && typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("group:pin:updated", {
                          detail: { conversationId },
                        }),
                      );
                    }
                  })
                  .catch(() => toast.error("Không thể ghim bình chọn"));
              }
            : undefined
        }
        onClosePoll={
          isOwn && messageId
            ? () => {
                messageApi
                  .closePoll(messageId, poll.id)
                  .then(refreshTimeline)
                  .catch(() => {
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

      {/* Profile modal — same shell as MessageCluster */}
      {viewingUserId && (
        <DraggableProfileModal
          onClose={() => setViewingUserId(null)}
          zClassName="z-[210]"
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
        </DraggableProfileModal>
      )}
    </div>
  );
};

export default PollMessage;
