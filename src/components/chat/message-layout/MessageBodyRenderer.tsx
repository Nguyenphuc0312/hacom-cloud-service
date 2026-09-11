import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  PhoneIcon,
  EnvelopeIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  IdentificationIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { TextMessage } from "../../message/TextMessage";
import { MessageContentRenderer } from "../../message/MessageContentRenderer";
import { ImageMessage } from "../../message/ImageMessage";
import { ImageGallery } from "../../message/ImageGallery";
import { FileMessageCard } from "../../message/FileMessageCard";
import { VoiceMessage } from "../../message/VoiceMessage";
import { StickerMessage } from "../../message/StickerMessage";
import { PollMessage } from "../../message/PollMessage";
import { ReminderMessage } from "../../message/ReminderMessage";
import { LocationMessage } from "../../message/LocationMessage";
import { MessageLinkPreview } from "../../message/MessageLinkPreview";
import { LinkPreviewCard } from "../../message/LinkPreviewCard";
import { extractFirstUrlFromContent } from "../../message/linkPreviewUtils";
import { toast } from "../../ui";
import { dispatchContactProfileView } from "../../../features/chat/events/chatUiEvents";
import type { Attachment, ImageClickPayload, Message } from "../../../types";
import { FileType, MessageType } from "../../../types";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";
import { isUuid } from "../../../utils/isUuid";
import { logger } from "../../../utils/logger";
import {
  shouldTreatMessageContentAsRichText,
  stripHtmlToText,
} from "../../../utils/messageContent.utils";
import { looksLikeRawFileName } from "../../../utils/messageHelpers";
import { areMessagesRenderEquivalent } from "../../../utils/messageRenderSignature";
import { useAuthStore } from "../../../stores";
import { useResolvedName } from "../../../stores/enrichedProfileStore";
import { useFriendship } from "../../../hooks/useFriendship";
import { conversationApi } from "../../../services/api";
import { resolvePublicResourceUrl } from "../../../config";
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
  onImageClick?: (payload: ImageClickPayload) => void;
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
  messageId: string;
  conversationId?: string;
}> = ({ payload, messageId, conversationId }) => {
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

  // The card is a solid, self-contained surface regardless of isOwn, so its
  // contrast never depends on the message-bubble color behind it (the sent
  // bubble is light blue in light theme — translucent-on-bubble washed out).

  // "Xem hồ sơ" — secondary action, present in every state. Quiet so the
  // primary action (message / add / accept) leads.
  const viewProfileBtn = hasDispatchableContactUserId ? (
    <button
      type="button"
      onClick={handleViewProfile}
      className="inline-flex h-8 items-center justify-center rounded-lg px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-[#1565C0]"
    >
      {t("chat:contactShare.viewProfile", { defaultValue: "View profile" })}
    </button>
  ) : null;

  // Primary pill: solid brand blue. ~32px tall; row padding clears a 44px target.
  const primaryButton = (opts: {
    label: string;
    loading: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      disabled={opts.loading}
      onClick={opts.onClick}
      className="inline-flex h-8 items-center justify-center rounded-lg bg-[#1565C0] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1976D2] disabled:opacity-60"
    >
      {opts.loading ? "…" : opts.label}
    </button>
  );

  const renderCta = () => {
    const row = (primary: React.ReactNode) => (
      <div className="flex items-center gap-1.5">
        {primary}
        {viewProfileBtn}
      </div>
    );

    if (!relationship || relationship.kind === "self") {
      return viewProfileBtn;
    }

    if (relationship.kind === "friend" && relationship.capabilities.canMessage) {
      return row(
        primaryButton({
          label: t("friends:message"),
          loading: actionLoading === "message",
          onClick: () => void handleMessage(),
        }),
      );
    }

    if (relationship.kind === "incoming_request") {
      return row(
        <button
          type="button"
          disabled={actionLoading === "accept"}
          onClick={() => void handleAcceptFriend()}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-success px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-success/90 disabled:opacity-60"
        >
          {actionLoading === "accept" ? "…" : t("friends:accept", { defaultValue: "Chấp nhận" })}
        </button>,
      );
    }

    if (relationship.kind === "outgoing_request") {
      return row(
        <span className="inline-flex h-8 items-center justify-center rounded-lg bg-surface-overlay px-3.5 text-[13px] font-medium text-text-muted">
          {t("friends:qr.pending")}
        </span>,
      );
    }

    if (
      relationship.kind === "not_friend" &&
      relationship.capabilities.canSendRequest
    ) {
      return row(
        primaryButton({
          label: t("friends:addFriend"),
          loading: actionLoading === "add",
          onClick: () => void handleAddFriend(),
        }),
      );
    }

    return viewProfileBtn;
  };

  const hasDetails = Boolean(
    payload.phone || payload.email || payload.orgUnit || payload.title,
  );
  const cta = renderCta();

  return (
    <div className="w-[17.5rem] max-w-full overflow-hidden rounded-2xl border border-border/70 bg-surface-raised text-text-primary shadow-sm">
      {/* Header: label chip + identity, on a faint branded band */}
      <div className="bg-[#1565C0]/[0.06] px-3.5 pb-3 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#1565C0]">
          <IdentificationIcon className="h-3.5 w-3.5" />
          {t("chat:contactShare.cardLabel", { defaultValue: "Contact card" })}
        </span>

        <div className="mt-2 flex items-center gap-3">
          <Avatar
            src={resolvePublicResourceUrl(payload.avatarUrl)}
            alt={payload.displayName}
            size="lg"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">
              {payload.displayName}
            </p>
            {payload.username && (
              <p className="mt-0.5 truncate text-xs text-text-muted">
                @{payload.username}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details: one field per row, each with its own icon */}
      {hasDetails && (
        <div className="space-y-2 px-3.5 pt-3">
          {payload.phone && (
            <ContactDetailRow icon={PhoneIcon}>{payload.phone}</ContactDetailRow>
          )}
          {payload.email && (
            <ContactDetailRow icon={EnvelopeIcon}>
              <span className="break-all">{payload.email}</span>
            </ContactDetailRow>
          )}
          {payload.orgUnit && (
            <ContactDetailRow icon={BuildingOffice2Icon}>
              {payload.orgUnit}
            </ContactDetailRow>
          )}
          {payload.title && (
            <ContactDetailRow icon={BriefcaseIcon}>
              {payload.title}
            </ContactDetailRow>
          )}
        </div>
      )}

      {/* Action row: divided from content, consistent affordances */}
      {cta && (
        <div className="mt-3 border-t border-border/60 px-3.5 py-2.5">{cta}</div>
      )}
    </div>
  );
};

const ContactDetailRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}> = ({ icon: Icon, children }) => (
  <div className="flex items-start gap-2 text-[13px] leading-snug">
    <Icon className="mt-[1px] h-4 w-4 shrink-0 text-[#1565C0]/70" />
    <span className="min-w-0 text-text-secondary">{children}</span>
  </div>
);

const renderTextContent = (
  message: Message,
  isOwn: boolean,
  currentUsername?: string,
  currentUserId?: string,
  textRenderMode?: LongMessageRenderMode,
  isCollapsibleText?: boolean,
  onToggleTextExpand?: () => void,
) => {
  const hasMentions = Boolean(message.mentions?.length);
  const isRichText = shouldTreatMessageContentAsRichText({
    contentFormat: message.contentFormat,
    content: message.content,
  });
  if (isRichText) {
    return (
      <MessageContentRenderer
        content={message.content}
        contentFormat={message.contentFormat}
        mentions={message.mentions}
        isOwn={isOwn}
      />
    );
  }
  const content = hasMentions
    ? message.plainText?.trim() || stripHtmlToText(message.content)
    : message.content;
  return (
    <TextMessage
      content={content}
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

const UnsupportedLocationMessage: React.FC<{ isOwn: boolean }> = ({ isOwn }) => (
  <div
    className={clsx(
      "min-w-[14rem] max-w-[18rem] rounded-lg border px-3 py-2 text-sm leading-snug",
      isOwn
        ? "border-white/20 bg-white/10 text-white/85"
        : "border-border bg-surface-overlay/80 text-text-secondary",
    )}
    role="note"
    data-error-code="LOCATION_PAYLOAD_MISSING"
  >
    Không thể hiển thị vị trí này
  </div>
);

const MessageBodyRendererComponent: React.FC<MessageBodyRendererProps> = ({
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
  // "tên gợi nhớ" (alias) wins over the message's stored senderName, so
  // Image/Poll/Reminder cards match the timeline header. Hook runs before any
  // early return below.
  const senderName = useResolvedName(message.senderId, message.senderName ?? "");
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

  // content của tin media không caption thường là tên file thô do backend set
  // (UUID, "image.png", hoặc trùng đúng tên attachment) — không phải caption người
  // dùng nhập, nên không render dưới ảnh/file.
  const trimmedContent = message.content?.trim() ?? "";
  const contentIsAttachmentName = attachments.some(
    (att) => (att.fileName?.trim().toLowerCase() ?? "") === trimmedContent.toLowerCase(),
  );
  const hasContent = Boolean(
    trimmedContent
    && !contentIsAttachmentName
    && !looksLikeRawFileName(trimmedContent),
  );

  // Voice bị server ack trả về type=FILE nhưng attachment vẫn là audio →
  // render như voice bubble thay vì file card.
  const isAudioAttachment = (a: Attachment): boolean =>
    a.type === FileType.AUDIO || Boolean(a.mimeType?.startsWith("audio/"));
  const effectiveType =
    message.type === MessageType.FILE &&
    attachments.length > 0 &&
    attachments.every(isAudioAttachment)
      ? MessageType.VOICE
      : message.type;

  switch (effectiveType) {
    case MessageType.IMAGE:
      return (
        <div className="space-y-2">
          {attachments.length === 0
            ? renderTextContent(
                message,
                isOwn,
                currentUsername,
                currentUserId,
                textRenderMode,
                isCollapsibleText,
                onToggleTextExpand,
              )
            : attachments.length === 1
              ? (
                  <ImageMessage
                    key={attachments[0].id || `${message.id}-image-0`}
                    conversationId={message.conversationId}
                    attachment={attachments[0]}
                    isOwn={isOwn}
                    onClick={onImageClick}
                    senderName={senderName}
                    senderAvatar={message.senderAvatar}
                    sentAt={message.serverTs}
                  />
                )
              : (
                  <ImageGallery
                    conversationId={message.conversationId}
                    attachments={attachments}
                    isOwn={isOwn}
                    onImageClick={onImageClick}
                    senderName={senderName}
                    senderAvatar={message.senderAvatar}
                    sentAt={message.serverTs}
                  />
                )}
          {attachments.length > 0 && hasContent
            ? (
                // Caption không được tính vào chiều rộng tối đa của bong bóng:
                // width:0 + min-w-full khiến bong bóng co đúng bề ngang ảnh, còn
                // chữ (dù dài hơn ảnh) tự xuống dòng trong bề ngang đó.
                <div className="w-0 min-w-full">
                  {renderTextContent(
                    message,
                    isOwn,
                    currentUsername,
                    currentUserId,
                    textRenderMode,
                    isCollapsibleText,
                    onToggleTextExpand,
                  )}
                </div>
              )
            : null}
        </div>
      );
    // Video messages carry the same attachment payload as file messages, but
    // have their own semantic type. Render them through FileMessageCard so MP4
    // (and other supported video formats) get the native thumbnail/play UI
    // instead of falling through to the plain-text renderer.
    case MessageType.VIDEO:
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
            ? (
                // Như case IMAGE: caption không kéo giãn bong bóng theo chiều dài
                // chữ; bong bóng bó theo card file, chữ tự xuống dòng.
                <div className="w-0 min-w-full">
                  {renderTextContent(
                    message,
                    isOwn,
                    currentUsername,
                    currentUserId,
                    textRenderMode,
                    isCollapsibleText,
                    onToggleTextExpand,
                  )}
                </div>
              )
            : null}
        </div>
      );
    case MessageType.VOICE:
    case MessageType.AUDIO:
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
    case MessageType.LOCATION:
      return message.location ? (
        <LocationMessage location={message.location} isOwn={isOwn} senderName={senderName} />
      ) : (
        <UnsupportedLocationMessage isOwn={isOwn} />
      );
    case MessageType.CONTACT:
      return contactPayload ? (
        <ContactCard
          payload={contactPayload}
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
    case MessageType.POLL: {
      const poll = (message.metadata as { poll?: import("@hacom/chat-shared-types/chat").PollInfo } | undefined)?.poll;
      if (!poll) return renderTextContent(message, isOwn, currentUsername, currentUserId, textRenderMode, isCollapsibleText, onToggleTextExpand);
      return (
        <PollMessage
          poll={poll}
          isOwn={isOwn}
          currentUserId={currentUserId}
          messageId={message.id}
          conversationId={message.conversationId}
          senderName={senderName}
        />
      );
    }
    case MessageType.REMINDER: {
      const reminder = (message.metadata as { reminder?: import("@hacom/chat-shared-types/chat").ReminderInfo } | undefined)?.reminder;
      if (!reminder) return renderTextContent(message, isOwn, currentUsername, currentUserId, textRenderMode, isCollapsibleText, onToggleTextExpand);
      return (
        <ReminderMessage
          reminder={reminder}
          isOwn={isOwn}
          currentUserId={currentUserId}
          messageId={message.id}
          conversationId={message.conversationId}
          senderName={senderName}
        />
      );
    }
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
      const isRichText = shouldTreatMessageContentAsRichText({
        contentFormat: message.contentFormat,
        content: message.content,
      });
      const firstUrl = extractFirstUrlFromContent(message.content, isRichText);
      // Use cached metadata from message if BE persisted it; otherwise fetch via RTK Query
      const cachedLinkPreview = message.metadata?.linkPreview;
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
          {firstUrl ? (
            cachedLinkPreview ? (
              <LinkPreviewCard
                url={firstUrl}
                isOwn={isOwn}
                meta={{
                  url: cachedLinkPreview.url,
                  hostname: (() => {
                    try { return new URL(cachedLinkPreview.url).hostname.replace(/^www\./, ""); } catch { return cachedLinkPreview.url; }
                  })(),
                  title: cachedLinkPreview.title,
                  description: cachedLinkPreview.description,
                  imageUrl: cachedLinkPreview.imageUrl,
                  siteName: cachedLinkPreview.siteName,
                  faviconUrl: cachedLinkPreview.favicon,
                }}
              />
            ) : (
              <MessageLinkPreview url={firstUrl} isOwn={isOwn} />
            )
          ) : null}
        </div>
      );
    }
  }
};

const areEqualMessageBodyRendererProps = (
  previous: MessageBodyRendererProps,
  next: MessageBodyRendererProps,
): boolean =>
  areMessagesRenderEquivalent(previous.message, next.message) &&
  previous.isOwn === next.isOwn &&
  previous.currentUsername === next.currentUsername &&
  previous.currentUserId === next.currentUserId &&
  previous.textRenderMode === next.textRenderMode &&
  previous.isCollapsibleText === next.isCollapsibleText &&
  previous.onToggleTextExpand === next.onToggleTextExpand &&
  previous.onImageClick === next.onImageClick &&
  previous.onFilePreview === next.onFilePreview;

export const MessageBodyRenderer = React.memo(
  MessageBodyRendererComponent,
  areEqualMessageBodyRendererProps,
);

export default MessageBodyRenderer;
