import React from "react";
import clsx from "clsx";
import { ClockIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ReminderInfo } from "@hacom/chat-shared-types/chat";
import type { Message } from "../../types";
import { formatReminderWhen, reminderDateBadge } from "../message/reminderFormat";

interface ReminderHistoryListProps {
  reminders: Message[];
  loading: boolean;
  onJumpToMessage?: (messageId: string) => void;
  onOpenCalendar: () => void;
}

/**
 * Reminder history for the info panel — shared by GroupInfo (groups) and
 * UserProfile (1-1 DMs). In-chat reminders live as REMINDER messages, so the
 * list is just those messages' metadata.reminder, mirroring the polls section.
 */
export const ReminderHistoryList: React.FC<ReminderHistoryListProps> = ({
  reminders,
  loading,
  onJumpToMessage,
  onOpenCalendar,
}) => {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-surface-overlay p-3">
            <div className="mb-2 h-3 w-3/4 rounded bg-surface-active" />
            <div className="h-2 w-1/3 rounded bg-surface-active/70" />
          </div>
        ))}
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1565C0]/[0.08]">
          <ClockIcon className="h-6 w-6 text-[#1565C0]/50" />
        </div>
        <div>
          <p className="text-[12.5px] font-medium text-text-primary">Chưa có nhắc hẹn nào</p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Đặt nhắc hẹn từ tin nhắn để không bỏ lỡ việc quan trọng
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-[#1565C0]/10 px-4 py-2 text-[12px] font-medium text-[#1565C0] transition-colors hover:bg-[#1565C0]/16"
          onClick={onOpenCalendar}
        >
          Mở lịch
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {reminders.map((msg) => {
        const reminder = (msg.metadata as { reminder?: ReminderInfo } | null | undefined)?.reminder;
        if (!reminder) return null;
        const badge = reminderDateBadge(reminder.remindAt);
        const going = reminder.participants.filter((p) => p.response === "accepted").length;
        return (
          <div
            key={msg.id}
            role={onJumpToMessage ? "button" : undefined}
            tabIndex={onJumpToMessage ? 0 : undefined}
            onClick={onJumpToMessage ? () => onJumpToMessage(msg.id) : undefined}
            onKeyDown={
              onJumpToMessage
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onJumpToMessage(msg.id);
                    }
                  }
                : undefined
            }
            className={clsx(
              "flex items-center gap-2.5 rounded-xl border border-border bg-surface-overlay px-3 py-2.5 transition-colors hover:border-[#1565C0]/30",
              onJumpToMessage &&
                "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565C0]/30",
            )}
          >
            {/* Calendar badge */}
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-surface text-center leading-none">
              <span className="text-[7px] font-semibold uppercase text-[#1565C0]">{badge.weekday}</span>
              <span className="text-[15px] font-bold text-text-primary">{badge.day}</span>
              <span className="text-[6.5px] font-medium uppercase text-text-muted">{badge.month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-[12.5px] font-semibold text-text-primary">
                {reminder.content}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                <ClockIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{formatReminderWhen(reminder.remindAt)}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {reminder.isCancelled ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-active px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    <XMarkIcon className="h-2.5 w-2.5" />
                    Đã hủy
                  </span>
                ) : reminder.isFired ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-active px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    <CheckIcon className="h-2.5 w-2.5" />
                    Đã nhắc
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#1565C0]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1565C0]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1565C0] animate-pulse" />
                    Sắp tới
                  </span>
                )}
                {going > 0 && (
                  <span className="text-[10px] text-text-muted">· {going} tham gia</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReminderHistoryList;
