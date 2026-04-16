import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { GroupAvatar } from "../../common/GroupAvatar";
import { useChatStore, usePresenceStore } from "../../../stores";
import type { Conversation, UserStatus, UserSummary } from "../../../types";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getMessagePreview,
  getMessagePreviewState,
  getOtherParticipant,
  getUserDisplayName,
  truncateTextWithEllipsis,
} from "../../../utils/messageHelpers";
import { hasConversationMention } from "../../../utils/conversationRanking";
import { formatRelativeTime } from "../../../utils/formatTime";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import i18n from "../../../i18n";

interface RoomItemContainerProps {
  conversationId: string;
  currentUser: UserSummary;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

interface RoomItemViewProps {
  conversation: Conversation;
  currentUserId: string;
  displayName: string;
  previewText: string;
  previewState: ReturnType<typeof getMessagePreviewState>;
  timeLabel: string;
  unreadCount: number;
  unreadLabel: string;
  hasUnreadMention: boolean;
  avatarSrc?: string;
  avatarStatus?: UserStatus;
  isDirect: boolean;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

const resolvePresenceStatus = (
  presenceState: string | undefined,
  fallbackStatus: string | undefined,
): UserStatus | undefined => {
  const nextStatus = presenceState || fallbackStatus;
  if (
    nextStatus === "online" ||
    nextStatus === "offline" ||
    nextStatus === "away" ||
    nextStatus === "idle" ||
    nextStatus === "dnd" ||
    nextStatus === "busy" ||
    nextStatus === "invisible"
  ) {
    return nextStatus as UserStatus;
  }

  return undefined;
};

const buildPreviewText = (
  conversation: Conversation,
  currentUser: Pick<UserSummary, "id" | "displayName" | "username">,
): string => {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) return "";

  const messagePreview = getMessagePreview(lastMessage, currentUser.id, 240);
  if (!messagePreview) return "";

  if (lastMessage.type === "system" || isDirectConversation(conversation)) {
    return truncateTextWithEllipsis(messagePreview, 52);
  }

  const directPartner = getOtherParticipant(conversation, currentUser.id);
  const senderParticipant = (conversation.participants || []).find(
    (participant) => participant.id === lastMessage.senderId,
  );

  const senderLabel =
    lastMessage.senderId === currentUser.id
      ? i18n.t("chat:message.you")
      : getUserDisplayName(senderParticipant) ||
        getUserDisplayName(directPartner) ||
        lastMessage.senderName?.trim() ||
        i18n.t("common:labels.conversation");

  return truncateTextWithEllipsis(`${senderLabel}: ${messagePreview}`, 52);
};

const RoomItemViewComponent: React.FC<RoomItemViewProps> = ({
  conversation,
  currentUserId,
  displayName,
  previewText,
  previewState,
  timeLabel,
  unreadCount,
  unreadLabel,
  hasUnreadMention,
  avatarSrc,
  avatarStatus,
  isDirect,
  isActive,
  isKeyboardActive,
  onSelect,
}) => {
  const { t } = useTranslation();

  const previewToneClass = (() => {
    if (previewState === "failed") {
      return "text-danger";
    }

    if (previewState || hasUnreadMention || unreadCount > 0) {
      return "text-text-secondary";
    }

    return "text-text-muted";
  })();

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      role="option"
      aria-selected={isActive}
      className={clsx(
        "group relative mx-2 my-1 flex h-[var(--size-room-item)] w-[calc(100%-var(--space-4))] items-center rounded-[1.15rem] px-3.5 text-left",
        "transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isActive
          ? "bg-primary/8 shadow-[inset_0_0_0_1px_hsl(var(--color-primary)/0.08)]"
          : "hover:bg-surface-hover/80",
        !isActive && isKeyboardActive && "bg-surface-overlay",
      )}
      aria-label={displayName}
    >
      <span
        className={clsx(
          "absolute bottom-2 left-1.5 top-2 w-0.5 rounded-full transition-fast",
          isActive ? "bg-primary opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3">
        {isDirect ? (
          <Avatar
            src={avatarSrc}
            alt={displayName}
            size="lg"
            status={avatarStatus}
            showStatus
          />
        ) : (
          <GroupAvatar
            conversation={conversation}
            currentUserId={currentUserId}
            size="lg"
          />
        )}

        <div className="min-w-0 text-left">
          <p className="truncate text-left text-[15px] font-semibold leading-5 text-text-primary">
            {displayName}
          </p>

          <p
            className={clsx(
              "truncate pr-1 text-left text-[13px] leading-5",
              previewState === "failed" ? "font-medium" : "font-normal",
              previewToneClass,
            )}
          >
            {previewText || t("sidebar:room.noMessagesYet")}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-start gap-2 py-1">
          <span className="text-[12px] tabular-nums text-text-muted">
            {timeLabel}
          </span>

          {unreadCount > 0 ? (
            <span
              className={clsx(
                "sidebar-unread-badge inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none text-text-inverse",
                hasUnreadMention
                  ? "bg-danger"
                  : conversation.isMuted
                    ? "bg-text-muted"
                    : "bg-primary",
              )}
            >
              {unreadLabel}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
};

const RoomItemView = React.memo(
  RoomItemViewComponent,
  (prev, next) =>
    prev.conversation === next.conversation &&
    prev.currentUserId === next.currentUserId &&
    prev.displayName === next.displayName &&
    prev.previewText === next.previewText &&
    prev.previewState === next.previewState &&
    prev.timeLabel === next.timeLabel &&
    prev.unreadCount === next.unreadCount &&
    prev.unreadLabel === next.unreadLabel &&
    prev.hasUnreadMention === next.hasUnreadMention &&
    prev.avatarSrc === next.avatarSrc &&
    prev.avatarStatus === next.avatarStatus &&
    prev.isDirect === next.isDirect &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.onSelect === next.onSelect,
);

export const RoomItemContainer = React.memo(
  ({
    conversationId,
    currentUser,
    isActive,
    isKeyboardActive,
    onSelect,
  }: RoomItemContainerProps) => {
    const conversation = useChatStore(
      useMemo(
        () => (state) =>
          state.conversations.find((item) => item.id === conversationId) ?? null,
        [conversationId],
      ),
    );
    const directPartnerId = useMemo(
      () => (conversation ? getOtherParticipant(conversation, currentUser.id)?.id ?? null : null),
      [conversation, currentUser.id],
    );
    const presenceState = usePresenceStore(
      useMemo(
        () => (state) =>
          directPartnerId ? state.presenceMap[directPartnerId]?.state : undefined,
        [directPartnerId],
      ),
    );

    const viewModel = useMemo(() => {
      if (!conversation) {
        return null;
      }

      const displayName =
        getConversationDisplayName(conversation, currentUser.id) ||
        i18n.t("common:labels.conversation");
      const previewState = getMessagePreviewState(
        conversation.lastMessage,
        currentUser.id,
      );
      const referenceTime =
        conversation.lastMessageSortAt ||
        conversation.lastMessageAt ||
        conversation.lastMessage?.createdAt;
      const unreadCount = Math.max(0, conversation.unreadCount || 0);
      const isDirect = isDirectConversation(conversation);

      return {
        conversation,
        displayName,
        previewText: buildPreviewText(conversation, currentUser),
        previewState,
        timeLabel: referenceTime
          ? formatRelativeTime(new Date(referenceTime))
          : "",
        unreadCount,
        unreadLabel: unreadCount > 99 ? "99+" : String(unreadCount),
        hasUnreadMention: hasConversationMention(conversation, currentUser),
        avatarSrc: getConversationAvatar(conversation, currentUser.id),
        avatarStatus: resolvePresenceStatus(
          presenceState,
          conversation.otherUser?.status,
        ),
        isDirect,
      };
    }, [conversation, currentUser, presenceState]);

    if (!viewModel) {
      return null;
    }

    return (
      <RoomItemView
        conversation={viewModel.conversation}
        currentUserId={currentUser.id}
        displayName={viewModel.displayName}
        previewText={viewModel.previewText}
        previewState={viewModel.previewState}
        timeLabel={viewModel.timeLabel}
        unreadCount={viewModel.unreadCount}
        unreadLabel={viewModel.unreadLabel}
        hasUnreadMention={viewModel.hasUnreadMention}
        avatarSrc={viewModel.avatarSrc}
        avatarStatus={viewModel.avatarStatus}
        isDirect={viewModel.isDirect}
        isActive={isActive}
        isKeyboardActive={isKeyboardActive}
        onSelect={onSelect}
      />
    );
  },
  (prev, next) =>
    prev.conversationId === next.conversationId &&
    prev.currentUser === next.currentUser &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.onSelect === next.onSelect,
);

export default RoomItemContainer;
