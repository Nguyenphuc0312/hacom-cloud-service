import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  EllipsisHorizontalIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  VideoCameraIcon,
  CheckCircleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { TypingIndicator } from "../common/TypingIndicator";
import { DensityToggle } from "./DensityToggle";
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
  "inline-flex h-11 w-11 items-center justify-center rounded-full",
  "text-text-secondary transition-micro",
  "hover:bg-surface-overlay hover:text-text-primary hover:shadow-xs",
  "active:scale-95 active:bg-surface-active",
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const mobileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!isMobileMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (mobileMenuRef.current?.contains(target)) return;
      if (mobileMenuButtonRef.current?.contains(target)) return;
      setIsMobileMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileMenuOpen]);

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
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
          defaultValue: `Last seen ${new Date(livePresence.lastSeenAt).toLocaleString()}`,
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

  const actions = React.useMemo<HeaderAction[]>(() => {
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
        label: t("chat:pinned.title", { defaultValue: "Pinned messages" }),
        icon: MapPinIcon,
        onClick: onPinnedClick,
      });
    }

    if (onSelectionMode) {
      nextActions.push({
        id: "select",
        label: t("chat:selection.enter", { defaultValue: "Select messages" }),
        icon: CheckCircleIcon,
        onClick: onSelectionMode,
      });
    }

    nextActions.push({
      id: "info",
      label: t("chat:header.toggleInfoPanel"),
      icon: InformationCircleIcon,
      onClick: onInfoClick,
    });

    return nextActions;
  }, [
    onCallClick,
    onInfoClick,
    onPinnedClick,
    onSearchClick,
    onSelectionMode,
    onVideoCallClick,
    t,
  ]);

  return (
    <header
      className={clsx(
        "sticky top-0 z-sticky border-b border-border bg-surface/95 px-4 py-3 shadow-elev1 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-2">
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
          <h2 className="truncate text-base font-semibold text-text-primary sm:text-lg">
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
                "truncate text-xs",
                isOnline ? "text-success" : "text-text-secondary",
              )}
            >
              {statusText}
            </p>
          )}
        </button>

        <div className="relative ml-1">
          <div className="hidden items-center gap-1 lg:flex">
            <DensityToggle
              density={chatDensity}
              onChange={setChatDensity}
              className="mr-1"
            />
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className={iconButtonClass}
                  aria-label={action.label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>

          <div className="lg:hidden">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              onClick={() => setIsMobileMenuOpen((value) => !value)}
              className={iconButtonClass}
              aria-label={t("chat:header.moreActions")}
              aria-haspopup="menu"
              aria-expanded={isMobileMenuOpen}
            >
              <EllipsisHorizontalIcon className="h-5 w-5" />
            </button>

            {isMobileMenuOpen && (
              <div
                ref={mobileMenuRef}
                className={clsx(
                  "absolute right-0 top-full z-dropdown mt-2 min-w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-elev2",
                  "animate-slide-up-fade",
                )}
                role="menu"
              >
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      className={clsx(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-text-secondary",
                        "transition-micro hover:bg-surface-overlay hover:text-text-primary active:bg-surface-active",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                      )}
                      onClick={() => {
                        action.onClick();
                        setIsMobileMenuOpen(false);
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
      </div>
    </header>
  );
};

export default ChatHeader;
