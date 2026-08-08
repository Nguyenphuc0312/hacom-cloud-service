import React from "react";
import ReactDOM from "react-dom";
import { useClickOutside } from "../../hooks";
import {
  XMarkIcon,
  ChevronLeftIcon,
  Cog6ToothIcon,
  CheckIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { PollInfo } from "@hacom/chat-shared-types/chat";
import { Avatar } from "../common/Avatar";

export type ResolvedProfile = {
  name: string;
  avatar: string | null;
  position: string | null;
  department: string | null;
};

interface PollDetailModalProps {
  poll: PollInfo;
  isOpen: boolean;
  onClose: () => void;
  /** option ids currently saved as my vote (initial selection on open) */
  voted: Set<string>;
  localVotes: Record<string, number>;
  totalVotes: number;
  /** Hide counts/voters until this viewer votes (hideResultsBeforeVote). */
  resultsHidden: boolean;
  canVote: boolean;
  isOwn: boolean;
  senderName?: string;
  currentUserId?: string;
  profiles: Record<string, ResolvedProfile>;
  /** Commit the draft selection (saves the vote). */
  onConfirm: (selected: Set<string>) => void;
  /** Add a new option; undefined when poll.allowAddOption is false. */
  onAddOption?: (text: string) => Promise<unknown>;
  onPin?: () => void;
  onClosePoll?: () => void;
  onViewProfile: (userId: string) => void;
}

type View = "main" | "detail";

export const PollDetailModal: React.FC<PollDetailModalProps> = ({
  poll,
  isOpen,
  onClose,
  voted,
  localVotes,
  totalVotes,
  resultsHidden,
  canVote,
  isOwn,
  senderName,
  currentUserId,
  profiles,
  onConfirm,
  onAddOption,
  onPin,
  onClosePoll,
  onViewProfile,
}) => {
  const [view, setView] = React.useState<View>("main");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newOption, setNewOption] = React.useState("");
  const [submittingOption, setSubmittingOption] = React.useState(false);
  // Local draft of my selection — only committed on "Xác nhận"
  const [draft, setDraft] = React.useState<Set<string>>(() => new Set(voted));
  const gearRef = React.useRef<HTMLDivElement | null>(null);

  // Reset to main view + fresh draft whenever (re)opened
  const [prevOpen, setPrevOpen] = React.useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setView("main");
      setMenuOpen(false);
      setConfirmDiscard(false);
      setAdding(false);
      setNewOption("");
      setDraft(new Set(voted));
    }
  }

  const toggleDraft = (optionId: string) => {
    setDraft((cur) => {
      const next = new Set(cur);
      if (poll.allowMultiple) {
        if (next.has(optionId)) next.delete(optionId);
        else next.add(optionId);
      } else {
        const wasOn = next.has(optionId);
        next.clear();
        if (!wasOn) next.add(optionId);
      }
      return next;
    });
  };

  // "dirty" = draft differs from the saved vote
  const isDirty =
    draft.size !== voted.size || [...draft].some((id) => !voted.has(id));

  const requestClose = () => {
    if (isDirty) setConfirmDiscard(true);
    else onClose();
  };

  useClickOutside(gearRef, () => setMenuOpen(false), { active: menuOpen });

  if (!isOpen) return null;

  const getProfile = (uid: string): ResolvedProfile =>
    profiles[uid] ?? { name: uid, avatar: null, position: null, department: null };

  const voterCount =
    poll.anonymous || resultsHidden
      ? 0
      : new Set(poll.options.flatMap((o) => o.voterIds ?? [])).size;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-text-primary/45 backdrop-blur-sm"
        onClick={requestClose}
      />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-elev3">
        {/* ── Header ── */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
          {view === "detail" && (
            <button
              type="button"
              onClick={() => setView("main")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay"
              aria-label="Quay lại"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <h2 className="flex-1 text-[16px] font-semibold text-text-primary">
            {view === "detail" ? "Chi tiết bình chọn" : "Bình chọn"}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label="Đóng"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {view === "main" ? (
            <>
              {/* Title block */}
              <h3 className="text-[17px] font-semibold leading-snug text-text-primary">
                {poll.question}
              </h3>
              <p className="mt-1 text-[12.5px] text-text-muted">
                Tạo bởi {senderName ?? "—"} · Hôm nay
              </p>
              {poll.allowMultiple && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                  <span className="text-text-muted">≡</span>
                  Chọn nhiều phương án
                </p>
              )}

              <div className="my-3 h-px bg-border" />

              {/* Voter summary line */}
              {!poll.anonymous && voterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setView("detail")}
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2]"
                >
                  {voterCount} người bình chọn, {totalVotes} lượt bình chọn
                  <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              {/* Options */}
              <div className="space-y-2">
                {poll.options.map((option) => {
                  const isVoted = draft.has(option.id);
                  const votes = localVotes[option.id] ?? option.votes;
                  const voters =
                    poll.anonymous || resultsHidden ? [] : option.voterIds ?? [];
                  return (
                    <div key={option.id} className="flex items-center gap-2.5">
                      {/* radio / checkbox */}
                      <button
                        type="button"
                        onClick={() => canVote && toggleDraft(option.id)}
                        disabled={!canVote}
                        className={clsx(
                          "flex h-[20px] w-[20px] shrink-0 items-center justify-center border-2 transition-colors",
                          poll.allowMultiple ? "rounded-[5px]" : "rounded-full",
                          isVoted ? "border-[#1565C0] bg-[#1565C0]" : "border-border bg-transparent",
                          canVote ? "cursor-pointer" : "cursor-default",
                        )}
                        aria-label={isVoted ? "Bỏ chọn" : "Chọn"}
                      >
                        {isVoted && <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />}
                      </button>

                      {/* option pill */}
                      <button
                        type="button"
                        onClick={() => canVote && toggleDraft(option.id)}
                        disabled={!canVote}
                        className={clsx(
                          "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          isVoted
                            ? "border-[#1565C0]/40 bg-[#EBF3FF]"
                            : "border-border bg-surface-overlay/40 hover:bg-surface-overlay/70",
                          canVote ? "cursor-pointer" : "cursor-default",
                        )}
                      >
                        <span className="flex-1 truncate text-[13.5px] text-text-primary">
                          {option.text}
                        </span>
                        {/* voter avatars on this option */}
                        <div className="flex items-center">
                          {voters.slice(0, 3).map((uid, i) => {
                            const p = getProfile(uid);
                            return (
                              <div
                                key={uid}
                                title={p.name}
                                className="rounded-full"
                                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}
                              >
                                <Avatar src={p.avatar} alt={p.name} size="xs" />
                              </div>
                            );
                          })}
                        </div>
                      </button>

                      {/* vote count — hidden until viewer votes when hideResultsBeforeVote */}
                      {!resultsHidden && (
                        <span className="w-5 shrink-0 text-right text-[13px] font-semibold tabular-nums text-text-secondary">
                          {votes}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add option (Zalo-style) — only when poll.allowAddOption */}
              {onAddOption && !poll.isClosed && (
                adding ? (
                  <form
                    className="mt-3 flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = newOption.trim();
                      if (!text || submittingOption) return;
                      setSubmittingOption(true);
                      onAddOption(text)
                        .then(() => {
                          setNewOption("");
                          setAdding(false);
                        })
                        .finally(() => setSubmittingOption(false));
                    }}
                  >
                    <input
                      autoFocus
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      maxLength={100}
                      placeholder="Nhập lựa chọn mới…"
                      disabled={submittingOption}
                      className="flex-1 rounded-lg border border-border bg-surface-overlay/40 px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-[#1565C0]"
                    />
                    <button
                      type="submit"
                      disabled={!newOption.trim() || submittingOption}
                      className="shrink-0 rounded-lg bg-[#1565C0] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Thêm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setNewOption("");
                      }}
                      className="shrink-0 rounded-lg px-2 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface-overlay"
                    >
                      Hủy
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2]"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Thêm lựa chọn
                  </button>
                )
              )}
            </>
          ) : (
            /* ── Detail view: voters grouped per option ── */
            <div className="space-y-5">
              {poll.options.map((option) => {
                const voters = poll.anonymous ? [] : option.voterIds ?? [];
                if (voters.length === 0) return null;
                return (
                  <div key={option.id}>
                    {/* Option header: text + count chip */}
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-text-primary">
                        {option.text}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#1565C0]/[0.1] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#1565C0]">
                        {voters.length}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="space-y-0.5">
                      {voters.map((uid) => {
                        const p = getProfile(uid);
                        const subtitle = [p.position, p.department].filter(Boolean).join(" · ");
                        return (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => onViewProfile(uid)}
                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[#1565C0]/[0.06]"
                          >
                            <Avatar src={p.avatar} alt={p.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-text-primary">
                                {p.name}
                                {uid === currentUserId && (
                                  <span className="shrink-0 rounded-full bg-[#1565C0]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">
                                    Bạn
                                  </span>
                                )}
                              </span>
                              {subtitle && (
                                <span className="mt-0.5 block truncate text-[11.5px] text-text-muted">
                                  {subtitle}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="relative flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div ref={gearRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay"
              aria-label="Cài đặt bình chọn"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>

            {menuOpen && (
              <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[210px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                {onPin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onPin();
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13.5px] text-text-primary transition-colors hover:bg-surface-overlay"
                  >
                    Ghim lên đầu trò chuyện
                  </button>
                )}
                {isOwn && !poll.isClosed && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onClosePoll?.();
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[13.5px] text-text-primary transition-colors hover:bg-surface-overlay"
                  >
                    Khóa bình chọn
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg bg-surface-overlay px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay/70"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!canVote || !isDirty}
              onClick={() => {
                onConfirm(draft);
                onClose();
              }}
              className={clsx(
                "rounded-lg px-5 py-2 text-[13px] font-semibold transition-colors",
                canVote && isDirty
                  ? "bg-[#1565C0] text-white hover:bg-[#1976D2]"
                  : "cursor-not-allowed bg-[#1565C0]/40 text-white/70",
              )}
            >
              Xác nhận
            </button>
          </div>
        </div>

        {/* Discard-confirm dialog — "Bạn chưa lưu bình chọn của mình. Thoát bình chọn?" */}
        {confirmDiscard && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-text-primary/30"
              onClick={() => setConfirmDiscard(false)}
            />
            <div className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elev3">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-[15px] font-semibold text-text-primary">Xác nhận</h3>
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay"
                  aria-label="Đóng"
                >
                  <XMarkIcon className="h-4.5 w-4.5" />
                </button>
              </div>
              <p className="px-4 py-5 text-[13.5px] text-text-secondary">
                Bạn chưa lưu bình chọn của mình. Thoát bình chọn?
              </p>
              <div className="flex items-center justify-end gap-2 px-4 pb-4">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="rounded-lg bg-surface-overlay px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay/70"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onClose();
                  }}
                  className="rounded-lg bg-[#1565C0] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#1976D2]"
                >
                  Thoát
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PollDetailModal;
