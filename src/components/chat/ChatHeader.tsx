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
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { TypingIndicator } from "../common/TypingIndicator";
import type { Conversation, TypingStatus } from "../../types";
import { getOtherParticipant } from "../../utils/messageHelpers";

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId: string;
  typingStatus?: TypingStatus;
  onBack?: () => void;
  onInfoClick: () => void;
  onCallClick?: () => void;
  onVideoCallClick?: () => void;
  onSearchClick?: () => void;
  className?: string;
}

interface HeaderAction {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick: () => void;
}

const iconButtonClass = clsx(
  "inline-flex h-10 w-10 items-center justify-center rounded-full",
  "text-text-secondary transition-colors",
  "hover:bg-surface-overlay hover:text-text-primary",
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
  className,
}) => {
  const { t } = useTranslation();
  const otherUser = getOtherParticipant(conversation, currentUserId);
  const isOnline = otherUser?.status === "online";
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

    if (conversation.type === "group") {
      return t("chat:header.members", {
        count: conversation.participants?.length ?? 0,
      });
    }

    if (conversation.type === "channel") {
      return t("chat:header.channel");
    }

    if (otherUser) {
      return isOnline ? t("common:status.online") : t("common:status.offline");
    }

    return "";
  }, [conversation.participants?.length, conversation.type, isOnline, isTyping, otherUser, t]);

  const displayName =
    conversation.name ||
    otherUser?.displayName ||
    otherUser?.username ||
    t("common:labels.conversation");

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

    nextActions.push({
      id: "info",
      label: t("chat:header.toggleInfoPanel"),
      icon: InformationCircleIcon,
      onClick: onInfoClick,
    });

    return nextActions;
  }, [onCallClick, onInfoClick, onSearchClick, onVideoCallClick, t]);

  return (
    <header
      className={clsx(
        "sticky top-0 z-sticky border-b border-border bg-surface/95 px-4 py-2 shadow-elev1 backdrop-blur",
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
            src={conversation.avatar}
            alt={displayName}
            size="md"
            status={otherUser?.status}
            showStatus={
              conversation.type === "private" || conversation.type === "direct"
            }
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
          <h2 className="truncate text-sm font-semibold text-text-primary sm:text-base">
            {displayName}
          </h2>

          {isTyping ? (
            <TypingIndicator userName={typingStatus?.userName} />
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
          <div className="hidden items-center gap-1 sm:flex">
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

          <div className="sm:hidden">
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
                  "animate-fade-in",
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
                        "transition-colors hover:bg-surface-overlay hover:text-text-primary",
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
