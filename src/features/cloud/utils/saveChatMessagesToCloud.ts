import { resolvePublicResourceUrl } from "../../../config";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { fileApi } from "../../../services/api";
import type { Attachment, Message } from "../../../types";
import { fetchResourceBlob } from "../../../utils/downloadFile";
import { getCopyableMessageText } from "../../../utils/messageCopy";
import { cloudApi } from "../api/cloudApi";
import { CLOUD_MAX_UPLOAD_BYTES } from "../constants";

interface CloudForwardResult {
  savedItemCount: number;
}

export interface CloudForwardMessageSelection {
  messages: Message[];
  missingIds: string[];
}

interface LinkPreviewMetadata {
  linkPreview?: {
    url?: string;
    title?: string;
  };
}

const singleHttpUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed;
};

const resolveSourceAttachmentUrl = async (
  message: Message,
  attachment: Attachment,
): Promise<string> => {
  try {
    const response = await fileApi.getDownloadUrl({
      conversationId: message.conversationId,
      objectKey: attachment.objectKey || undefined,
      attachmentId: attachment.id || undefined,
    });
    const payload = unwrapApiSuccess(response);
    const signedUrl = resolvePublicResourceUrl(payload.url, {
      context: "download",
      allowBlob: true,
      allowDataImage: attachment.mimeType?.startsWith("image/"),
    });
    if (signedUrl) return signedUrl;
  } catch {
    // Older attachments may expose a usable URL directly. Validate it below
    // before failing the transfer.
  }

  const fallbackUrl = resolvePublicResourceUrl(
    attachment.downloadUrl ?? attachment.url,
    {
      context: "download",
      allowBlob: true,
      allowDataImage: attachment.mimeType?.startsWith("image/"),
    },
  );
  if (fallbackUrl) return fallbackUrl;

  throw new Error(`Không thể đọc tệp ${attachment.fileName || "đính kèm"}`);
};

const uploadAttachmentToCloud = async (
  userId: string,
  message: Message,
  attachment: Attachment,
): Promise<void> => {
  if (
    typeof attachment.fileSize === "number" &&
    attachment.fileSize > CLOUD_MAX_UPLOAD_BYTES
  ) {
    throw new Error(
      `${attachment.fileName || "Tệp đính kèm"} vượt quá giới hạn 100 MB`,
    );
  }

  const sourceUrl = await resolveSourceAttachmentUrl(message, attachment);
  const blob = await fetchResourceBlob(sourceUrl, {
    totalBytesHint: attachment.fileSize,
    maxBytes: CLOUD_MAX_UPLOAD_BYTES,
  });
  const fileName = attachment.fileName?.trim() || "tep-dinh-kem";
  const file = new File([blob], fileName, {
    type: attachment.mimeType || blob.type || "application/octet-stream",
  });
  const session = await cloudApi.initiateUpload(userId, file);
  await cloudApi.uploadObject(session, file, () => undefined);
  await cloudApi.completeUpload(userId, session.uploadSessionId);
};

const saveMessageText = async (
  userId: string,
  message: Message,
  text: string,
): Promise<void> => {
  const metadata = message.metadata as LinkPreviewMetadata | undefined;
  const previewUrl = metadata?.linkPreview?.url?.trim();
  const exactUrl = singleHttpUrl(text);

  if (exactUrl && (!previewUrl || previewUrl === exactUrl)) {
    await cloudApi.createLink(
      userId,
      exactUrl,
      metadata?.linkPreview?.title?.trim() || exactUrl,
    );
    return;
  }

  await cloudApi.createText(userId, text);
};

const getMessageIdentityCandidates = (
  message: Message,
): Array<string | undefined> => [
  message.id,
  message.localId,
  message.stableId,
  message.clientMessageId,
];

/**
 * Resolve a drag payload against the source conversation cache while preserving
 * the user's selection order. A missing id is reported instead of silently
 * forwarding only part of a multi-message selection.
 */
export const selectChatMessagesForCloudForward = (
  availableMessages: readonly Message[],
  requestedIds: readonly string[],
): CloudForwardMessageSelection => {
  const messages: Message[] = [];
  const missingIds: string[] = [];

  for (const requestedId of requestedIds) {
    const message = availableMessages.find((candidate) =>
      getMessageIdentityCandidates(candidate).includes(requestedId),
    );
    if (message) messages.push(message);
    else missingIds.push(requestedId);
  }

  return { messages, missingIds };
};

/**
 * Save visible Hacom Chat messages into the user's Cloud. Attachments are
 * copied through the browser because the current Cloud contract has no
 * server-side import endpoint.
 */
export const saveChatMessagesToCloud = async (
  messages: readonly Message[],
  userId: string,
): Promise<CloudForwardResult> => {
  if (!userId) throw new Error("Không xác định được người dùng hiện tại");

  const messagePlans = messages.map((message) => {
    const attachments = message.attachments ?? [];
    const text = getCopyableMessageText(message);
    if (attachments.length === 0 && !text) {
      throw new Error("Loại tin nhắn này chưa thể lưu vào Hacom Cloud");
    }
    const oversizedAttachment = attachments.find(
      (attachment) =>
        typeof attachment.fileSize === "number" &&
        attachment.fileSize > CLOUD_MAX_UPLOAD_BYTES,
    );
    if (oversizedAttachment) {
      throw new Error(
        `${oversizedAttachment.fileName || "Tệp đính kèm"} vượt quá giới hạn 100 MB`,
      );
    }
    return { message, attachments, text };
  });

  let savedItemCount = 0;
  for (const plan of messagePlans) {
    if (plan.text) {
      await saveMessageText(userId, plan.message, plan.text);
      savedItemCount += 1;
    }
    for (const attachment of plan.attachments) {
      await uploadAttachmentToCloud(userId, plan.message, attachment);
      savedItemCount += 1;
    }
  }

  return { savedItemCount };
};
