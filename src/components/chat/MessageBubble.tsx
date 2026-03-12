import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ExclamationCircleIcon,
  PencilIcon,
} from "@heroicons/react/24/solid";
import {
  PhotoIcon,
  DocumentIcon,
  SpeakerWaveIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { TextMessage } from "../message/TextMessage";
import { ImageMessage } from "../message/ImageMessage";
import { FileMessageCard } from "../message/FileMessageCard";
import { VoiceMessage } from "../message/VoiceMessage";
import { LinkPreviewCard } from "../message/LinkPreviewCard";
import { ThreadIndicator } from "../message/ThreadIndicator";
import { MessageActions } from "../message/MessageActions";
import { ReactionBar } from "../message/ReactionBar";
import type { Message, Conversation, Attachment } from "../../types";
import { MessageStatus, MessageType, RoomType } from "../../types";
import { normalizeRoomType } from "../../lib/conversationAdapter";
import { formatMessageTime, formatRelativeDate } from "../../utils/formatTime";
import { useChatStore } from "../../stores";
import type { ChatDensity } from "../../stores/uiStore";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  conversationType: Conversation["type"];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density?: ChatDensity;
  currentUsername?: string;
  className?: string;
}

/** Icon for reply-to preview type indicator */
const ReplyTypeIcon: React.FC<{ type?: string; className?: string }> = ({
  type,
  className,
}) => {
  switch (type) {
    case "image":
      return <PhotoIcon className={className} />;
    case "file":
      return <DocumentIcon className={className} />;
    case "voice":
      return <SpeakerWaveIcon className={className} />;
    default:
      return <ChatBubbleLeftIcon className={className} />;
  }
};

/** Extract first URL from message content */
const extractFirstUrl = (content: string | undefined): string | null => {
  if (!content) return null;
  const match = content.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
};

interface ContactPayloadView {
  contactUserId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
  email?: string;
  orgUnit?: string;
  title?: string;
}

const extractContactPayload = (message: Message): ContactPayloadView | null => {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  if (!metadata) return null;

  const pickRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;

  const candidate =
    pickRecord(metadata.attachment) ??
    pickRecord(metadata.contact) ??
    pickRecord(metadata);

  if (!candidate) return null;

  const displayName =
    (typeof candidate.displayName === "string" && candidate.displayName.trim()) ||
    (typeof candidate.name === "string" && candidate.name.trim()) ||
    "";
  if (!displayName) return null;

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value : undefined;

  return {
    contactUserId: asString(candidate.contactUserId) || asString(candidate.userId),
    displayName,
    username: asString(candidate.username),
    avatarUrl:
      asString(candidate.avatarUrl) ||
      asString(candidate.avatar) ||
      asString(candidate.photo),
    phone: asString(candidate.phone),
    email: asString(candidate.email),
    orgUnit: asString(candidate.orgUnit),
    title: asString(candidate.title),
  };
};

const MessageStatusIcon: React.FC<{
  status: Message["status"];
  isOwn: boolean;
  onResend?: () => void;
}> = ({ status, isOwn, onResend }) => {
  const { t } = useTranslation();
  if (!isOwn) return null;

  if (status === "uploading") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-text-inverse/70 border-t-transparent"
        role="img"
        aria-label={t("chat:message.status.uploading")}
        title={t("chat:message.status.uploading")}
      >
        <span className="sr-only">{t("chat:message.status.uploading")}</span>
      </span>
    );
  }

  switch (status) {
    case MessageStatus.SENDING:
      return (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-text-inverse/70 border-t-transparent"
          role="img"
          aria-label={t("chat:message.status.sending")}
          title={t("chat:message.status.sending")}
        >
          <span className="sr-only">{t("chat:message.status.sending")}</span>
        </span>
      );
    case MessageStatus.SENT:
      return (
        <span
          role="img"
          aria-label={t("chat:message.status.sent")}
          title={t("chat:message.status.sent")}
        >
          <CheckIcon className="h-3.5 w-3.5 text-text-inverse/60" />
          <span className="sr-only">{t("chat:message.status.sent")}</span>
        </span>
      );
    case MessageStatus.DELIVERED:
      return (
        <div
          className="flex -space-x-1.5"
          role="img"
          aria-label={t("chat:message.status.delivered", {
            defaultValue: "Delivered",
          })}
          title={t("chat:message.status.delivered", {
            defaultValue: "Delivered",
          })}
        >
          <CheckIcon className="h-3.5 w-3.5 text-text-inverse/75" />
          <CheckIcon className="h-3.5 w-3.5 text-text-inverse/75" />
        </div>
      );
    case MessageStatus.READ:
      return (
        <div
          className="flex -space-x-1.5"
          role="img"
          aria-label={t("chat:message.status.read", { defaultValue: "Read" })}
          title={t("chat:message.status.read", { defaultValue: "Read" })}
        >
          <CheckIcon className="h-3.5 w-3.5 text-secondary" />
          <CheckIcon className="h-3.5 w-3.5 text-secondary" />
        </div>
      );
    case MessageStatus.FAILED:
      return (
        <button
          type="button"
          title={t("chat:message.status.retry")}
          onClick={onResend}
          className="h-3.5 w-3.5 text-danger/80 transition-transform duration-150 hover:scale-110 hover:text-danger focus:outline-none active:scale-95"
        >
          <ExclamationCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">
            {t("chat:message.status.failedRetry")}
          </span>
        </button>
      );
    default:
      return null;
  }
};

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar,
  showSenderName = false,
  isGroupStart = true,
  isGroupEnd = true,
  conversationType,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  density = "comfortable",
  currentUsername,
  className,
}) => {
  const { t } = useTranslation();
  const resendMessage = useChatStore((s) => s.resendMessage);
  const bubbleRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const [isActionsPinned, setIsActionsPinned] = React.useState(false);
  const [hasFocusWithin, setHasFocusWithin] = React.useState(false);
  const isCompact = density === "compact";

  const timeStr = formatMessageTime(new Date(message.createdAt));
  const normalizedConversationType = normalizeRoomType(conversationType);
  const isGroupConversation =
    normalizedConversationType !== RoomType.PRIVATE &&
    normalizedConversationType !== RoomType.DIRECT;
  const isActionsVisibleForKeyboard = isActionsPinned || hasFocusWithin;
  const threadCountValue = (() => {
    const candidate = message as unknown as { threadCount?: unknown };
    return typeof candidate.threadCount === "number" ? candidate.threadCount : 0;
  })();

  const renderContent = () => {
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
      : [];
    const contactPayload =
      message.type === MessageType.CONTACT ? extractContactPayload(message) : null;

    switch (message.type) {
      case MessageType.TEXT:
        return (
          <TextMessage
            content={message.content}
            isOwn={isOwn}
            currentUsername={currentUsername}
          />
        );

      case MessageType.IMAGE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <ImageMessage
                key={attachment.id || `${message.id}-image-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                caption={index === 0 ? message.content : undefined}
                isOwn={isOwn}
                onClick={onImageClick}
              />
            ))}
          </div>
        ) : (
          <TextMessage content={message.content} isOwn={isOwn} />
        );

      case MessageType.FILE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <FileMessageCard
                key={attachment.id || `${message.id}-file-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                isOwn={isOwn}
                onPreview={
                  onFilePreview ? (att) => onFilePreview(att) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <TextMessage
            content={message.content}
            isOwn={isOwn}
            currentUsername={currentUsername}
          />
        );

      case MessageType.VOICE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <VoiceMessage
                key={attachment.id || `${message.id}-voice-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                isOwn={isOwn}
              />
            ))}
          </div>
        ) : (
          <TextMessage
            content={message.content}
            isOwn={isOwn}
            currentUsername={currentUsername}
          />
        );

      case MessageType.CONTACT:
        if (!contactPayload) {
          return (
            <TextMessage
              content={message.content}
              isOwn={isOwn}
              currentUsername={currentUsername}
            />
          );
        }

        return (
          <div
            className={clsx(
              "min-w-[14rem] space-y-2 rounded-lg border px-3 py-2",
              isOwn
                ? "border-text-inverse/20 bg-text-inverse/10"
                : "border-border bg-surface-overlay/40",
            )}
          >
            <div className="flex items-center gap-2">
              <Avatar
                src={contactPayload.avatarUrl}
                alt={contactPayload.displayName}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {contactPayload.displayName}
                </p>
                {contactPayload.username && (
                  <p className="truncate text-xs opacity-80">
                    @{contactPayload.username}
                  </p>
                )}
              </div>
            </div>

            {(contactPayload.phone || contactPayload.email) && (
              <div className="space-y-0.5 text-xs opacity-85">
                {contactPayload.phone && <p>{contactPayload.phone}</p>}
                {contactPayload.email && <p>{contactPayload.email}</p>}
              </div>
            )}

            {(contactPayload.orgUnit || contactPayload.title) && (
              <div className="space-y-0.5 text-xs opacity-80">
                {contactPayload.orgUnit && <p>{contactPayload.orgUnit}</p>}
                {contactPayload.title && <p>{contactPayload.title}</p>}
              </div>
            )}

            {contactPayload.contactUserId && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.dispatchEvent(
                    new CustomEvent("chat:contact:view-profile", {
                      detail: { userId: contactPayload.contactUserId },
                    }),
                  );
                }}
                className={clsx(
                  "text-xs font-medium underline-offset-2 hover:underline",
                  isOwn ? "text-text-inverse" : "text-primary",
                )}
              >
                {t("chat:contactShare.viewProfile", {
                  defaultValue: "View profile",
                })}
              </button>
            )}
          </div>
        );

      default:
        return (
          <TextMessage
            content={message.content}
            isOwn={isOwn}
            currentUsername={currentUsername}
          />
        );
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content);
    setIsActionsPinned(false);
    bubbleRef.current?.focus();
  };

  const handleResend = () => {
    if (message.conversationId) {
      void resendMessage(message.conversationId, message);
    }
  };

  const closeActions = () => {
    setIsActionsPinned(false);
    bubbleRef.current?.focus();
  };

  const openActionsWithKeyboard = () => {
    setIsActionsPinned(true);
    requestAnimationFrame(() => {
      const firstActionButton =
        actionsRef.current?.querySelector<HTMLButtonElement>(
          "button[tabindex='0']",
        );
      firstActionButton?.focus();
    });
  };

  const bubbleRadiusClass = (() => {
    if (isOwn) {
      if (isGroupStart && isGroupEnd) return "rounded-xl rounded-br-sm";
      if (isGroupStart) return "rounded-xl rounded-br-sm";
      if (isGroupEnd) return "rounded-xl rounded-tr-sm";
      return "rounded-xl rounded-r-sm";
    }

    if (isGroupStart && isGroupEnd) return "rounded-xl rounded-bl-sm";
    if (isGroupStart) return "rounded-xl rounded-bl-sm";
    if (isGroupEnd) return "rounded-xl rounded-tl-sm";
    return "rounded-xl rounded-l-sm";
  })();

  const bubbleSender = isOwn ? t("chat:message.you") : message.senderName;

  return (
    <div
      className={clsx(
        "group flex w-fit max-w-[78%] items-end gap-2 sm:max-w-[60%]",
        isOwn ? "ml-auto flex-row-reverse" : "mr-auto",
        className,
      )}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement)) {
          setHasFocusWithin(false);
          setIsActionsPinned(false);
        }
      }}
    >
      {isGroupConversation && !isOwn && (
        <div className="w-8 shrink-0 self-end">
          {showAvatar && (
            <Avatar
              src={message.senderAvatar}
              alt={message.senderName}
              size="sm"
            />
          )}
        </div>
      )}

      <div className="relative flex min-w-0 flex-col">
        {isGroupConversation && !isOwn && showSenderName && (
          <span className="mb-1 text-xs font-medium text-primary">
            {message.senderName}
          </span>
        )}

        {message.replyToMessage && (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-t-xl border-l-2 border-primary/70 px-3 py-1.5 text-xs",
              isOwn
                ? "bg-primary/80 text-text-inverse/80"
                : "bg-surface-overlay text-text-secondary",
            )}
          >
            <ReplyTypeIcon
              type={message.replyToMessage.type}
              className={clsx(
                "h-3.5 w-3.5 shrink-0",
                isOwn ? "text-text-inverse/60" : "text-text-muted",
              )}
            />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">
                {message.replyToMessage.senderName}
              </span>
              <p className="mt-0.5 truncate leading-snug">
                {message.replyToMessage.isDeleted
                  ? t("chat:message.deleted", {
                      defaultValue: "Message deleted",
                    })
                  : message.replyToMessage.content}
              </p>
            </div>
          </div>
        )}

        <div
          ref={bubbleRef}
          className={clsx(
            "relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            isCompact
              ? "px-2.5 py-1.5 pb-5"
              : "px-[var(--chat-bubble-px)] py-[var(--chat-bubble-py)] pb-6",
            bubbleRadiusClass,
            isOwn
              ? "bg-primary text-text-inverse"
              : "border border-border bg-surface-raised text-text-primary shadow-xs",
            message.replyToMessage && "rounded-t-none",
          )}
          tabIndex={0}
          aria-label={t("chat:message.bubbleAria", {
            name: bubbleSender,
            time: timeStr,
          })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openActionsWithKeyboard();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              closeActions();
            }
          }}
        >
          {message.forwardedFrom && (
            <div
              className={clsx(
                "mb-1 flex items-center gap-1 text-xs",
                isOwn ? "text-text-inverse/90" : "text-text-secondary",
              )}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l9 9h-6v4H9v-4H3l9-9zm0 18h10v2H2v-2h10z" />
              </svg>
              {t("chat:message.forwardedFrom", {
                name: message.forwardedFrom.username,
              })}
            </div>
          )}

          {renderContent()}

          {/* Link preview (for text messages with URLs) */}
          {message.type === MessageType.TEXT &&
            (() => {
              const firstUrl = extractFirstUrl(message.content);
              return firstUrl ? (
                <LinkPreviewCard url={firstUrl} isOwn={isOwn} />
              ) : null;
            })()}

          {/* Timestamp + status row */}
          <div
            className={clsx(
              "pointer-events-none absolute bottom-1.5 right-2 flex min-h-4 items-center justify-end gap-1 text-[11px] leading-tight",
              isOwn ? "text-text-inverse/80" : "text-text-secondary",
            )}
          >
            {message.isEdited && (
              <span
                className="inline-flex items-center gap-0.5"
                title={
                  message.editedAt
                    ? t("chat:message.editedAt", {
                        time: formatRelativeDate(new Date(message.editedAt)),
                        defaultValue: `Edited ${formatRelativeDate(new Date(message.editedAt))}`,
                      })
                    : t("chat:message.edited")
                }
              >
                <PencilIcon className="h-2.5 w-2.5" />
                <span>{t("chat:message.edited")}</span>
              </span>
            )}
            <span>{timeStr}</span>
            {isOwn && (
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                <MessageStatusIcon
                  status={message.status}
                  isOwn={isOwn}
                  onResend={handleResend}
                />
              </span>
            )}
          </div>

          {isGroupEnd && !message.reactions?.length && (
            <div
              className={clsx(
                "absolute bottom-0 h-3 w-3",
                isOwn ? "-right-1.5 text-primary" : "-left-1.5 text-surface",
              )}
            >
              <svg
                viewBox="0 0 12 12"
                fill="currentColor"
                className={clsx(isOwn ? "rotate-90" : "-rotate-90")}
              >
                <path d="M0 0 L12 0 L12 12 Q12 0 0 0 Z" />
              </svg>
            </div>
          )}
        </div>

        {(message.reactions?.length ?? 0) > 0 && (
          <div className={clsx("mt-1", isOwn ? "self-end" : "self-start")}>
            <ReactionBar
              reactions={message.reactions}
              onReact={(emoji) => onReact(message.id, emoji)}
            />
          </div>
        )}

        {/* Thread indicator */}
        {threadCountValue > 0 && (
            <ThreadIndicator
              threadCount={threadCountValue}
              isOwn={isOwn}
            />
          )}

        <div
          ref={actionsRef}
          className={clsx(
            "absolute -top-1 z-10 transition-all duration-150",
            isActionsVisibleForKeyboard
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
            isOwn ? "-left-2 -translate-x-full" : "-right-2 translate-x-full",
          )}
        >
          <div className="px-1">
            <MessageActions
              isOwn={isOwn}
              onReply={() => {
                onReply(message);
                closeActions();
              }}
              onForward={() => {}}
              onCopy={handleCopy}
              onEdit={
                isOwn && onEdit
                  ? () => {
                      void Promise.resolve(onEdit(message));
                      closeActions();
                    }
                  : undefined
              }
              onDelete={() => {
                if (!onDelete) return;
                void Promise.resolve(onDelete(message.id));
                closeActions();
              }}
              isVisible={isActionsVisibleForKeyboard}
              onClose={closeActions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageBubble = React.memo(MessageBubbleComponent);

export default MessageBubble;
