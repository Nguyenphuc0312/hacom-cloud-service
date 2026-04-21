import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { TextMessage } from "../../message/TextMessage";
import { ImageMessage } from "../../message/ImageMessage";
import { FileMessageCard } from "../../message/FileMessageCard";
import { VoiceMessage } from "../../message/VoiceMessage";
import { LinkPreviewCard } from "../../message/LinkPreviewCard";
import { toast } from "../../ui";
import { dispatchContactProfileView } from "../../../features/chat/events/chatUiEvents";
import type { Attachment, Message } from "../../../types";
import { MessageType } from "../../../types";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";
import { isUuid } from "../../../utils/isUuid";

interface MessageBodyRendererProps {
  message: Message;
  isOwn: boolean;
  currentUsername?: string;
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

const ContactCard: React.FC<{
  payload: ContactPayloadView;
  isOwn: boolean;
  messageId: string;
  conversationId?: string;
}> = ({ payload, isOwn, messageId, conversationId }) => {
  const { t } = useTranslation();
  const hasDispatchableContactUserId = Boolean(
    payload.contactUserId && isUuid(payload.contactUserId),
  );

  return (
    <div
      className={clsx(
        "min-w-[14rem] space-y-2 rounded-xl border px-3 py-2.5",
        isOwn
          ? "border-text-inverse/15 bg-text-inverse/8"
          : "border-border bg-surface-overlay/50",
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar src={payload.avatarUrl} alt={payload.displayName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{payload.displayName}</p>
          {payload.username && (
            <p className="truncate text-xs opacity-80">@{payload.username}</p>
          )}
        </div>
      </div>

      {(payload.phone || payload.email) && (
        <div className="space-y-0.5 text-xs opacity-85">
          {payload.phone && <p>{payload.phone}</p>}
          {payload.email && <p>{payload.email}</p>}
        </div>
      )}

      {(payload.orgUnit || payload.title) && (
        <div className="space-y-0.5 text-xs opacity-80">
          {payload.orgUnit && <p>{payload.orgUnit}</p>}
          {payload.title && <p>{payload.title}</p>}
        </div>
      )}

      {payload.contactUserId && (
        <button
          type="button"
          onClick={() => {
            console.info("direct_dm.source_trace", {
              source: "MessageBodyRenderer.contactCard",
              messageId,
              conversationId,
              contactUserId: payload.contactUserId,
            });

            if (!hasDispatchableContactUserId) {
              toast.error(
                t("chat:contactShare.invalidProfile", {
                  defaultValue: "This contact card cannot start a chat.",
                }),
              );
              return;
            }

            dispatchContactProfileView({ userId: payload.contactUserId });
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
};

export const MessageBodyRenderer: React.FC<MessageBodyRendererProps> = ({
  message,
  isOwn,
  currentUsername,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  onImageClick,
  onFilePreview,
}) => {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const contactPayload =
    message.type === MessageType.CONTACT ? extractContactPayload(message) : null;

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
                  caption={index === 0 ? message.content : undefined}
                  isOwn={isOwn}
                  onClick={onImageClick}
                />
              ))
            : (
              <TextMessage
                content={message.content}
                isOwn={isOwn}
                currentUsername={currentUsername}
                renderMode={textRenderMode}
                isCollapsible={isCollapsibleText}
                onToggleExpand={onToggleTextExpand}
              />
            )}
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
            : (
              <TextMessage
                content={message.content}
                isOwn={isOwn}
                currentUsername={currentUsername}
                renderMode={textRenderMode}
                isCollapsible={isCollapsibleText}
                onToggleExpand={onToggleTextExpand}
              />
            )}
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
            : (
              <TextMessage
                content={message.content}
                isOwn={isOwn}
                currentUsername={currentUsername}
                renderMode={textRenderMode}
                isCollapsible={isCollapsibleText}
                onToggleExpand={onToggleTextExpand}
              />
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
          renderMode={textRenderMode}
          isCollapsible={isCollapsibleText}
          onToggleExpand={onToggleTextExpand}
        />
      );
    case MessageType.TEXT:
    default: {
      const firstUrl = extractFirstUrl(message.content);
      return (
        <div className="space-y-2">
          <TextMessage
            content={message.content}
            isOwn={isOwn}
            currentUsername={currentUsername}
            renderMode={textRenderMode}
            isCollapsible={isCollapsibleText}
            onToggleExpand={onToggleTextExpand}
          />
          {firstUrl ? <LinkPreviewCard url={firstUrl} isOwn={isOwn} /> : null}
        </div>
      );
    }
  }
};

export default MessageBodyRenderer;
