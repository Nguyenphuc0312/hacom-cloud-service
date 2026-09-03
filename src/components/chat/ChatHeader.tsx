import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Pin, PanelLeft } from "lucide-react";
import { Avatar } from "../common/Avatar";
import { GroupAvatar } from "../common/GroupAvatar";
import { TypingIndicator } from "../common/TypingIndicator";
import { ConversationLane } from "../layout/ConversationLane";
import { usePresenceStore, resolveLivePresenceStatus } from "../../stores";
import { UserStatus } from "../../types";
import type { Conversation, TypingStatus } from "../../types";
import {
  isDirectConversation,
  normalizeRoomType,
} from "../../lib/conversationAdapter";
import {
  isPersonalCloudConversation,
  personalCloudPresentation,
} from "../../features/cloud/personalCloudPolicy";
import { PersonalCloudAvatar } from "../../features/cloud/components/PersonalCloudAvatar";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getOtherParticipant,
} from "../../utils/messageHelpers";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { formatCalendarDateTime } from "../../utils/formatTime";

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId: string;
  typingStatus?: TypingStatus;
  typingStatuses?: TypingStatus[];
  onBack?: () => void;
  onInfoClick: () => void;
  onCallClick?: () => void;
  onVideoCallClick?: () => void;
  onSearchClick?: () => void;
  onPinnedClick?: () => void;
  titleOverride?: string;
  subtitleOverride?: string;
  avatarOverride?: React.ReactNode;
  onSelectionMode?: () => void;
  className?: string;
}

const iconButtonClass = clsx(
  "chat-header-action inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md border border-transparent",
  "text-text-muted transition-micro",
  "hover:bg-surface-hover/80 hover:text-brand-solid",
  "active:scale-[0.98] active:bg-surface-active",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
);

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  currentUserId,
  typingStatus,
  typingStatuses,
  onBack,
  onInfoClick,
  onCallClick,
  onVideoCallClick,
  onSearchClick,
  onPinnedClick,
  titleOverride,
  subtitleOverride,
  avatarOverride,
  className,
}) => {
  const { t } = useTranslation();
  const otherUser = getOtherParticipant(conversation, currentUserId);
  const normalizedType = normalizeRoomType(
    conversation.type,
    conversation.participants?.length,
  );
  const isDirect = isDirectConversation(conversation);
  const isPersonalCloud = isPersonalCloudConversation(conversation);
  const otherUserId = otherUser?.id;
  const livePresence = usePresenceStore((s) =>
    otherUserId ? s.presenceMap[otherUserId] : undefined,
  );
  // Live presence (WS) is the only source of truth — never `otherUser.status`.
  const liveStatus = resolveLivePresenceStatus(livePresence);
  const isOnline = liveStatus === UserStatus.ONLINE;
  const activeTypingStatuses = React.useMemo(() => {
    const statuses =
      typingStatuses && typingStatuses.length > 0
        ? typingStatuses
        : typingStatus
          ? [typingStatus]
          : [];

    return statuses.filter((status) => status.isTyping);
  }, [typingStatus, typingStatuses]);
  const primaryTypingStatus = activeTypingStatuses[0] ?? typingStatus;
  const isTyping = activeTypingStatuses.length > 0;
  const statusText = (() => {
    if (isTyping) return "";

    // Cloud của tôi không có thành viên — nhánh group bên dưới sẽ hiện "0 thành viên".
    if (isPersonalCloud) return personalCloudPresentation.subtitle;

    if (normalizedType === "group") {
      return t("chat:header.members", {
        count: conversation.participants?.length ?? 0,
      });
    }

    if (normalizedType === "channel") {
      return t("chat:header.channel");
    }

    if (otherUser) {
      if (isOnline) return t("common:status.online");
      if (livePresence?.lastSeenAt) {
        return t("common:status.lastSeen", {
          time: formatCalendarDateTime(new Date(livePresence.lastSeenAt)),
        });
      }
      return t("common:status.offline");
    }

    return "";
  })();

  const rawDisplayName =
    getConversationDisplayName(conversation, currentUserId) ||
    t("common:labels.conversation");

  // For DM conversations, fetch the full profile once into enrichedProfileStore so
  // the name persists across API/WS refreshes. The store is separate from conversation
  // data so it cannot be overwritten by incoming conversation updates.
  const enrichedName = useEnrichedProfileStore(
    React.useMemo(() => (s) => (otherUserId ? s.nameByUserId[otherUserId] : undefined), [otherUserId]),
  );
  // "tên gợi nhớ" (alias) straight from the authoritative friend index — reliable
  // regardless of the enrichedProfileStore injection race / friends pagination.
  const alias = useFriendshipStore(
    React.useMemo(
      () => (s) => (otherUserId ? s.friendByUserId[otherUserId]?.alias ?? undefined : undefined),
      [otherUserId],
    ),
  );
  React.useEffect(() => {
    if (isDirect && otherUserId) enrichUserProfile(otherUserId);
  }, [isDirect, otherUserId]);

  const displayName = isPersonalCloud
    ? personalCloudPresentation.title
    : alias ?? enrichedName ?? rawDisplayName;
  const avatarSrc = getConversationAvatar(conversation, currentUserId);

  return (
    <header
      className={clsx(
        "chat-header sticky top-0 z-sticky border-b border-border/70 bg-surface",
        className,
      )}
    >
      <ConversationLane>
        <div className="chat-header-row flex min-h-[var(--app-header-height)] items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={clsx(iconButtonClass, "md:hidden")}
              aria-label={t("chat:header.back")}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onInfoClick}
            className={clsx(
              "chat-header-avatar-button inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] shrink-0 items-center justify-center rounded-full",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:header.viewInfo")}
          >
            {avatarOverride ?? (isPersonalCloud ? (
              <PersonalCloudAvatar size="md" className="chat-header-avatar" />
            ) : isDirect ? (
              <Avatar
                src={avatarSrc}
                alt={displayName}
                size="md"
                status={liveStatus}
                showStatus={isDirect}
                presenceAnimation="recent-online"
                className="chat-header-avatar"
              />
            ) : (
              <GroupAvatar
                conversation={conversation}
                currentUserId={currentUserId}
                size="md"
                alt={displayName}
                className="chat-header-avatar"
              />
            ))}
          </button>

          <button
            type="button"
            onClick={onInfoClick}
            className={clsx(
              "min-w-0 flex-1 rounded-md px-2 py-1 text-left transition-fast hover:bg-surface-hover/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
          >
            <h2 className="chat-header-title truncate text-[15px] font-medium leading-5 text-text-primary">
              {titleOverride ?? displayName}
            </h2>

            {isTyping ? (
              <TypingIndicator
                userName={primaryTypingStatus?.userName}
                userNames={activeTypingStatuses.map(
                  (status) => status.userName,
                )}
                activity={primaryTypingStatus?.activity}
                confidence={primaryTypingStatus?.confidence}
              />
            ) : (
              <p
                className={clsx(
                  "chat-header-subtitle truncate text-[12px] leading-4",
                  isOnline ? "text-text-secondary" : "text-text-muted",
                )}
              >
                {subtitleOverride ?? statusText}
              </p>
            )}
          </button>

          <div className="relative ml-1 flex items-center gap-0.5">
            {onSearchClick && (
              <button
                type="button"
                onClick={onSearchClick}
                className={iconButtonClass}
                aria-label={t("chat:header.searchInChat")}
              >
                <MagnifyingGlassIcon className="h-[18px] w-[18px]" />
              </button>
            )}

            {onPinnedClick && (
              <button
                type="button"
                onClick={onPinnedClick}
                className={iconButtonClass}
                aria-label={t("chat:pinned.title")}
              >
                <Pin
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.5}
                />
              </button>
            )}

            {onCallClick && !isPersonalCloud && (
              <button
                type="button"
                onClick={onCallClick}
                className={iconButtonClass}
                aria-label={t("chat:header.voiceCall")}
              >
                <PhoneIcon className="h-[18px] w-[18px]" />
              </button>
            )}

            {onVideoCallClick && !isPersonalCloud && (
              <button
                type="button"
                onClick={onVideoCallClick}
                className={iconButtonClass}
                aria-label={t("chat:header.videoCall")}
              >
                <VideoCameraIcon className="h-[18px] w-[18px]" />
              </button>
            )}

            <button
              type="button"
              onClick={onInfoClick}
              className={iconButtonClass}
              aria-label={t("chat:header.toggleInfoPanel")}
            >
              <PanelLeft
                className="h-[18px] w-[18px]"
                strokeWidth={1.5}
              />
            </button>

          </div>
        </div>
      </ConversationLane>
    </header>
  );
};

export default ChatHeader;
