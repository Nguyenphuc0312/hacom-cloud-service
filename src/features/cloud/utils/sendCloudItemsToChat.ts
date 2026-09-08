import { MessageType, FileType, type Message } from "../../../types";
import type { SendMessageInput } from "../../api/chatApi";
import { cloudApi } from "../api/cloudApi";
import { CLOUD_CONVERSATION_ID } from "../constants";
import type { CloudItem } from "../types";
import { fetchResourceBlob } from "../../../utils/downloadFile";
import {
  resolveUploadMaxBytesForMimeType,
  resolveUploadMimeTypeForFile,
  validateUploadFileType,
  resolveUploadFileType,
} from "../../../utils/uploadPolicy";
import uploadClient from "../../../services/uploadClient";
import { generateClientMessageId } from "../../../utils/messageIdFactory";

export interface CloudToChatProgress {
  completed: number;
  total: number;
  targetConversationId: string;
  itemId: string;
}

export interface CloudToChatFailure {
  itemId: string;
  targetConversationId: string;
  message: string;
}

export interface CloudToChatResult {
  messagesByTarget: Record<string, Message[]>;
  failures: CloudToChatFailure[];
}

export interface SendCloudItemsToChatOptions {
  userId: string;
  itemIds: readonly string[];
  targetConversationIds: readonly string[];
  /** Already-loaded Cloud rows avoid a second request for menu/selection sends. */
  items?: readonly CloudItem[];
  note?: string;
  sendMessage: (input: SendMessageInput) => Promise<Message>;
  onProgress?: (progress: CloudToChatProgress) => void;
}

const toItemName = (item: CloudItem): string =>
  item.title?.trim() ||
  (item.type === "image"
    ? "hinh-anh"
    : item.type === "video"
      ? "video"
      : item.type === "audio"
        ? "am-thanh"
        : "tep-dinh-kem");

const messageText = (item: CloudItem): string =>
  item.type === "link"
    ? item.url?.trim() || item.title?.trim() || ""
    : item.content?.trim() || "";

const messageTypeForItem = (item: CloudItem): MessageType => {
  switch (item.type) {
    case "image":
      return MessageType.IMAGE;
    case "video":
      return MessageType.VIDEO;
    case "audio":
      return MessageType.AUDIO;
    default:
      return MessageType.FILE;
  }
};

const attachmentTypeForMime = (mimeType: string): FileType =>
  resolveUploadFileType(mimeType);

const resolveCloudItems = async (
  userId: string,
  itemIds: readonly string[],
  providedItems: readonly CloudItem[] | undefined,
): Promise<CloudItem[]> => {
  const providedById = new Map(
    (providedItems ?? []).map((item) => [item.id, item]),
  );
  return Promise.all(
    itemIds.map(async (itemId) => {
      const provided = providedById.get(itemId);
      // Always ask the server for an item not present in the current timeline.
      // This is the path used by quick drag from a Cloud bubble.
      return provided ?? (await cloudApi.getItem(userId, itemId));
    }),
  );
};

const assertForwardableItem = (item: CloudItem): void => {
  if (item.id === CLOUD_CONVERSATION_ID) {
    throw new Error("Không thể chuyển tiếp cuộc trò chuyện Cloud");
  }
  if (item.status !== "ready") {
    throw new Error("Tệp chưa sẵn sàng để chuyển tiếp");
  }
  if (["text", "link"].includes(item.type) && !messageText(item)) {
    throw new Error("Tin nhắn Cloud đang trống");
  }
};

const resolveAttachmentMetadata = (item: CloudItem) => {
  const fileName = toItemName(item);
  const mimeType = resolveUploadMimeTypeForFile({
    name: fileName,
    type: item.contentType || "",
  });
  const validation = validateUploadFileType({ fileName, mimeType });
  if (!validation.ok) {
    throw new Error("Định dạng tệp không được Chat hỗ trợ");
  }
  const maxBytes = resolveUploadMaxBytesForMimeType(mimeType);
  if (item.sizeBytes > maxBytes) {
    throw new Error("Tệp vượt quá giới hạn upload của Chat");
  }
  return { fileName, mimeType, maxBytes };
};

const uploadCloudAttachment = async (
  userId: string,
  item: CloudItem,
  targetConversationId: string,
): Promise<NonNullable<SendMessageInput["attachments"]>[number]> => {
  const access = await cloudApi.getFileAccess(userId, item.id);
  const metadata = resolveAttachmentMetadata({
    ...item,
    title: item.title?.trim() || access.fileName,
    contentType: item.contentType || access.contentType,
    sizeBytes: access.sizeBytes || item.sizeBytes,
  });
  const blob = await fetchResourceBlob(access.url, {
    totalBytesHint: access.sizeBytes || item.sizeBytes,
    maxBytes: metadata.maxBytes,
  });
  const file = new File([blob], metadata.fileName, { type: metadata.mimeType });
  const validated = uploadClient.validateUpload(file, "message_attachment");
  const clientMessageId = generateClientMessageId(targetConversationId);
  const reserved = await uploadClient.reserveUpload({
    purpose: "message_attachment",
    conversationId: targetConversationId,
    filename: metadata.fileName,
    mimeType: validated.mimeType,
    sizeBytes: file.size,
    clientMessageId,
  });

  let completed: Awaited<ReturnType<typeof uploadClient.completeUpload>>;
  try {
    await uploadClient.uploadToSignedUrl({
      signedUrl: reserved.uploadUrl,
      method: reserved.uploadMethod || "PUT",
      headers: { ...(reserved.uploadHeaders || {}), "Content-Type": validated.mimeType },
      file,
    });
    completed = await uploadClient.completeUpload({
      uploadId: reserved.uploadId,
      conversationId: targetConversationId,
      objectKey: reserved.objectKey,
    });
  } catch (error) {
    await uploadClient
      .abandonUpload({ uploadId: reserved.uploadId, reason: "cloud_forward_failed" })
      .catch(() => undefined);
    throw error;
  }
  const attachment = completed.attachment as {
    id?: string;
    objectKey?: string;
    url?: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
    canAttach?: boolean;
  };
  if (!attachment.id) {
    await uploadClient
      .abandonUpload({ uploadId: reserved.uploadId, reason: "cloud_forward_missing_file_id" })
      .catch(() => undefined);
    throw new Error("Upload Chat không trả về file ID");
  }
  if (attachment.canAttach === false) {
    await uploadClient
      .abandonUpload({ uploadId: reserved.uploadId, reason: "cloud_forward_security_pending" })
      .catch(() => undefined);
    throw new Error("Tệp đang được kiểm tra và chưa thể gửi");
  }

  return {
    id: attachment.id,
    type: attachmentTypeForMime(validated.mimeType),
    objectKey: attachment.objectKey,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl,
    fileName: metadata.fileName,
    mimeType: validated.mimeType,
    fileSize: file.size,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
  };
};

const sendItem = async (
  userId: string,
  item: CloudItem,
  targetConversationId: string,
  sendMessage: SendCloudItemsToChatOptions["sendMessage"],
): Promise<Message> => {
  assertForwardableItem(item);
  const content = messageText(item);
  const input: SendMessageInput = {
    conversationId: targetConversationId,
    clientMessageId: generateClientMessageId(targetConversationId),
    content,
    plainText: content,
    type: item.type === "text" || item.type === "link" ? MessageType.TEXT : messageTypeForItem(item),
  };
  if (item.type === "link" && item.url?.trim()) {
    input.linkPreview = {
      url: item.url.trim(),
      title: item.title?.trim() || item.url.trim(),
    };
  }
  if (!["text", "link"].includes(item.type)) {
    input.attachments = [await uploadCloudAttachment(userId, item, targetConversationId)];
    input.content = "";
  }
  return sendMessage(input);
};

/**
 * Copy Cloud items into one or more Chat conversations. Cloud IDs are never
 * passed to `/messages/forward`; each resulting Chat message gets a fresh
 * message/file identity owned by the Chat service.
 */
export const sendCloudItemsToChat = async (
  options: SendCloudItemsToChatOptions,
): Promise<CloudToChatResult> => {
  if (!options.userId) throw new Error("Không xác định được người dùng hiện tại");
  const targetIds = [...new Set(options.targetConversationIds)].filter(
    (id) => id && id !== CLOUD_CONVERSATION_ID,
  );
  const itemIds = [...new Set(options.itemIds)];
  if (targetIds.length === 0 || itemIds.length === 0) {
    throw new Error("Chưa chọn tin nhắn hoặc cuộc trò chuyện đích");
  }

  const items = await resolveCloudItems(options.userId, itemIds, options.items);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = itemIds
    .map((id) => itemsById.get(id))
    .filter((item): item is CloudItem => Boolean(item));
  const total = targetIds.length * (orderedItems.length + (options.note?.trim() ? 1 : 0));
  const messagesByTarget: Record<string, Message[]> = {};
  const failures: CloudToChatFailure[] = [];
  let completed = 0;

  for (const targetConversationId of targetIds) {
    const sent: Message[] = [];
    messagesByTarget[targetConversationId] = sent;
    for (const item of orderedItems) {
      try {
        sent.push(await sendItem(options.userId, item, targetConversationId, options.sendMessage));
      } catch (error) {
        failures.push({
          itemId: item.id,
          targetConversationId,
          message: error instanceof Error ? error.message : "Không thể chuyển tiếp tin nhắn",
        });
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total, targetConversationId, itemId: item.id });
      }
    }
    const note = options.note?.trim();
    if (note && sent.length > 0) {
      try {
        sent.push(
          await options.sendMessage({
            conversationId: targetConversationId,
            clientMessageId: generateClientMessageId(targetConversationId),
            content: note,
            plainText: note,
            type: MessageType.TEXT,
          }),
        );
      } catch (error) {
        failures.push({
          itemId: "note",
          targetConversationId,
          message: error instanceof Error ? error.message : "Không thể gửi lời nhắn kèm theo",
        });
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total, targetConversationId, itemId: "note" });
      }
    }
  }

  return { messagesByTarget, failures };
};

export default sendCloudItemsToChat;
