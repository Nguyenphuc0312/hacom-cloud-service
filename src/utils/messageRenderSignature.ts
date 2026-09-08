import type { Attachment, Message, Mention } from "../types";

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

const scalar = (value: unknown): string => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return String(value);
  }
  if (type === "object" || type === "function") {
    const objectValue = value as object;
    let id = objectIds.get(objectValue);
    if (!id) {
      id = nextObjectId;
      nextObjectId += 1;
      objectIds.set(objectValue, id);
    }
    return `ref:${id}`;
  }
  return String(value);
};

const dynamicField = (
  source: Record<string, unknown>,
  key: string,
): string => scalar(source[key]);

export const getAttachmentRenderSignature = (
  attachment?: Attachment | null,
): string => {
  if (!attachment) return "";
  const dynamic = attachment as Attachment & Record<string, unknown>;
  return [
    attachment.id,
    attachment.type,
    attachment.fileName,
    attachment.mimeType,
    attachment.fileSize,
    attachment.width,
    attachment.height,
    attachment.url,
    attachment.thumbnailUrl,
    dynamicField(dynamic, "previewUrl"),
    dynamicField(dynamic, "status"),
    dynamicField(dynamic, "uploadStatus"),
    dynamicField(dynamic, "uploadProgress"),
    dynamicField(dynamic, "processingStatus"),
    dynamicField(dynamic, "scanStatus"),
    dynamicField(dynamic, "releaseStatus"),
    dynamicField(dynamic, "releaseReason"),
    dynamicField(dynamic, "canAttach"),
    dynamicField(dynamic, "canDownload"),
    dynamicField(dynamic, "canPreview"),
  ].map(scalar).join("|");
};

const getMentionSignature = (mentions?: Mention[]): string =>
  mentions
    ?.map((mention) =>
      [
        mention.userId,
        mention.displayName,
        mention.avatarUrl,
        mention.employeeCode,
      ].map(scalar).join(":"),
    )
    .join("|") ?? "";

const getReactionSignature = (message: Message): string => {
  const reactions = message.reactions;
  if (!reactions || reactions.length === 0) return "";
  return reactions
    .map((reaction) =>
      [
        reaction.emoji,
        reaction.count,
        reaction.userIds?.length,
        reaction.userIds?.join(","),
      ].map(scalar).join(":"),
    )
    .join("|");
};

const getReplySignature = (message: Message): string => {
  const reply = message.replyToMessage;
  if (!reply) return "";
  return [
    reply.id,
    reply.senderId,
    reply.senderName,
    reply.senderAvatar,
    reply.content,
    reply.contentFormat,
    reply.type,
    reply.isDeleted,
    reply.lifecycleStatus,
    scalar(reply.createdAt),
    reply.attachments?.map(getAttachmentRenderSignature).join("~"),
  ].map(scalar).join("|");
};

export const getMessageRenderSignature = (message: Message): string => {
  const dynamic = message as Message & Record<string, unknown>;
  return [
    message.id,
    message.localId,
    message.stableId,
    message.clientMessageId,
    message.conversationId,
    message.messageSeq,
    message.type,
    message.content,
    message.contentFormat,
    message.senderId,
    message.senderName,
    message.senderAvatar,
    scalar(message.createdAt),
    scalar(message.serverTs),
    scalar(message.updatedAt),
    scalar(message.editedAt),
    message.isEdited,
    message.isDeleted,
    message.lifecycleStatus,
    message.status,
    message.sendState,
    message.transportStatus,
    message.errorCode,
    message.failureReason,
    message.replyTo,
    scalar(message.forwardedFrom),
    scalar(message.location),
    scalar(message.metadata),
    getReplySignature(message),
    getMentionSignature(message.mentions),
    getReactionSignature(message),
    message.attachments?.map(getAttachmentRenderSignature).join("~"),
    dynamicField(dynamic, "uploadProgress"),
  ].map(scalar).join("||");
};

export const areAttachmentsRenderEquivalent = (
  previous?: Attachment | null,
  next?: Attachment | null,
): boolean =>
  previous === next ||
  getAttachmentRenderSignature(previous) === getAttachmentRenderSignature(next);

export const areMessagesRenderEquivalent = (
  previous: Message,
  next: Message,
): boolean =>
  previous === next ||
  getMessageRenderSignature(previous) === getMessageRenderSignature(next);
