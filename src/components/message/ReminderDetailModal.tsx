import React from "react";
import ReactDOM from "react-dom";
import {
  XMarkIcon,
  ChevronLeftIcon,
  AdjustmentsHorizontalIcon,
  CheckIcon,
  ClockIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { ReminderInfo, ReminderResponse } from "@hacom/chat-shared-types/chat";
import { Avatar } from "../common/Avatar";
import {
  reminderDateBadge,
  formatReminderWhen,
  formatRepeat,
  type RepeatType,
} from "./reminderFormat";

export type ResolvedProfile = {
  name: string;
  avatar: string | null;
  position: string | null;
  department: string | null;
};

interface ReminderDetailModalProps {
  reminder: ReminderInfo;
  isOpen: boolean;
  onClose: () => void;
  isOwn: boolean;
  senderName?: string;
  currentUserId?: string;
  myResponse: ReminderResponse;
  canRespond: boolean;
  profiles: Record<string, ResolvedProfile>;
  onRespond: (response: "accepted" | "declined") => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onViewProfile: (userId: string) => void;
  onAvatarError?: (userId: string) => void;
}

type View = "main" | "detail";

export const ReminderDetailModal: React.FC<ReminderDetailModalProps> = ({
  reminder,
  isOpen,
  onClose,
  isOwn,
  senderName,
  currentUserId,
  myResponse,
  canRespond,
  profiles,
  onRespond,
  onEdit,
  onCancel,
  onViewProfile,
  onAvatarError,
}) => {
  const [view, setView] = React.useState<View>("main");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [respondMenuOpen, setRespondMenuOpen] = React.useState(false);
  const gearRef = React.useRef<HTMLDivElement | null>(null);
  const respondRef = React.useRef<HTMLDivElement | null>(null);

  const [prevOpen, setPrevOpen] = React.useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setView("main");
      setMenuOpen(false);
      setRespondMenuOpen(false);
    }
  }

  React.useEffect(() => {
    if (!menuOpen && !respondMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (respondRef.current && !respondRef.current.contains(e.target as Node)) {
        setRespondMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, respondMenuOpen]);

  if (!isOpen) return null;

  const getProfile = (uid: string): ResolvedProfile =>
    profiles[uid] ?? { name: uid, avatar: null, position: null, department: null };

  const badge = reminderDateBadge(reminder.remindAt);
  const whenText = formatReminderWhen(reminder.remindAt);
  const participantCount = reminder.participants.length;

  const statusLabel =
    myResponse === "accepted"
      ? "Bạn xác nhận: Tham gia."
      : myResponse === "declined"
        ? "Bạn xác nhận: Từ chối."
        : "Bạn chưa phản hồi.";

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-text-primary/45 backdrop-blur-sm"
        onClick={onClose}
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
            {view === "detail" ? "Người tham gia" : "Chi tiết nhắc hẹn"}
          </h2>
          <button
            type="button"
            onClick={onClose}
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
              {/* Badge + title */}
              <div className="flex items-start gap-3">
                <div className="flex w-[64px] shrink-0 flex-col items-center overflow-hidden rounded-xl border border-border/60">
                  <div className="w-full bg-[#1565C0] py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white">
                    {badge.weekday}
                  </div>
                  <div className="py-0.5 text-center">
                    <div className="text-[22px] font-bold leading-none text-text-primary">
                      {badge.day}
                    </div>
                    <div className="text-[10px] font-medium uppercase text-text-muted">
                      {badge.month}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3
                    className={clsx(
                      "text-[17px] font-semibold leading-snug text-text-primary",
                      reminder.isCancelled && "line-through text-text-muted",
                    )}
                  >
                    {reminder.content}
                  </h3>
                  <p className="mt-1 text-[12.5px] text-text-muted">
                    Tạo bởi {senderName ?? "—"}
                  </p>
                </div>
              </div>

              <div className="my-3 h-px bg-border" />

              {/* When + repeat + participants */}
              <div className="space-y-2.5">
                <p className="flex items-center gap-2 text-[13.5px] text-text-secondary">
                  <ClockIcon className="h-4 w-4 shrink-0 text-text-muted" />
                  {whenText}
                </p>
                <p className="flex items-center gap-2 text-[13.5px] text-text-secondary">
                  <ArrowPathIcon className="h-4 w-4 shrink-0 text-text-muted" />
                  {formatRepeat(reminder.repeat as RepeatType)}
                </p>
                {participantCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setView("detail")}
                    className="inline-flex items-center gap-1 text-[13.5px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2]"
                  >
                    {participantCount} người tham gia
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="my-3 h-px bg-border" />

              {/* My status row */}
              {reminder.isCancelled ? (
                <p className="text-[13.5px] font-medium text-text-muted">
                  Nhắc hẹn đã bị hủy
                </p>
              ) : (
                <div className="relative flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-text-secondary">
                    {myResponse === "accepted" && (
                      <CheckIcon className="h-4 w-4 text-[#1565C0]" strokeWidth={2.5} />
                    )}
                    {myResponse === "declined" && <span className="text-danger">✕</span>}
                    {statusLabel}
                  </span>
                  {canRespond && (
                    <div ref={respondRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setRespondMenuOpen((o) => !o)}
                        className="text-[13px] font-semibold text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
                      >
                        Thay đổi
                      </button>
                      {respondMenuOpen && (
                        <div className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-[130px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setRespondMenuOpen(false);
                              onRespond("accepted");
                            }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-overlay"
                          >
                            Tham gia
                            {myResponse === "accepted" && (
                              <CheckIcon className="h-4 w-4 text-[#1565C0]" strokeWidth={2.5} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRespondMenuOpen(false);
                              onRespond("declined");
                            }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-overlay"
                          >
                            Từ chối
                            {myResponse === "declined" && (
                              <CheckIcon className="h-4 w-4 text-[#1565C0]" strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ── Participants detail view ── */
            <div className="space-y-5">
              {(["accepted", "declined", "pending"] as ReminderResponse[]).map((resp) => {
                const members = reminder.participants.filter((p) => p.response === resp);
                if (members.length === 0) return null;
                const heading =
                  resp === "accepted"
                    ? "Tham gia"
                    : resp === "declined"
                      ? "Từ chối"
                      : "Chưa phản hồi";
                return (
                  <div key={resp}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-text-primary">
                        {heading}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#1565C0]/[0.1] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#1565C0]">
                        {members.length}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="space-y-0.5">
                      {members.map((p) => {
                        const prof = getProfile(p.userId);
                        const subtitle = [prof.position, prof.department]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <button
                            key={p.userId}
                            type="button"
                            onClick={() => onViewProfile(p.userId)}
                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[#1565C0]/[0.06]"
                          >
                            <Avatar
                              src={prof.avatar}
                              alt={prof.name}
                              size="sm"
                              onImageError={() => onAvatarError?.(p.userId)}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-text-primary">
                                {prof.name}
                                {p.userId === currentUserId && (
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
        {view === "main" && (
          <div className="relative flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            {/* Gear menu (owner only) */}
            {isOwn && (onEdit || onCancel) ? (
              <div ref={gearRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-overlay"
                  aria-label="Tùy chọn nhắc hẹn"
                >
                  <AdjustmentsHorizontalIcon className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[180px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit();
                        }}
                        className="block w-full px-4 py-2.5 text-left text-[13.5px] text-text-primary transition-colors hover:bg-surface-overlay"
                      >
                        Chỉnh sửa
                      </button>
                    )}
                    {onCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onCancel();
                        }}
                        className="block w-full px-4 py-2.5 text-left text-[13.5px] text-danger transition-colors hover:bg-danger/10"
                      >
                        Hủy nhắc hẹn
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-surface-overlay px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay/70"
              >
                Đóng
              </button>
              {isOwn && onEdit && !reminder.isCancelled && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-lg bg-[#1565C0] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#1976D2]"
                >
                  Chỉnh sửa
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ReminderDetailModal;
