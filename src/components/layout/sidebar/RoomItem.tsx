import React, { useEffect, useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { GroupAvatar } from "../../common/GroupAvatar";
import {
  useChatStore,
  usePresenceStore,
  resolveLivePresenceStatus,
} from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import { useFriendshipStore } from "../../../stores/friendshipStore";
import { enrichUserProfile } from "../../../services/enrichUserProfile";
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
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface RoomItemContainerProps {
  conversationId: string;
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

interface RoomItemViewProps {
  conversation: Conversation;
  layoutState: ChatLayoutState;
  currentUserId: string;
  displayName: string;
  previewText: string;
  previewState: ReturnType<typeof getMessagePreviewState>;
  timeLabel: string;
  unreadCount: number;
  hasUnreadMention: boolean;
  avatarSrc?: string;
  avatarStatus?: UserStatus;
  isDirect: boolean;
  isActive: boolean;
  isKeyboardActive: boolean;
  isPinned: boolean;
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
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",
  },
  hover: {
    container:
      "hover:bg-surface-hover/70 data-[keyboard-active=true]:bg-surface-hover/70",
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
    container: "bg-[#1565C0]/20 ring-1 ring-inset ring-[#1976D2]/40",
    title: "text-[#0D3F7A] font-bold",
    preview: "text-text-primary font-medium",
    time: "text-text-secondary",
    timeBadge:
      "bg-transparent text-text-secondary",
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",
  },
  unread: {
    container: "bg-transparent",
    title: "text-text-primary",
    preview: "text-text-secondary",
    time: "text-text-secondary",
    timeBadge:
      "bg-transparent text-text-secondary",
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",
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
    container: "bg-danger/6",
    title: "text-text-primary",
    preview: "text-text-secondary",
    time: "text-danger",
    timeBadge: "bg-transparent text-danger",
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

  const resolvedName =
    getUserDisplayName(senderParticipant) ||
    getUserDisplayName(directPartner) ||
    lastMessage.senderName?.trim() ||
    "";

  // Suppress identifier-like values (employee codes, system usernames) as prefix.
  const IDENTIFIER_RE = /^[A-Za-z0-9_.@-]+$/;
  const nameIsUsable =
    resolvedName.length > 0 &&
    !(IDENTIFIER_RE.test(resolvedName) && !resolvedName.includes(" "));

  const senderLabel =
    lastMessage.senderId === currentUser.id
      ? i18n.t("chat:message.you")
      : nameIsUsable
        ? resolvedName
        : null;

  return truncateTextWithEllipsis(
    senderLabel ? `${senderLabel}: ${messagePreview}` : messagePreview,
    52,
  );
};

const RoomItemViewComponent: React.FC<RoomItemViewProps> = ({
  conversation,
  layoutState,
  currentUserId,
  displayName,
  previewText,
  previewState,
  timeLabel,
  unreadCount,
  hasUnreadMention,
  avatarSrc,
  avatarStatus,
  isDirect,
  isActive,
  isKeyboardActive,
  isPinned,
  onSelect,
}) => {
  const { t } = useTranslation();
  const isDense = layoutState !== "normal";
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
      data-render-probe="conversation-item"
      className={clsx(
        "group relative mx-1 flex h-[var(--size-room-item)] w-[calc(100%-0.5rem)] items-center text-left",
        "transition-micro active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isDense ? "rounded-md px-2" : "rounded-lg px-2.5",
        visualStyles.container,
        hoverStyles?.container,
      )}
      aria-label={displayName}
    >
     
      <div
        className={clsx(
          "grid w-full grid-cols-[auto,1fr,auto] items-center",
          isDense ? "gap-2" : "gap-2.5",
        )}
      >
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
          <div className="flex min-w-0 items-center gap-1">
            {isPinned && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-[#1976D2]/70"
                role="img"
                aria-label="Đã ghim"
              >
                <path d="M12 16V21" />
                <path d="M8 5.2918C8 5.02079 8 4.88529 8.01312 4.77132C8.1194 3.84789 8.84789 3.1194 9.77133 3.01312C9.88529 3 10.0208 3 10.2918 3H13.7082C13.9792 3 14.1147 3 14.2287 3.01312C15.1521 3.1194 15.8806 3.84789 15.9869 4.77132C16 4.88529 16 5.02079 16 5.2918C16 5.37885 16 5.42237 15.9967 5.46264C15.9708 5.78281 15.7927 6.07104 15.5179 6.2374C15.4834 6.25832 15.4444 6.27779 15.3666 6.31672L15.1055 6.44726C14.7021 6.64897 14.5003 6.74983 14.3681 6.90564C14.26 7.03286 14.1856 7.18509 14.1515 7.34846C14.1097 7.54854 14.1539 7.76968 14.2424 8.21197L15 12H15.3333C15.9533 12 16.2633 12 16.5176 12.0681C17.2078 12.2531 17.7469 12.7922 17.9319 13.4824C18 13.7367 18 14.0467 18 14.6667C18 14.9767 18 15.1317 17.9659 15.2588C17.8735 15.6039 17.6039 15.8735 17.2588 15.9659C17.1317 16 16.9767 16 16.6667 16H7.33333C7.02334 16 6.86835 16 6.74118 15.9659C6.39609 15.8735 6.12654 15.6039 6.03407 15.2588C6 15.1317 6 14.9767 6 14.6667C6 14.0467 6 13.7367 6.06815 13.4824C6.25308 12.7922 6.79218 12.2531 7.48236 12.0681C7.73669 12 8.04669 12 8.66667 12H9L9.75761 8.21197C9.84606 7.76968 9.89029 7.54854 9.84852 7.34846C9.81441 7.18509 9.73995 7.03286 9.63194 6.90564C9.49965 6.74983 9.29794 6.64897 8.89452 6.44726L8.63344 6.31672C8.55558 6.27779 8.51665 6.25832 8.48208 6.2374C8.20731 6.07104 8.02917 5.78281 8.00326 5.46264C8 5.42237 8 5.37885 8 5.2918Z" />
              </svg>
            )}
            <p
              className={clsx(
                "min-w-0 truncate text-left font-medium",
                isDense
                  ? "text-[13px] leading-[1.05rem]"
                  : "text-[14px] leading-[1.1rem]",
                visualStyles.title,
                hoverStyles?.title,
              )}
              title={displayName}
            >
              {displayName}
            </p>
          </div>

          <p
            className={clsx(
              "mt-0.5 truncate pr-1 text-left",
              isDense
                ? "text-[11px] leading-[0.95rem]"
                : "text-[12px] leading-[1rem]",
              hoverStyles?.preview,
              previewToneClass,
            )}
            title={previewText || t("sidebar:room.noMessagesYet")}
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

        <div
          className={clsx(
            "flex h-full min-w-room-meta flex-col items-end justify-center",
            isDense ? "gap-1" : "gap-1.5",
          )}
        >
          <span
            className={clsx(
              "inline-flex items-center rounded-full font-medium tabular-nums",
              isDense
                ? "min-h-4 px-1 py-0 text-[10px]"
                : "min-h-4 px-1 py-0 text-[11px]",
              visualStyles.time,
              timeBadgeClasses,
              hoverStyles?.time,
              hoverStyles?.timeBadge,
            )}
          >
            {timeLabel}
          </span>

          {unreadCount > 0 && (
            <span
              className={clsx(
                "inline-flex items-center justify-center rounded-full font-semibold tabular-nums",
                isDense ? "min-h-4 min-w-4 px-1 text-[10px]" : "min-h-4 min-w-4 px-1 text-[11px]",
                visualStyles.unreadBadge,
              )}
              aria-label={t("sidebar:room.unreadBadge", { count: unreadCount })}
            >
              {unreadCount > 99 ? "99+" : String(unreadCount)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

const RoomItemView = React.memo(
  RoomItemViewComponent,
  (prev, next) =>
    prev.conversation === next.conversation &&
    prev.layoutState === next.layoutState &&
    prev.currentUserId === next.currentUserId &&
    prev.displayName === next.displayName &&
    prev.previewText === next.previewText &&
    prev.previewState === next.previewState &&
    prev.timeLabel === next.timeLabel &&
    prev.unreadCount === next.unreadCount &&
    prev.hasUnreadMention === next.hasUnreadMention &&
    prev.avatarSrc === next.avatarSrc &&
    prev.avatarStatus === next.avatarStatus &&
    prev.isDirect === next.isDirect &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.isPinned === next.isPinned &&
    prev.onSelect === next.onSelect,
);

export const RoomItemContainer = React.memo(
  ({
    conversationId,
    layoutState,
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
    const isPinned = useUIStore(
      useMemo(() => (state) => state.pinnedConversationIds.includes(conversationId), [conversationId]),
    );
    const directPartnerId = useMemo(
      () => (conversation ? getOtherParticipant(conversation, currentUser.id)?.id ?? null : null),
      [conversation, currentUser.id],
    );
    const livePresence = usePresenceStore(
      useMemo(
        () => (state) =>
          directPartnerId ? state.presenceMap[directPartnerId] : undefined,
        [directPartnerId],
      ),
    );

    // Fetch full profile once for DM partners so the sidebar shows the real
    // name instead of an email address or employee code. enrichUserProfile is
    // TTL-cached so repeated mounts are cheap.
    const enrichedName = useEnrichedProfileStore(
      useMemo(
        () => (s) => (directPartnerId ? s.nameByUserId[directPartnerId] : undefined),
        [directPartnerId],
      ),
    );
    // "tên gợi nhớ" (alias) read straight from the authoritative friend index —
    // not the enrichedProfileStore injection, which only covers page-1 friends
    // and races enrichUserProfile. This makes the sidebar alias reliable.
    const alias = useFriendshipStore(
      useMemo(
        () => (s) => (directPartnerId ? s.friendByUserId[directPartnerId]?.alias ?? undefined : undefined),
        [directPartnerId],
      ),
    );
    useEffect(() => {
      if (directPartnerId) enrichUserProfile(directPartnerId);
    }, [directPartnerId]);

    const viewModel = useMemo(() => {
      if (!conversation) {
        return null;
      }

      const displayName =
        alias ||
        enrichedName ||
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
        // Live presence (WS) only — never the backend `otherUser.status` field.
        avatarStatus: isDirect
          ? resolveLivePresenceStatus(livePresence)
          : undefined,
        isDirect,
      };
    }, [conversation, currentUser, livePresence, enrichedName, alias]);

    if (!viewModel) {
      return null;
    }

    return (
      <RoomItemView
        conversation={viewModel.conversation}
        layoutState={layoutState}
        currentUserId={currentUser.id}
        displayName={viewModel.displayName}
        previewText={viewModel.previewText}
        previewState={viewModel.previewState}
        timeLabel={viewModel.timeLabel}
        unreadCount={viewModel.unreadCount}
        hasUnreadMention={viewModel.hasUnreadMention}
        avatarSrc={viewModel.avatarSrc}
        avatarStatus={viewModel.avatarStatus}
        isDirect={viewModel.isDirect}
        isActive={isActive}
        isKeyboardActive={isKeyboardActive}
        isPinned={isPinned}
        onSelect={onSelect}
      />
    );
  },
  (prev, next) =>
    prev.conversationId === next.conversationId &&
    prev.layoutState === next.layoutState &&
    prev.currentUser === next.currentUser &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.onSelect === next.onSelect,
);

export default RoomItemContainer;
