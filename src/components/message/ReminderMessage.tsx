import React from "react";
import ReactDOM from "react-dom";
import { CheckIcon } from "@heroicons/react/24/outline";
import type { ReminderInfo, ReminderResponse } from "@hacom/chat-shared-types/chat";
import clsx from "clsx";
import { messageApi } from "../../services/api";
import { toast } from "../ui";
import { useAuthStore } from "../../stores";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { chatApi, fetchConversationTail } from "../../features/api/chatApi";
import { UserProfile } from "../info/UserProfile";
import {
  loadUserProfiles,
  invalidateUserProfileSummary,
} from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { dispatchStartDirectMessage } from "../../features/chat/events/chatUiEvents";
import {
  ReminderDetailModal,
  type ResolvedProfile,
} from "./ReminderDetailModal";
import {
  reminderDateBadge,
  formatReminderWhen,
  type RepeatType,
} from "./reminderFormat";
import {
  ReminderCreateDialog,
  type ReminderCreatePayload,
} from "../../features/chat/components/ReminderCreateDialog";

interface ReminderMessageProps {
  reminder: ReminderInfo;
  isOwn: boolean;
  currentUserId?: string;
  messageId?: string;
  conversationId?: string;
  senderName?: string;
}

export const ReminderMessage: React.FC<ReminderMessageProps> = ({
  reminder,
  isOwn,
  currentUserId: currentUserIdProp,
  messageId,
  conversationId,
  senderName,
}) => {
  const storeUserId = useAuthStore((s) => s.user?.id);
  const currentUserId = currentUserIdProp ?? storeUserId;

  // My response as reflected by the server payload; re-synced on realtime/refetch.
  const serverMyResponse: ReminderResponse =
    reminder.participants.find((p) => p.userId === currentUserId)?.response ??
    "pending";
  const [myResponse, setMyResponse] = React.useState<ReminderResponse>(serverMyResponse);

  // React "adjust state on prop change" — re-seed when authoritative data moves.
  const signature =
    reminder.participants.map((p) => `${p.userId}:${p.response}`).join("|") +
    `#${reminder.isCancelled ? 1 : 0}#${reminder.remindAt}#${currentUserId ?? ""}`;
  const [syncedSignature, setSyncedSignature] = React.useState(signature);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setMyResponse(serverMyResponse);
  }

  const dispatch = useAppDispatch();
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
  const [editOpen, setEditOpen] = React.useState(false);
  const [respondMenuOpen, setRespondMenuOpen] = React.useState(false);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);
  const [profiles, setProfiles] = React.useState<Record<string, ResolvedProfile>>({});
  const respondRef = React.useRef<HTMLDivElement | null>(null);

  const isCancelled = reminder.isCancelled;
  const canRespond = !isCancelled && !reminder.isFired && !!currentUserId;

  // Batch-load participant profiles for avatars + detail list.
  const loadProfiles = React.useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    void loadUserProfiles(ids).then((results) => {
      setProfiles((prev) => {
        const nextMap = { ...prev };
        const aliasMap = useEnrichedProfileStore.getState().nameByUserId;
        for (const [id, s] of Object.entries(results)) {
          nextMap[id] = {
            name: aliasMap[id] ?? s?.displayName ?? s?.username ?? id,
            avatar:
              resolvePublicResourceUrl(
                (s as { avatar?: string })?.avatar || s?.avatarUrl || undefined,
              ) ?? null,
            position: s?.position ?? null,
            department: s?.department ?? null,
          };
        }
        return nextMap;
      });
    });
  }, []);

  React.useEffect(() => {
    const ids = [...new Set(reminder.participants.map((p) => p.userId))];
    loadProfiles(ids);
  }, [reminder.participants, loadProfiles]);

  const handleAvatarError = React.useCallback(
    (uid: string) => {
      invalidateUserProfileSummary(uid);
      loadProfiles([uid]);
    },
    [loadProfiles],
  );

  React.useEffect(() => {
    if (!respondMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (respondRef.current && !respondRef.current.contains(e.target as Node)) {
        setRespondMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [respondMenuOpen]);

  const respond = (response: "accepted" | "declined") => {
    if (!messageId || !canRespond) return;
    const prev = myResponse;
    setMyResponse(response);
    setRespondMenuOpen(false);
    messageApi
      .respondReminder(messageId, reminder.id, response)
      .then(refreshTimeline)
      .catch(() => {
        toast.error("Không thể cập nhật phản hồi");
        setMyResponse(prev);
      });
  };

  const cancelReminder = () => {
    if (!messageId) return;
    messageApi
      .cancelReminder(messageId, reminder.id)
      .then(refreshTimeline)
      .catch(() => toast.error("Không thể hủy nhắc hẹn"));
  };

  const submitEdit = (payload: ReminderCreatePayload) => {
    if (!messageId) return;
    messageApi
      .updateReminder(messageId, reminder.id, {
        content: payload.content,
        remindAt: payload.reminderDate.toISOString(),
        repeat: payload.repeatType,
      })
      .then(() => {
        toast.success("Đã cập nhật nhắc hẹn");
        refreshTimeline();
      })
      .catch(() => toast.error("Không thể cập nhật nhắc hẹn"));
  };

  const badge = reminderDateBadge(reminder.remindAt);
  const whenText = formatReminderWhen(reminder.remindAt);
  // "N người tham gia" chỉ đếm người đã bấm Tham gia (accepted) — không tính
  // người từ chối hay chưa phản hồi.
  const participantCount = reminder.participants.filter(
    (p) => p.response === "accepted",
  ).length;

  const statusLabel =
    myResponse === "accepted"
      ? "Bạn xác nhận: Tham gia."
      : myResponse === "declined"
        ? "Bạn xác nhận: Từ chối."
        : "Bạn chưa phản hồi.";

  return (
    <div className="min-w-[300px] max-w-[360px] overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm">
      {/* Body: date badge + content + time + participants */}
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="flex w-full items-start gap-3 px-3.5 pt-3.5 pb-3 text-left transition-colors hover:bg-surface-overlay/40 focus-visible:outline-none"
      >
        {/* Date badge */}
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

        {/* Details */}
        <div className="min-w-0 flex-1 pt-0.5">
          <p
            className={clsx(
              "truncate text-[15px] font-semibold leading-snug text-text-primary",
              isCancelled && "line-through text-text-muted",
            )}
          >
            {reminder.content}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[12.5px] text-text-secondary">
            <svg className="h-3.5 w-3.5 shrink-0 text-text-muted" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {whenText}
          </p>
          {participantCount > 0 && (
            <span className="mt-1 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[#1565C0]">
              {participantCount} người tham gia
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      </button>

      {isCancelled ? (
        <div className="border-t border-border/60 px-3.5 py-2.5 text-[12.5px] font-medium text-text-muted">
          Nhắc hẹn đã bị hủy
        </div>
      ) : (
        /* Status row: "✓ Bạn xác nhận: Tham gia. | Thay đổi" */
        <div className="relative flex items-center justify-between gap-2 border-t border-border/60 bg-surface-overlay/30 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
            {myResponse === "accepted" && (
              <CheckIcon className="h-4 w-4 text-[#1565C0]" strokeWidth={2.5} />
            )}
            {myResponse === "declined" && (
              <span className="text-danger">✕</span>
            )}
            {statusLabel}
          </span>

          {canRespond && (
            <div ref={respondRef} className="relative">
              <button
                type="button"
                onClick={() => setRespondMenuOpen((o) => !o)}
                className="text-[12.5px] font-semibold text-[#1565C0] transition-colors hover:text-[#1976D2] focus-visible:outline-none"
              >
                Thay đổi
              </button>
              {respondMenuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-[130px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => respond("accepted")}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-overlay"
                  >
                    Tham gia
                    {myResponse === "accepted" && (
                      <CheckIcon className="h-4 w-4 text-[#1565C0]" strokeWidth={2.5} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => respond("declined")}
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

      {/* Detail modal */}
      <ReminderDetailModal
        reminder={reminder}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        isOwn={isOwn}
        senderName={senderName}
        currentUserId={currentUserId}
        myResponse={myResponse}
        canRespond={canRespond}
        profiles={profiles}
        onRespond={respond}
        onEdit={
          isOwn && !isCancelled
            ? () => {
                setDetailOpen(false);
                setEditOpen(true);
              }
            : undefined
        }
        onCancel={isOwn && !isCancelled ? cancelReminder : undefined}
        onViewProfile={(uid) => {
          setDetailOpen(false);
          setViewingUserId(uid);
        }}
        onAvatarError={handleAvatarError}
      />

      {/* Edit dialog (reuses create dialog in edit mode) */}
      <ReminderCreateDialog
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={submitEdit}
        mode="edit"
        initialContent={reminder.content}
        initialDate={new Date(reminder.remindAt)}
        initialRepeat={reminder.repeat as RepeatType}
      />

      {/* Profile modal — same portal pattern as PollMessage */}
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
                  const p = profiles[viewingUserId];
                  return p
                    ? {
                        id: viewingUserId,
                        username: viewingUserId,
                        displayName: p.name,
                        avatar: p.avatar ?? undefined,
                      }
                    : null;
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

export default ReminderMessage;
