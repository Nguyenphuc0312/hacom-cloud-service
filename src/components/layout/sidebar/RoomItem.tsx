import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChevronRightIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Pin } from "lucide-react";
import { Avatar } from "../../common/Avatar";
import { GroupAvatar } from "../../common/GroupAvatar";
import {
  useChatStore,
  usePresenceStore,
  resolveLivePresenceStatus,
} from "../../../stores";
import { useUIStore } from "../../../stores/uiStore";
import { useChatUiStore } from "../../../features/chat/state/chatUiStore";
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
import {
  decodeMessageDrag,
  isMessageDrag,
} from "../../../features/chat/quickForward";
import { resolveForwardErrorMessage } from "../../../features/chat/forwardErrorMessage";
import {
  useForwardMessagesMutation,
  useDeleteMessageMutation,
} from "../../../features/api/chatApi";
import { toast } from "../../ui";
import { extractApiError } from "../../../lib/apiContract";
import { conversationApi } from "../../../services/api";
import { PersonalCloudAvatar } from "../../../features/cloud/components/PersonalCloudAvatar";
import { isPersonalCloudConversation, personalCloudPresentation } from "../../../features/cloud/personalCloudPolicy";
import {
  ConversationLabelChips,
  ConversationLabelMarker,
} from "./ConversationLabels";
import type { ConversationLabel } from "../../../stores/uiStore";
import {
  getConversationMenuPosition,
  type ConversationMenuPosition,
} from "./conversationMenuPosition";

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
  draftText: string;
  previewState: ReturnType<typeof getMessagePreviewState>;
  timeLabel: string;
  unreadCount: number;
  hasUnreadMention: boolean;
  avatarSrc?: string;
  avatarStatus?: UserStatus;
  isDirect: boolean;
  isPersonalCloud: boolean;
  isActive: boolean;
  isKeyboardActive: boolean;
  isPinned: boolean;
  labels: ConversationLabel[];
  assignedLabels: ConversationLabel[];
  assignedLabelIds: string[];
  isDropTarget: boolean;
  onSelect: (conversationId: string) => void;
  onTogglePinned: (conversationId: string) => void;
  onToggleLabel: (conversationId: string, labelId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onOpenLabelManager: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

type RoomItemVisualState =
  | "default"
  | "hover"
  | "active"
  | "unread"
  | "muted"
  | "mention";

const EMPTY_LABEL_IDS: string[] = [];

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
  lastSenderAlias?: string,
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
    lastSenderAlias?.trim() || // "tên gợi nhớ" wins over the real sender name
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

export const ConversationItemMenu: React.FC<{
  conversationId: string;
  isPersonalCloud: boolean;
  isPinned: boolean;
  labels: ConversationLabel[];
  assignedLabelIds: string[];
  onTogglePinned: (conversationId: string) => void;
  onToggleLabel: (conversationId: string, labelId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onOpenLabelManager: () => void;
}> = ({
  conversationId,
  isPersonalCloud,
  isPinned,
  labels,
  assignedLabelIds,
  onTogglePinned,
  onToggleLabel,
  onDeleteConversation,
  onOpenLabelManager,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [labelSubmenuOpen, setLabelSubmenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuPosition, setMenuPosition] =
    useState<ConversationMenuPosition | null>(null);
  const [labelSubmenuPosition, setLabelSubmenuPosition] = useState({
    left: 0,
    top: 0,
  });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const labelTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const labelSubmenuRef = React.useRef<HTMLDivElement | null>(null);
  const labelSubmenuCloseTimerRef = React.useRef<number | null>(null);

  const updateMenuPosition = React.useCallback(() => {
    const buttonRect = buttonRef.current?.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (!buttonRect || !menuRect) return;

    setMenuPosition(
      getConversationMenuPosition(
        buttonRect,
        { width: menuRect.width, height: menuRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return undefined;

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target) ||
        labelSubmenuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setLabelSubmenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setLabelSubmenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (labelSubmenuCloseTimerRef.current !== null) {
        window.clearTimeout(labelSubmenuCloseTimerRef.current);
      }
    },
    [],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setMenuPosition(null);
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      setLabelSubmenuOpen(false);
    }
  };

  const clearLabelSubmenuCloseTimer = () => {
    if (labelSubmenuCloseTimerRef.current !== null) {
      window.clearTimeout(labelSubmenuCloseTimerRef.current);
      labelSubmenuCloseTimerRef.current = null;
    }
  };

  const openLabelSubmenu = () => {
    clearLabelSubmenuCloseTimer();
    const rect = labelTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 256;
      const padding = 8;
      setLabelSubmenuPosition({
        left: Math.max(
          padding,
          Math.min(rect.right - 4, window.innerWidth - width - padding),
        ),
        top: Math.max(
          padding,
          Math.min(rect.top, window.innerHeight - 352 - padding),
        ),
      });
    }
    setLabelSubmenuOpen(true);
  };

  const scheduleLabelSubmenuClose = () => {
    clearLabelSubmenuCloseTimer();
    labelSubmenuCloseTimerRef.current = window.setTimeout(() => {
      setLabelSubmenuOpen(false);
      labelSubmenuCloseTimerRef.current = null;
    }, 120);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleOpenChange(!open);
        }}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-md text-text-muted opacity-0 transition-micro",
          "hover:bg-surface-hover hover:text-text-primary focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          open && "bg-surface-hover text-text-primary opacity-100",
          "group-hover:opacity-100",
        )}
        aria-label={t("sidebar:labels.conversationMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="fixed z-[1000] w-72 overflow-visible rounded-lg border border-border bg-surface py-1 text-sm shadow-elev3"
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top ?? 0,
            visibility: menuPosition ? "visible" : "hidden",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePinned(conversationId);
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-text-primary transition-micro hover:bg-surface-hover"
          >
            <Pin className="h-4 w-4 text-text-secondary" strokeWidth={1.6} />
            <span>{isPinned ? t("sidebar:labels.unpin") : t("sidebar:labels.pin")}</span>
          </button>

          <div className="my-1 border-t border-border/70" />

          <div
            className="relative"
            onMouseEnter={openLabelSubmenu}
            onMouseLeave={scheduleLabelSubmenuClose}
          >
            <button
              ref={labelTriggerRef}
              type="button"
              role="menuitem"
              onFocus={openLabelSubmenu}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-text-primary transition-micro hover:bg-surface-hover"
            >
              <TagIcon className="h-4 w-4 text-text-secondary" />
              <span>{t("sidebar:labels.classify")}</span>
              <ChevronRightIcon className="ml-auto h-4 w-4 text-text-secondary" />
            </button>

            {labelSubmenuOpen && typeof document !== "undefined" ? createPortal(
              <div
                ref={labelSubmenuRef}
                role="menu"
                onMouseEnter={clearLabelSubmenuCloseTimer}
                onMouseLeave={scheduleLabelSubmenuClose}
                className="fixed z-[1000] max-h-[min(22rem,calc(100vh-1rem))] w-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-elev3"
                style={labelSubmenuPosition}
              >
                {labels.map((label) => {
                  const checked = assignedLabelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => onToggleLabel(conversationId, label.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-text-primary transition-micro hover:bg-surface-hover"
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {checked ? (
                          <CheckIcon className="h-4 w-4 text-[#1565C0]" />
                        ) : null}
                      </span>
                      <ConversationLabelMarker color={label.color} />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setLabelSubmenuOpen(false);
                    onOpenLabelManager();
                  }}
                  className="flex w-full items-center gap-3 border-t border-border/70 px-3 py-2.5 text-left font-medium text-[#1565C0] transition-micro hover:bg-[#1976D2]/8"
                >
                  <TagIcon className="h-4 w-4" />
                  <span>{t("sidebar:labels.manage")}</span>
                </button>
              </div>,
              document.body,
            ) : null}
          </div>

          {!isPersonalCloud ? (
            <>
              <div className="my-1 border-t border-border/70" />

              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  if (isDeleting) return;
                  setIsDeleting(true);
                  try {
                    await conversationApi.deleteConversation(conversationId);
                    onDeleteConversation(conversationId);
                    toast.success(t("sidebar:labels.deleteConversationSuccess"));
                  } catch (error) {
                    toast.error(
                      extractApiError(error).message ||
                        t("sidebar:labels.deleteConversationFailed"),
                    );
                  } finally {
                    setIsDeleting(false);
                    setOpen(false);
                    setLabelSubmenuOpen(false);
                  }
                }}
                disabled={isDeleting}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-danger transition-micro hover:bg-danger/6 disabled:cursor-wait disabled:opacity-60"
              >
                <TrashIcon className="h-4 w-4" />
                <span>{t("sidebar:labels.deleteConversation")}</span>
              </button>
            </>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

const RoomItemViewComponent: React.FC<RoomItemViewProps> = ({
  conversation,
  layoutState,
  currentUserId,
  displayName,
  previewText,
  draftText,
  previewState,
  timeLabel,
  unreadCount,
  hasUnreadMention,
  avatarSrc,
  avatarStatus,
  isDirect,
  isPersonalCloud,
  isActive,
  isKeyboardActive,
  isPinned,
  labels,
  assignedLabels,
  assignedLabelIds,
  isDropTarget,
  onSelect,
  onTogglePinned,
  onToggleLabel,
  onDeleteConversation,
  onOpenLabelManager,
  onDragOver,
  onDragLeave,
  onDrop,
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
    <div
      onClick={() => onSelect(conversation.id)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="option"
      aria-selected={isActive}
      data-room-state={visualState}
      data-keyboard-active={isKeyboardActive}
      data-render-probe="conversation-item"
      className={clsx(
        "group relative mx-1 flex h-[var(--size-room-item)] w-[calc(100%-0.5rem)] cursor-pointer items-center text-left",
        "transition-micro active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isDense ? "rounded-md px-2" : "rounded-lg px-2.5",
        visualStyles.container,
        hoverStyles?.container,
        isDropTarget &&
          "bg-[#1565C0]/15 ring-2 ring-inset ring-[#1565C0]/70",
      )}
      aria-label={displayName}
    >
      <div
        className={clsx(
          "grid w-full grid-cols-[auto,1fr,auto] items-center",
          isDense ? "gap-2" : "gap-2.5",
        )}
      >
        {isPersonalCloud ? (
          <PersonalCloudAvatar size="md" />
        ) : isDirect ? (
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
            <ConversationLabelChips labels={assignedLabels} />
          </div>

          {draftText ? (
            <p
              className={clsx(
                "mt-0.5 truncate pr-1 text-left",
                isDense
                  ? "text-[11px] leading-[0.95rem]"
                  : "text-[12px] leading-[1rem]",
                hoverStyles?.preview,
                "text-text-muted",
              )}
              title={draftText}
            >
              <span className="font-medium text-danger">
                {t("sidebar:room.draftLabel")}:
              </span>{" "}
              {truncateTextWithEllipsis(draftText, 48)}
            </p>
          ) : (
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
          )}
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
      <div className="absolute right-1 top-1">
        <ConversationItemMenu
          conversationId={conversation.id}
          isPersonalCloud={isPersonalCloud}
          isPinned={isPinned}
          labels={labels}
          assignedLabelIds={assignedLabelIds}
          onTogglePinned={onTogglePinned}
          onToggleLabel={onToggleLabel}
          onDeleteConversation={onDeleteConversation}
          onOpenLabelManager={onOpenLabelManager}
        />
      </div>
    </div>
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
    prev.draftText === next.draftText &&
    prev.previewState === next.previewState &&
    prev.timeLabel === next.timeLabel &&
    prev.unreadCount === next.unreadCount &&
    prev.hasUnreadMention === next.hasUnreadMention &&
    prev.avatarSrc === next.avatarSrc &&
    prev.avatarStatus === next.avatarStatus &&
    prev.isDirect === next.isDirect &&
    prev.isPersonalCloud === next.isPersonalCloud &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.isPinned === next.isPinned &&
    prev.labels === next.labels &&
    prev.assignedLabels === next.assignedLabels &&
    prev.assignedLabelIds === next.assignedLabelIds &&
    prev.isDropTarget === next.isDropTarget &&
    prev.onSelect === next.onSelect &&
    prev.onTogglePinned === next.onTogglePinned &&
    prev.onToggleLabel === next.onToggleLabel &&
    prev.onDeleteConversation === next.onDeleteConversation &&
    prev.onOpenLabelManager === next.onOpenLabelManager &&
    prev.onDragOver === next.onDragOver &&
    prev.onDragLeave === next.onDragLeave &&
    prev.onDrop === next.onDrop,
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
    const labels = useUIStore((state) => state.conversationLabels);
    const removeConversation = useChatStore((state) => state.removeConversation);
    const updateConversation = useChatStore((state) => state.updateConversation);
    const openConversationLabelManager = useUIStore(
      (state) => state.openConversationLabelManager,
    );
    const setConversationLabelAssignment = useUIStore(
      (state) => state.setConversationLabelAssignment,
    );
    const isPinned = Boolean(conversation?.pinnedAt);
    const assignedLabelIds = conversation?.labelIds ?? EMPTY_LABEL_IDS;
    const assignedLabels = useMemo(
      () => labels.filter((label) => assignedLabelIds.includes(label.id)),
      [assignedLabelIds, labels],
    );
    // Unsent draft preview ("Chưa gửi") — hidden on the active room since its
    // composer is already visible. Draft lives in chatUiStore (sessionStorage).
    const draftText = useChatUiStore(
      useMemo(
        () => (s) =>
          isActive ? "" : s.composerDraftByConversation[conversationId] ?? "",
        [conversationId, isActive],
      ),
    );

    // Quick-forward: drag a message with an attachment onto this room to forward
    // it here immediately, with an undo toast.
    const [isDropTarget, setIsDropTarget] = useState(false);
    const [forwardMessages] = useForwardMessagesMutation();
    const [deleteMessage] = useDeleteMessageMutation();

    const handleTogglePinned = React.useCallback(
      async (targetConversationId: string) => {
        const currentConversation =
          useChatStore.getState().conversationById[targetConversationId];
        if (!currentConversation) return;
        const wasPinned = Boolean(currentConversation.pinnedAt);
        const optimisticPinnedAt = wasPinned ? null : new Date().toISOString();
        updateConversation(targetConversationId, {
          pinnedAt: optimisticPinnedAt,
          pinOrder: wasPinned ? null : 0,
          isPinned: !wasPinned,
        });

        try {
          const result = await conversationApi.setConversationPinned(
            targetConversationId,
            !wasPinned,
          );
          updateConversation(targetConversationId, {
            pinnedAt: result.pinnedAt,
            pinOrder: result.pinOrder,
            isPinned: Boolean(result.pinnedAt),
          });
        } catch (error) {
          updateConversation(targetConversationId, {
            pinnedAt: currentConversation.pinnedAt ?? null,
            pinOrder: currentConversation.pinOrder ?? null,
            isPinned: Boolean(currentConversation.pinnedAt),
          });
          toast.error(extractApiError(error).message);
        }
      },
      [updateConversation],
    );

    const handleToggleLabel = React.useCallback(
      async (targetConversationId: string, labelId: string) => {
        const currentConversation =
          useChatStore.getState().conversationById[targetConversationId];
        if (!currentConversation) return;
        const currentLabelIds = currentConversation.labelIds ?? [];
        const nextLabelIds = currentLabelIds.includes(labelId)
          ? currentLabelIds.filter((id) => id !== labelId)
          : [...currentLabelIds, labelId];

        updateConversation(targetConversationId, { labelIds: nextLabelIds });
        setConversationLabelAssignment(targetConversationId, nextLabelIds);

        try {
          const result = await conversationApi.setConversationLabels(
            targetConversationId,
            nextLabelIds,
          );
          updateConversation(targetConversationId, { labelIds: result.labelIds });
          setConversationLabelAssignment(targetConversationId, result.labelIds);
        } catch (error) {
          updateConversation(targetConversationId, {
            labelIds: currentConversation.labelIds ?? [],
          });
          setConversationLabelAssignment(
            targetConversationId,
            currentConversation.labelIds ?? [],
          );
          toast.error(extractApiError(error).message);
        }
      },
      [setConversationLabelAssignment, updateConversation],
    );

    const handleDragOver = React.useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        if (!isMessageDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDropTarget(true);
      },
      [],
    );

    const handleDragLeave = React.useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        // Ignore leaves into child elements — only clear when truly leaving.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setIsDropTarget(false);
      },
      [],
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
    // Alias of the LAST-MESSAGE sender — used for the group preview prefix
    // ("{tên gợi nhớ}: {message}"), which otherwise shows the sender's real name.
    const lastSenderId = conversation?.lastMessage?.senderId;
    const lastSenderAlias = useFriendshipStore(
      useMemo(
        () => (s) => (lastSenderId ? s.friendByUserId[lastSenderId]?.alias ?? undefined : undefined),
        [lastSenderId],
      ),
    );
    useEffect(() => {
      if (directPartnerId) enrichUserProfile(directPartnerId);
    }, [directPartnerId]);

    const handleDrop = React.useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        const payload = decodeMessageDrag(event.dataTransfer);
        if (!payload) return;
        event.preventDefault();
        setIsDropTarget(false);

        // Dropping on the source conversation is a no-op (nothing to forward to).
        if (payload.sourceConversationId === conversationId) return;

        void (async () => {
          try {
            const result = await forwardMessages({
              items: (payload.messageIds?.length
                ? payload.messageIds
                : [payload.messageId]
              ).map((sourceMessageId) => ({
                sourceMessageId,
                targetConversationId: conversationId,
              })),
            }).unwrap();

            // Same name the sidebar shows: alias ("tên gợi nhớ") wins over the
            // enriched/HR name, which wins over the raw conversation name.
            const targetName =
              alias ||
              enrichedName ||
              getConversationDisplayName(conversation!, currentUser.id) ||
              i18n.t("common:labels.conversation");
            const forwarded = result.messages ?? [];
            toast.action(
              i18n.t("chat:message.forward.quickSent", {
                name: targetName,
                defaultValue: `Đã gửi tới ${targetName}`,
              }),
              i18n.t("common:actions.undo", { defaultValue: "Hoàn tác" }),
              () => {
                for (const msg of forwarded) {
                  void deleteMessage({
                    conversationId,
                    messageId: msg.id,
                    mode: "FOR_EVERYONE",
                  });
                }
              },
            );
          } catch (error) {
            toast.error(resolveForwardErrorMessage(error));
          }
        })();
      },
      [
        conversation,
        conversationId,
        currentUser.id,
        alias,
        enrichedName,
        forwardMessages,
        deleteMessage,
      ],
    );

    const viewModel = useMemo(() => {
      if (!conversation) {
        return null;
      }

      const isPersonalCloud = isPersonalCloudConversation(conversation);
      const displayName = isPersonalCloud
        ? personalCloudPresentation.title
        :
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
      const unreadCount = isPersonalCloud ? 0 : Math.max(0, conversation.unreadCount || 0);
      const isDirect = isDirectConversation(conversation);

      return {
        conversation,
        displayName,
        previewText: buildPreviewText(conversation, currentUser, lastSenderAlias),
        previewState,
        timeLabel: referenceTime
          ? formatRelativeTime(new Date(referenceTime))
          : "",
        unreadCount,
        unreadLabel: unreadCount > 99 ? "99+" : String(unreadCount),
        hasUnreadMention: !isPersonalCloud && hasConversationMention(conversation, currentUser),
        avatarSrc: getConversationAvatar(conversation, currentUser.id),
        // Live presence (WS) only — never the backend `otherUser.status` field.
        avatarStatus: isDirect
          ? resolveLivePresenceStatus(livePresence)
          : undefined,
        isPersonalCloud,
        isDirect,
      };
    }, [conversation, currentUser, livePresence, enrichedName, alias, lastSenderAlias]);

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
        draftText={draftText}
        previewState={viewModel.previewState}
        timeLabel={viewModel.timeLabel}
        unreadCount={viewModel.unreadCount}
        hasUnreadMention={viewModel.hasUnreadMention}
        avatarSrc={viewModel.avatarSrc}
        avatarStatus={viewModel.avatarStatus}
        isDirect={viewModel.isDirect}
        isPersonalCloud={viewModel.isPersonalCloud}
        isActive={isActive}
        isKeyboardActive={isKeyboardActive}
        isPinned={isPinned}
        labels={labels}
        assignedLabels={assignedLabels}
        assignedLabelIds={assignedLabelIds}
        isDropTarget={isDropTarget}
        onSelect={onSelect}
        onTogglePinned={handleTogglePinned}
        onToggleLabel={handleToggleLabel}
        onDeleteConversation={removeConversation}
        onOpenLabelManager={openConversationLabelManager}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
