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

type RoomItemVisualState =
  | "default"
  | "hover"
  | "active"
  | "unread"
  | "muted"
  | "mention";

interface RoomItemStateStyles {
  container: string;
  title: string;
  preview: string;
  time: string;
  timeBadge: string;
  unreadBadge: string;
}

const ROOM_ITEM_STATE_MAP: Record<RoomItemVisualState, RoomItemStateStyles> = {
  default: {
    container: "bg-transparent",
    title: "text-text-primary",
    preview: "text-text-muted",
    time: "text-text-muted",
    timeBadge: "bg-transparent text-text-muted",
    unreadBadge:
      "bg-[hsl(var(--chat-badge-bg))] text-text-inverse",
  },
  hover: {
    container:
      "hover:bg-surface-hover/90 data-[keyboard-active=true]:bg-surface-hover/90",
    title:
      "group-hover:text-text-primary group-data-[keyboard-active=true]:text-text-primary",
    preview:
      "group-hover:text-text-secondary group-data-[keyboard-active=true]:text-text-secondary",
    time:
      "group-hover:text-text-secondary group-data-[keyboard-active=true]:text-text-secondary",
    timeBadge:
      "group-hover:bg-surface-overlay/95 group-hover:text-text-secondary group-data-[keyboard-active=true]:bg-surface-overlay/95 group-data-[keyboard-active=true]:text-text-secondary",
    unreadBadge: "",
  },
  active: {
    container: "bg-[hsl(var(--chat-active-surface)/0.18)]",
    title: "text-text-primary",
    preview: "text-text-secondary",
    time: "text-primary",
    timeBadge:
      "bg-[hsl(var(--chat-active-surface)/0.18)] text-primary",
    unreadBadge:
      "bg-[hsl(var(--chat-badge-bg))] text-text-inverse",
  },
  unread: {
    container: "bg-[hsl(var(--chat-active-surface)/0.1)]",
    title: "text-text-primary",
    preview: "text-text-secondary",
    time: "text-primary",
    timeBadge:
      "bg-[hsl(var(--chat-badge-bg)/0.16)] text-primary",
    unreadBadge:
      "bg-[hsl(var(--chat-badge-bg))] text-text-inverse",
  },
  muted: {
    container: "bg-transparent",
    title: "text-text-primary",
    preview: "text-text-muted/90",
    time: "text-text-muted",
    timeBadge: "bg-surface-overlay/70 text-text-muted",
    unreadBadge: "bg-text-muted text-text-inverse",
  },
  mention: {
    container: "bg-danger/10",
    title: "text-text-primary",
    preview: "text-text-secondary",
    time: "text-danger",
    timeBadge: "bg-danger/12 text-danger",
    unreadBadge: "bg-danger text-text-inverse",
  },
};

const resolveRoomItemVisualState = ({
  isActive,
  hasUnreadMention,
  unreadCount,
  isMuted,
}: {
  isActive: boolean;
  hasUnreadMention: boolean;
  unreadCount: number;
  isMuted: boolean;
}): RoomItemVisualState => {
  if (isActive) {
    return "active";
  }

  if (hasUnreadMention) {
    return "mention";
  }

  if (unreadCount > 0) {
    return "unread";
  }

  if (isMuted) {
    return "muted";
  }

  return "default";
};

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
  const visualState = resolveRoomItemVisualState({
    isActive,
    hasUnreadMention,
    unreadCount,
    isMuted: Boolean(conversation.isMuted),
  });
  const visualStyles = ROOM_ITEM_STATE_MAP[visualState];
  const hoverStyles = !isActive ? ROOM_ITEM_STATE_MAP.hover : null;
  const shouldEmphasizeUnreadPreview =
    visualState === "unread" || visualState === "mention";
  const previewToneClass =
    previewState === "failed" ? "text-danger" : visualStyles.preview;
  const timeBadgeClasses =
    timeLabel.length > 0 && (visualState === "active" || shouldEmphasizeUnreadPreview)
      ? visualStyles.timeBadge
      : visualState === "muted"
        ? visualStyles.timeBadge
        : "bg-transparent";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      role="option"
      aria-selected={isActive}
      data-room-state={visualState}
      data-keyboard-active={isKeyboardActive}
      className={clsx(
        "group relative mx-2 my-0.5 flex h-[var(--size-room-item)] w-[calc(100%-var(--space-4))] items-center rounded-[1rem] px-3 text-left",
        "transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        visualStyles.container,
        hoverStyles?.container,
      )}
      aria-label={displayName}
    >
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-2.5">
        {isDirect ? (
          <Avatar
            src={avatarSrc}
            alt={displayName}
            size="md"
            status={avatarStatus}
            showStatus
          />
        ) : (
          <GroupAvatar
            conversation={conversation}
            currentUserId={currentUserId}
            size="md"
          />
        )}

        <div className="min-w-0 text-left">
          <p
            className={clsx(
              "truncate text-left text-[14px] font-semibold leading-5",
              visualStyles.title,
              hoverStyles?.title,
            )}
          >
            {displayName}
          </p>

          <p
            className={clsx(
              "truncate pr-1 text-left text-[13px] leading-5",
              hoverStyles?.preview,
              previewToneClass,
            )}
            style={{
              fontWeight:
                previewState === "failed" || shouldEmphasizeUnreadPreview
                  ? "var(--chat-unread-preview-weight)"
                  : "400",
            }}
          >
            {previewText || t("sidebar:room.noMessagesYet")}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-center gap-1">
          <span
            className={clsx(
              "inline-flex min-h-5 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              visualStyles.time,
              timeBadgeClasses,
              hoverStyles?.time,
              hoverStyles?.timeBadge,
            )}
          >
            {timeLabel}
          </span>

          {unreadCount > 0 ? (
            <span
              className={clsx(
                "sidebar-unread-badge inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none",
                visualStyles.unreadBadge,
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
        () => (state) => state.conversationById[conversationId] ?? null,
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
