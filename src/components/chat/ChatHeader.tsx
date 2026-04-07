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
import { TypingIndicator } from "../common/TypingIndicator";
import { DensityToggle } from "./DensityToggle";
import { ConversationLane } from "../layout/ConversationLane";
import { useUIStore, usePresenceStore } from "../../stores";
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
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent",
  "text-text-muted transition-micro",
  "hover:border-border hover:bg-surface-hover hover:text-text-primary",
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
  const chatDensity = useUIStore((s) => s.chatDensity);
  const setChatDensity = useUIStore((s) => s.setChatDensity);
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

  const statusText = React.useMemo(() => {
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
  }, [
    conversation.participants?.length,
    isOnline,
    isTyping,
    livePresence?.lastSeenAt,
    normalizedType,
    otherUser,
    t,
  ]);

  const displayName =
    getConversationDisplayName(conversation, currentUserId) ||
    t("common:labels.conversation");
  const avatarSrc = getConversationAvatar(conversation, currentUserId);

  const menuActions = React.useMemo<HeaderAction[]>(() => {
    const nextActions: HeaderAction[] = [];

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

    return nextActions;
  }, [onCallClick, onPinnedClick, onSelectionMode, onVideoCallClick, t]);

  return (
    <header
      className={clsx(
        "sticky top-0 z-sticky border-b border-border/70 py-1.5 backdrop-blur",
        className,
      )}
      style={{ backgroundColor: "hsl(var(--color-chat-canvas) / 0.92)" }}
    >
      <ConversationLane>
        <div className="flex min-h-10 items-center gap-2">
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
              "shrink-0 rounded-full",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
            aria-label={t("chat:header.viewInfo")}
          >
            <Avatar
              src={avatarSrc}
              alt={displayName}
              size="md"
              status={liveStatus}
              showStatus={isDirect}
            />
          </button>

          <button
            type="button"
            onClick={onInfoClick}
            className={clsx(
              "min-w-0 flex-1 text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            )}
          >
            <h2 className="truncate text-body-sm font-semibold text-text-primary sm:text-body">
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
                  "truncate text-caption",
                  isOnline ? "text-text-secondary" : "text-text-muted",
                )}
              >
                {statusText}
              </p>
            )}
          </button>

          <div className="relative ml-1">
            <div className="flex items-center gap-0.5 rounded-xl border border-border/80 bg-surface/90 p-1 shadow-xs">
              {onSearchClick && (
                <button
                  type="button"
                  onClick={onSearchClick}
                  className={iconButtonClass}
                  aria-label={t("chat:header.searchInChat")}
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </button>
              )}

              <button
                type="button"
                onClick={onInfoClick}
                className={iconButtonClass}
                aria-label={t("chat:header.toggleInfoPanel")}
              >
                <InformationCircleIcon className="h-5 w-5" />
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
                <EllipsisHorizontalIcon className="h-5 w-5" />
              </button>
            </div>

            {isMenuOpen && (
              <div
                ref={menuRef}
                className={clsx(
                  "absolute right-0 top-full z-dropdown mt-2 min-w-52 overflow-hidden rounded-xl border border-border bg-surface-raised p-1.5 shadow-elev2",
                  "animate-slide-up-fade",
                )}
                role="menu"
              >
                <div className="px-2 py-1.5">
                  <DensityToggle
                    density={chatDensity}
                    onChange={setChatDensity}
                  />
                </div>
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
