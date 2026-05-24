import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../common/Avatar";
import { TextMessage } from "../../message/TextMessage";
import { MessageContentRenderer } from "../../message/MessageContentRenderer";
import { ImageMessage } from "../../message/ImageMessage";
import { FileMessageCard } from "../../message/FileMessageCard";
import { VoiceMessage } from "../../message/VoiceMessage";
import { StickerMessage } from "../../message/StickerMessage";
import { LinkPreviewCard } from "../../message/LinkPreviewCard";
import { toast } from "../../ui";
import { dispatchContactProfileView } from "../../../features/chat/events/chatUiEvents";
import type { Attachment, Message } from "../../../types";
import { MessageType } from "../../../types";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";
import { isUuid } from "../../../utils/isUuid";
import { logger } from "../../../utils/logger";
import { shouldTreatMessageContentAsRichText } from "../../../utils/messageContent.utils";
import { useAuthStore } from "../../../stores";
import { useFriendship } from "../../../hooks/useFriendship";
import { conversationApi } from "../../../services/api";
import { ROUTE_PATHS } from "../../../router/paths";
import { extractApiError, unwrapApiSuccess } from "../../../lib/apiContract";

interface MessageBodyRendererProps {
  message: Message;
  isOwn: boolean;
  currentUsername?: string;
  currentUserId?: string;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;
  onToggleTextExpand?: () => void;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
}

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

const extractFirstUrl = (content: string | undefined): string | null => {
  if (!content) return null;
  const match = content.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
};

const extractContactPayload = (message: Message): ContactPayloadView | null => {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  if (!metadata) return null;

  const pickRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;

  const candidate =
    pickRecord(metadata.attachment) ??
    pickRecord(metadata.contact) ??
    pickRecord(metadata);

  if (!candidate) return null;

  const displayName =
    (typeof candidate.displayName === "string" &&
      candidate.displayName.trim()) ||
    (typeof candidate.name === "string" && candidate.name.trim()) ||
    "";
  if (!displayName) return null;

  const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value : undefined;

  return {
    contactUserId:
      asString(candidate.contactUserId) || asString(candidate.userId),
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

const ContactCard: React.FC<{
  payload: ContactPayloadView;
  isOwn: boolean;
  messageId: string;
  conversationId?: string;
}> = ({ payload, isOwn, messageId, conversationId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { getRelationshipState, sendFriendRequest, acceptFriendRequest } = useFriendship();
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const hasDispatchableContactUserId = Boolean(
    payload.contactUserId && isUuid(payload.contactUserId),
  );

  const relationship =
    payload.contactUserId && currentUserId && hasDispatchableContactUserId
      ? getRelationshipState(payload.contactUserId, currentUserId)
      : null;

  const handleViewProfile = () => {
    logger.debug("direct_dm", "source_trace", {
      source: "MessageBodyRenderer.contactCard",
      messageId,
      conversationId,
      contactUserId: payload.contactUserId,
    });

    if (!hasDispatchableContactUserId) {
      toast.error(
        t("chat:contactShare.invalidProfile", {
          defaultValue: "Cannot view profile for this contact.",
        }),
      );
      return;
    }

    dispatchContactProfileView({ userId: payload.contactUserId });
  };

  const handleAddFriend = async () => {
    if (!payload.contactUserId || !hasDispatchableContactUserId) return;
    setActionLoading("add");
    try {
      const success = await sendFriendRequest(payload.contactUserId);
      if (!success) {
        toast.error(t("friends:actionFailed"));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptFriend = async () => {
    if (relationship?.kind !== "incoming_request") return;
    setActionLoading("accept");
    try {
      const success = await acceptFriendRequest(relationship.requestId);
      if (!success) {
        toast.error(t("friends:actionFailed"));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleMessage = async () => {
    if (!payload.contactUserId || !hasDispatchableContactUserId) return;
    setActionLoading("message");
    try {
      const response = await conversationApi.createPrivateConversation(
        payload.contactUserId,
      );
      const room = unwrapApiSuccess(response) as { id?: string };
      if (room.id) {
        navigate(`${ROUTE_PATHS.CHAT}/${room.id}`);
      }
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message);
    } finally {
      setActionLoading(null);
    }
  };

  const viewProfileBtn = hasDispatchableContactUserId ? (
    <button
      type="button"
      onClick={handleViewProfile}
      className={clsx(
        "text-xs font-medium underline-offset-2 hover:underline",
        isOwn ? "opacity-75 hover:opacity-100" : "text-text-secondary hover:text-primary",
      )}
    >
      {t("chat:contactShare.viewProfile", { defaultValue: "View profile" })}
    </button>
  ) : null;

  const renderCta = () => {
    if (!relationship || relationship.kind === "self") {
      return viewProfileBtn;
    }

    if (relationship.kind === "friend" && relationship.capabilities.canMessage) {
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={actionLoading === "message"}
            onClick={() => void handleMessage()}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              isOwn
                ? "bg-black/[0.08] dark:bg-white/15 hover:bg-black/[0.13] dark:hover:bg-white/20"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {actionLoading === "message"
              ? "..."
              : t("friends:message")}
          </button>
          {viewProfileBtn}
        </div>
      );
    }

    if (relationship.kind === "incoming_request") {
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={actionLoading === "accept"}
            onClick={() => void handleAcceptFriend()}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              isOwn
                ? "bg-black/[0.08] dark:bg-white/15 hover:bg-black/[0.13] dark:hover:bg-white/20"
                : "bg-success/10 text-success hover:bg-success/20",
            )}
          >
            {actionLoading === "accept" ? "..." : t("friends:accept", { defaultValue: "Chấp nhận" })}
          </button>
          {viewProfileBtn}
        </div>
      );
    }

    if (relationship.kind === "outgoing_request") {
      return (
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium opacity-55",
              isOwn
                ? "bg-black/[0.06] dark:bg-white/10"
                : "bg-surface-overlay text-text-muted",
            )}
          >
            {t("friends:qr.pending")}
          </span>
          {viewProfileBtn}
        </div>
      );
    }

    if (
      relationship.kind === "not_friend" &&
      relationship.capabilities.canSendRequest
    ) {
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={actionLoading === "add"}
            onClick={() => void handleAddFriend()}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              isOwn
                ? "bg-black/[0.08] dark:bg-white/15 hover:bg-black/[0.13] dark:hover:bg-white/20"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {actionLoading === "add" ? "..." : t("friends:addFriend")}
          </button>
          {viewProfileBtn}
        </div>
      );
    }

    return viewProfileBtn;
  };

  return (
    <div
      className={clsx(
        "min-w-[14rem] space-y-2 rounded-xl border px-3 py-2.5",
        isOwn
          ? "border-black/10 bg-black/[0.06] dark:border-white/15 dark:bg-white/10"
          : "border-border bg-surface-overlay/50",
      )}
    >
      <p
        className={clsx(
          "text-[10px] font-medium uppercase tracking-wider",
          isOwn ? "opacity-55" : "text-text-muted",
        )}
      >
        {t("chat:contactShare.cardLabel", { defaultValue: "Contact card" })}
      </p>

      <div className="flex items-center gap-2">
        <Avatar src={payload.avatarUrl} alt={payload.displayName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {payload.displayName}
          </p>
          {payload.username && (
            <p className="truncate text-xs opacity-70">@{payload.username}</p>
          )}
        </div>
      </div>

      {(payload.phone || payload.email) && (
        <div className="space-y-0.5 text-xs opacity-75">
          {payload.phone && <p>{payload.phone}</p>}
          {payload.email && <p>{payload.email}</p>}
        </div>
      )}

      {(payload.orgUnit || payload.title) && (
        <div className="space-y-0.5 text-xs opacity-70">
          {payload.orgUnit && <p>{payload.orgUnit}</p>}
          {payload.title && <p>{payload.title}</p>}
        </div>
      )}

      {renderCta()}
    </div>
  );
};

const renderTextContent = (
  message: Message,
  isOwn: boolean,
  currentUsername?: string,
  currentUserId?: string,
  textRenderMode?: LongMessageRenderMode,
  isCollapsibleText?: boolean,
  onToggleTextExpand?: () => void,
) => {
  if (
    shouldTreatMessageContentAsRichText({
      contentFormat: message.contentFormat,
      content: message.content,
    })
  ) {
    return (
      <MessageContentRenderer
        content={message.content}
        contentFormat={message.contentFormat}
        isOwn={isOwn}
      />
    );
  }
  return (
    <TextMessage
      content={message.content}
      contentFormat={message.contentFormat}
      isOwn={isOwn}
      currentUsername={currentUsername}
      currentUserId={currentUserId}
      mentions={message.mentions}
      renderMode={textRenderMode}
      isCollapsible={isCollapsibleText}
      onToggleExpand={onToggleTextExpand}
    />
  );
};

export const MessageBodyRenderer: React.FC<MessageBodyRendererProps> = ({
  message,
  isOwn,
  currentUsername,
  currentUserId,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  onImageClick,
  onFilePreview,
}) => {
  if (
    message.isDeleted ||
    message.lifecycleStatus === "recalled" ||
    message.lifecycleStatus === "deleted_admin"
  ) {
    const placeholder =
      message.lifecycleStatus === "deleted_admin"
        ? "Tin nhắn đã bị xóa bởi quản trị viên"
        : isOwn
          ? "Bạn đã thu hồi một tin nhắn"
          : "Tin nhắn đã được thu hồi";
    return (
      <span className="italic text-text-muted">{placeholder}</span>
    );
  }

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];
  const contactPayload =
    message.type === MessageType.CONTACT
      ? extractContactPayload(message)
      : null;

  const hasContent = Boolean(message.content && message.content.trim());

  switch (message.type) {
    case MessageType.IMAGE:
      return (
        <div className="space-y-2">
          {attachments.length > 0
            ? attachments.map((attachment, index) => (
                <ImageMessage
                  key={attachment.id || `${message.id}-image-${index}`}
                  conversationId={message.conversationId}
                  attachment={attachment}
                  isOwn={isOwn}
                  onClick={onImageClick}
                />
              ))
            : renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )}
          {attachments.length > 0 && hasContent
            ? renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )
            : null}
        </div>
      );
    case MessageType.FILE:
      return (
        <div className="space-y-2">
          {attachments.length > 0
            ? attachments.map((attachment, index) => (
                <FileMessageCard
                  key={attachment.id || `${message.id}-file-${index}`}
                  conversationId={message.conversationId}
                  attachment={attachment}
                  isOwn={isOwn}
                  onPreview={onFilePreview}
                />
              ))
            : renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )}
          {attachments.length > 0 && hasContent
            ? renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )
            : null}
        </div>
      );
    case MessageType.VOICE:
      return (
        <div className="space-y-2">
          {attachments.length > 0
            ? attachments.map((attachment, index) => (
                <VoiceMessage
                  key={attachment.id || `${message.id}-voice-${index}`}
                  conversationId={message.conversationId}
                  attachment={attachment}
                  isOwn={isOwn}
                />
              ))
            : renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )}
        </div>
      );
    case MessageType.CONTACT:
      return contactPayload ? (
        <ContactCard
          payload={contactPayload}
          isOwn={isOwn}
          messageId={message.id}
          conversationId={message.conversationId}
        />
      ) : (
        <TextMessage
          content={message.content}
          isOwn={isOwn}
          currentUsername={currentUsername}
          currentUserId={currentUserId}
          mentions={message.mentions}
          renderMode={textRenderMode}
          isCollapsible={isCollapsibleText}
          onToggleExpand={onToggleTextExpand}
        />
      );
    case MessageType.STICKER:
      return (
        <div className="space-y-2">
          {attachments.length > 0
            ? attachments.map((attachment, index) => (
                <StickerMessage
                  key={attachment.id || `${message.id}-sticker-${index}`}
                  conversationId={message.conversationId}
                  attachment={attachment}
                />
              ))
            : renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )}
        </div>
      );
    case MessageType.TEXT:
    default: {
      const firstUrl = shouldTreatMessageContentAsRichText({
        contentFormat: message.contentFormat,
        content: message.content,
      })
        ? null
        : extractFirstUrl(message.content);
      return (
        <div className="space-y-2">
          {renderTextContent(
            message,
            isOwn,
            currentUsername,
            currentUserId,
            textRenderMode,
            isCollapsibleText,
            onToggleTextExpand,
          )}
          {firstUrl ? <LinkPreviewCard url={firstUrl} isOwn={isOwn} /> : null}
        </div>
      );
    }
  }
};

export default MessageBodyRenderer;
