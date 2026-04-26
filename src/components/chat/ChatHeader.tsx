import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PhoneIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { GroupAvatar } from "../common/GroupAvatar";
import { TypingIndicator } from "../common/TypingIndicator";
import { ConversationLane } from "../layout/ConversationLane";
import { usePresenceStore } from "../../stores";
import { UserStatus } from "../../types";
import type { Conversation, TypingStatus } from "../../types";
import {
  isDirectConversation,
  normalizeRoomType,
} from "../../lib/conversationAdapter";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getOtherParticipant,
} from "../../utils/messageHelpers";

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId: string;
  typingStatus?: TypingStatus;
  onBack?: () => void;
  onInfoClick: () => void;
  onCallClick?: () => void;
  onVideoCallClick?: () => void;
  onSearchClick?: () => void;
  onPinnedClick?: () => void;
  onSelectionMode?: () => void;
  className?: string;
}

interface HeaderAction {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick: () => void;
}

const iconButtonClass = clsx(
  "chat-header-action inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md border border-transparent",
  "text-text-muted transition-micro",
  "hover:bg-surface-hover/80 hover:text-text-primary",
  "active:scale-[0.98] active:bg-surface-active",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
);

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  currentUserId,
  typingStatus,
  onBack,
  onInfoClick,
  onCallClick,
  onVideoCallClick,
  onSearchClick,
  onPinnedClick,
  onSelectionMode,
  className,
}) => {
  const { t } = useTranslation();
  const otherUser = getOtherParticipant(conversation, currentUserId);
  const normalizedType = normalizeRoomType(
    conversation.type,
    conversation.participants?.length,
  );
  const isDirect = isDirectConversation(conversation);
  const otherUserId = otherUser?.id;
  const livePresence = usePresenceStore((s) =>
    otherUserId ? s.presenceMap[otherUserId] : undefined,
  );
  const liveStatus = livePresence
    ? livePresence.state === "online"
      ? UserStatus.ONLINE
      : UserStatus.OFFLINE
    : otherUser?.status;
  const isOnline = liveStatus === UserStatus.ONLINE;
  const isTyping = Boolean(typingStatus?.isTyping);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  React.useEffect(() => {
    setIsMenuOpen(false);
  }, [conversation.id]);

  const statusText = (() => {
    if (isTyping) return "";

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
          time: new Date(livePresence.lastSeenAt).toLocaleString(),
        });
      }
      return t("common:status.offline");
    }

    return "";
  })();

  const displayName =
    getConversationDisplayName(conversation, currentUserId) ||
    t("common:labels.conversation");
  const avatarSrc = getConversationAvatar(conversation, currentUserId);

  const menuActions = React.useMemo<HeaderAction[]>(() => {
    const nextActions: HeaderAction[] = [];

    if (onSearchClick) {
      nextActions.push({
        id: "search",
        label: t("chat:header.searchInChat"),
        icon: MagnifyingGlassIcon,
        onClick: onSearchClick,
      });
    }

    if (onPinnedClick) {
      nextActions.push({
        id: "pinned",
        label: t("chat:pinned.title"),
        icon: MapPinIcon,
        onClick: onPinnedClick,
      });
    }

    if (onSelectionMode) {
      nextActions.push({
        id: "select",
        label: t("chat:selection.enter"),
        icon: CheckCircleIcon,
        onClick: onSelectionMode,
      });
    }

    if (onCallClick) {
      nextActions.push({
        id: "voice-call",
        label: t("chat:header.voiceCall"),
        icon: PhoneIcon,
        onClick: onCallClick,
      });
    }

    if (onVideoCallClick) {
      nextActions.push({
        id: "video-call",
        label: t("chat:header.videoCall"),
        icon: VideoCameraIcon,
        onClick: onVideoCallClick,
      });
    }

    return nextActions;
  }, [onCallClick, onPinnedClick, onSearchClick, onSelectionMode, onVideoCallClick, t]);

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
              className={clsx(iconButtonClass, "lg:hidden")}
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
            {isDirect ? (
              <Avatar
                src={avatarSrc}
                alt={displayName}
                size="md"
                status={liveStatus}
                showStatus={isDirect}
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
            )}
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
              {displayName}
            </h2>

            {isTyping ? (
              <TypingIndicator
                userName={typingStatus?.userName}
                activity={typingStatus?.activity}
                confidence={typingStatus?.confidence}
              />
            ) : (
              <p
                className={clsx(
                  "chat-header-subtitle truncate text-[12px] leading-4",
                  isOnline ? "text-text-secondary" : "text-text-muted",
                )}
              >
                {statusText}
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

            {onCallClick && (
              <button
                type="button"
                onClick={onCallClick}
                className={iconButtonClass}
                aria-label={t("chat:header.voiceCall")}
              >
                <PhoneIcon className="h-[18px] w-[18px]" />
              </button>
            )}

            {onVideoCallClick && (
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
              <InformationCircleIcon className="h-[18px] w-[18px]" />
            </button>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setIsMenuOpen((value) => !value)}
              className={iconButtonClass}
              aria-label={t("chat:header.moreActions")}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              <EllipsisHorizontalIcon className="h-[18px] w-[18px]" />
            </button>

            {isMenuOpen && (
              <div
                ref={menuRef}
                className={clsx(
                  "absolute right-0 top-full z-dropdown mt-2 min-w-52 overflow-hidden rounded-[1rem] border border-border/80 bg-surface-raised p-1.5 shadow-elev2",
                  "animate-slide-up-fade",
                )}
                role="menu"
              >
                {menuActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-secondary",
                        "transition-micro hover:bg-surface-hover hover:text-text-primary active:bg-surface-active",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                      )}
                      onClick={() => {
                        action.onClick();
                        setIsMenuOpen(false);
                      }}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="truncate">{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ConversationLane>
    </header>
  );
};

export default ChatHeader;
