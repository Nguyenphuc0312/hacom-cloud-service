import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Message } from "../../types";
import { useAuthStore } from "../../stores";

interface SystemMessageProps {
  message: Message;
  // Older poll-event system messages folded into this row (oldest→newest),
  // revealed behind a "Xem thêm" toggle. See timelinePlanner collapse logic.
  collapsedMessages?: Message[];
  className?: string;
  onNavigateToMessage?: (messageId: string) => void;
}

// ponytail: shape mirrors MessageMetadata.pollEvent in the FE__poll-system-events contract.
// Until the backend ships it, getPollEvent() returns null and we fall back to message.content.
type PollEvent = {
  kind: "created" | "voted" | "changed" | "closed";
  messageId: string;
  pollId: string;
  question: string;
  actorId: string;
  actorName: string | null;
};

const getPollEvent = (message: Message): PollEvent | null => {
  const meta =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const ev = meta?.pollEvent;
  if (!ev || typeof ev !== "object") return null;
  const e = ev as Record<string, unknown>;
  if (
    (e.kind === "created" || e.kind === "voted" || e.kind === "changed" || e.kind === "closed") &&
    typeof e.messageId === "string" &&
    typeof e.question === "string"
  ) {
    return {
      kind: e.kind,
      messageId: e.messageId,
      pollId: typeof e.pollId === "string" ? e.pollId : "",
      question: e.question,
      actorId: typeof e.actorId === "string" ? e.actorId : "",
      actorName: typeof e.actorName === "string" ? e.actorName : null,
    };
  }
  return null;
};

// ponytail: mirrors MessageMetadata.reminderEvent in the FE__reminder contract.
// Until the backend ships it, getReminderEvent() returns null and we fall back
// to message.content.
type ReminderEvent = {
  kind: "created" | "updated" | "cancelled" | "fired";
  messageId: string;
  reminderId: string;
  content: string;
  remindAt: string;
  actorId: string;
  actorName: string | null;
};

const getReminderEvent = (message: Message): ReminderEvent | null => {
  const meta =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const ev = meta?.reminderEvent;
  if (!ev || typeof ev !== "object") return null;
  const e = ev as Record<string, unknown>;
  if (
    (e.kind === "created" || e.kind === "updated" || e.kind === "cancelled" || e.kind === "fired") &&
    typeof e.messageId === "string" &&
    typeof e.content === "string"
  ) {
    return {
      kind: e.kind,
      messageId: e.messageId,
      reminderId: typeof e.reminderId === "string" ? e.reminderId : "",
      content: e.content,
      remindAt: typeof e.remindAt === "string" ? e.remindAt : "",
      actorId: typeof e.actorId === "string" ? e.actorId : "",
      actorName: typeof e.actorName === "string" ? e.actorName : null,
    };
  }
  return null;
};

const SEVERITY_PILL = "border-border/70 bg-[hsl(var(--chat-panel-bg))] text-text-secondary";

const resolveSeverity = (message: Message): "info" | "warn" | "error" => {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const raw =
    typeof metadata?.severity === "string"
      ? metadata.severity
      : typeof metadata?.level === "string"
        ? metadata.level
        : typeof metadata?.variant === "string"
          ? metadata.variant
          : "info";
  if (raw === "warn" || raw === "warning") return "warn";
  if (raw === "error") return "error";
  return "info";
};

const pillClassFor = (severity: "info" | "warn" | "error") =>
  clsx(
    "rounded-full border px-3.5 py-1 text-[11px] font-medium tracking-[0.01em]",
    severity === "error"
      ? "border-danger/25 bg-danger/10 text-danger"
      : severity === "warn"
        ? "border-warning/25 bg-warning/12 text-warning"
        : SEVERITY_PILL,
  );

// One poll-event pill ("X tham gia/đổi lựa chọn… Xem").
const PollEventPill: React.FC<{
  pollEvent: PollEvent;
  currentUserId?: string;
  onNavigateToMessage?: (messageId: string) => void;
}> = ({ pollEvent, currentUserId, onNavigateToMessage }) => {
  const { t } = useTranslation("chat");
  const isYou = !!currentUserId && pollEvent.actorId === currentUserId;
  const isAnonymous = !isYou && !pollEvent.actorName;
  const opts = { question: pollEvent.question, actor: pollEvent.actorName ?? "" };
  const text = (() => {
    switch (pollEvent.kind) {
      case "created":
        return isYou ? t("poll.systemEvent.createdByYou", opts) : t("poll.systemEvent.created", opts);
      case "voted":
        return isYou
          ? t("poll.systemEvent.votedByYou", opts)
          : isAnonymous
            ? t("poll.systemEvent.votedAnonymous", opts)
            : t("poll.systemEvent.voted", opts);
      case "changed":
        return isYou
          ? t("poll.systemEvent.changedByYou", opts)
          : isAnonymous
            ? t("poll.systemEvent.changedAnonymous", opts)
            : t("poll.systemEvent.changed", opts);
      case "closed":
        return t("poll.systemEvent.closed", opts);
    }
  })();

  return (
    <span className={clsx(pillClassFor("info"), "inline-flex items-center gap-1.5")}>
      {text}
      {pollEvent.kind !== "closed" && pollEvent.messageId && onNavigateToMessage && (
        <button
          type="button"
          onClick={() => onNavigateToMessage(pollEvent.messageId)}
          className="font-semibold text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
        >
          {t("poll.systemEvent.view")}
        </button>
      )}
    </span>
  );
};

// One reminder-event pill ("Bạn tạo nhắc hẹn mới <content> - <when> . Xem").
const ReminderEventPill: React.FC<{
  reminderEvent: ReminderEvent;
  currentUserId?: string;
  onNavigateToMessage?: (messageId: string) => void;
}> = ({ reminderEvent, currentUserId, onNavigateToMessage }) => {
  const { t } = useTranslation("chat");
  const isYou = !!currentUserId && reminderEvent.actorId === currentUserId;
  const opts = { content: reminderEvent.content, actor: reminderEvent.actorName ?? "" };
  const text = (() => {
    switch (reminderEvent.kind) {
      case "created":
        return isYou
          ? t("reminder.systemEvent.createdByYou", opts)
          : t("reminder.systemEvent.created", opts);
      case "updated":
        return isYou
          ? t("reminder.systemEvent.updatedByYou", opts)
          : t("reminder.systemEvent.updated", opts);
      case "cancelled":
        return isYou
          ? t("reminder.systemEvent.cancelledByYou", opts)
          : t("reminder.systemEvent.cancelled", opts);
      case "fired":
        return t("reminder.systemEvent.fired", opts);
    }
  })();

  return (
    <span className={clsx(pillClassFor("info"), "inline-flex items-center gap-1.5")}>
      {text}
      {reminderEvent.kind !== "cancelled" && reminderEvent.messageId && onNavigateToMessage && (
        <button
          type="button"
          onClick={() => onNavigateToMessage(reminderEvent.messageId)}
          className="font-semibold text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
        >
          {t("reminder.systemEvent.view")}
        </button>
      )}
    </span>
  );
};

export const SystemMessage: React.FC<SystemMessageProps> = ({
  message,
  collapsedMessages,
  className,
  onNavigateToMessage,
}) => {
  const { t } = useTranslation("chat");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [expanded, setExpanded] = React.useState(false);

  const pollEvent = getPollEvent(message);
  const reminderEvent = getReminderEvent(message);

  if (reminderEvent) {
    return (
      <div className="mt-4 mb-1 flex flex-col items-center gap-1.5">
        <ReminderEventPill
          reminderEvent={reminderEvent}
          currentUserId={currentUserId}
          onNavigateToMessage={onNavigateToMessage}
        />
      </div>
    );
  }

  if (pollEvent) {
    // Older folded pills (oldest→newest), shown only when expanded.
    const older = (collapsedMessages ?? [])
      .map((m) => getPollEvent(m))
      .filter((e): e is PollEvent => e !== null);
    const hiddenCount = older.length;

    // Khít với card poll ngay bên dưới (sau bump seq, card poll có seq mới nhất
    // nên nằm dưới pill cùng poll) — cụm "Xem thêm" + pill + card đi liền như Zalo.
    return (
      <div className="mt-4 mb-1 flex flex-col items-center gap-1.5">
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full px-3 py-1 text-[11px] font-medium text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
          >
            {t("poll.systemEvent.showMore", { count: hiddenCount })}
          </button>
        )}
        {expanded &&
          older.map((e, i) => (
            <PollEventPill
              key={e.messageId + i}
              pollEvent={e}
              currentUserId={currentUserId}
              onNavigateToMessage={onNavigateToMessage}
            />
          ))}
        <PollEventPill
          pollEvent={pollEvent}
          currentUserId={currentUserId}
          onNavigateToMessage={onNavigateToMessage}
        />
      </div>
    );
  }

  return (
    <div className={clsx("my-4 flex justify-center", className)}>
      <span className={pillClassFor(resolveSeverity(message))}>{message.content}</span>
    </div>
  );
};

export default SystemMessage;
