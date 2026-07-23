/**
 * Chuẩn hoá payload thô (REST / WebSocket) về shape canonical của FE.
 *
 * Tách khỏi `chatStore.ts` vì đây là logic THUẦN: không đọc/ghi store, không
 * side effect — nên test được trực tiếp thay vì phải chọc qua cửa hậu
 * `__normalizeMessageForTest`.
 *
 * BE trả cả camelCase lẫn snake_case tuỳ endpoint, nên hầu hết trường đều phải
 * dò nhiều tên. Đừng rút gọn các chuỗi `??` bên dưới nếu chưa kiểm tra thực tế.
 */
import type { Attachment, Message } from "../types";
import {
  asNumberValue,
  asRecord,
  asStringValue,
} from "../utils/payloadGuards";

// Re-export để chatStore và nơi khác vẫn import được từ đây như trước.
export { asNumberValue, asRecord, asStringValue };

export const toDateObject = (
  value: unknown,
  fallback: Date = new Date(),
): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
};

/** Bỏ qua attachment không có id, hoặc không có chỗ nào lấy được nội dung. */
export const normalizeAttachments = (value: unknown): Message["attachments"] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((attachmentRaw) => {
      const attachment = asRecord(attachmentRaw);
      if (!attachment) return null;

      const id =
        asStringValue(attachment.id) ?? asStringValue(attachment.fileId);
      const objectKey = asStringValue(attachment.objectKey);
      const url =
        asStringValue(attachment.url) ??
        asStringValue(attachment.downloadUrl) ??
        asStringValue(attachment.fileUrl);
      if (!id || (!objectKey && !url)) return null;

      return {
        id,
        type: (asStringValue(attachment.type) ?? "other") as Attachment["type"],
        objectKey,
        url,
        downloadUrl: asStringValue(attachment.downloadUrl),
        expiresAt: asStringValue(attachment.expiresAt),
        fileName:
          asStringValue(attachment.fileName) ??
          asStringValue(attachment.filename) ??
          asStringValue(attachment.originalName),
        mimeType:
          asStringValue(attachment.mimeType) ??
          asStringValue(attachment.mimetype),
        fileSize:
          asNumberValue(attachment.fileSize) ?? asNumberValue(attachment.size),
        thumbnailUrl: asStringValue(attachment.thumbnailUrl),
        width: asNumberValue(attachment.width),
        height: asNumberValue(attachment.height),
        duration: asNumberValue(attachment.duration),
      } as Attachment;
    })
    .filter((item): item is Attachment => item !== null);
};

/**
 * Nhận cả hai dạng: đã gộp sẵn theo emoji (có `userIds`) thì trả nguyên, còn
 * dạng phẳng mỗi lượt thả một dòng thì gộp lại. Set khử trùng lặp khi cùng một
 * người thả cùng emoji hai lần.
 */
export const normalizeReactions = (value: unknown): Message["reactions"] => {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];

  const first = asRecord(value[0]);
  if (first && Array.isArray(first.userIds)) {
    return value as Message["reactions"];
  }

  const grouped = new Map<string, Set<string>>();

  for (const reactionRaw of value) {
    const reaction = asRecord(reactionRaw);
    if (!reaction) continue;

    const emoji = asStringValue(reaction.emoji);
    const userId =
      asStringValue(reaction.userId) ??
      asStringValue(reaction.senderId) ??
      asStringValue(reaction.user_id);
    if (!emoji || !userId) continue;

    if (!grouped.has(emoji)) grouped.set(emoji, new Set());
    grouped.get(emoji)?.add(userId);
  }

  return Array.from(grouped.entries()).map(([emoji, userIds]) => ({
    emoji,
    userIds: Array.from(userIds),
    count: userIds.size,
  }));
};

/**
 * Chuẩn hoá mentions về Mention[].
 * Nhận cả dạng cũ `string[]` (chỉ userId) lẫn dạng object đã resolve từ
 * chat-shared-types v1.4.0+. Dạng cũ được gắn displayName rỗng để FE vẫn render
 * được token mà không vỡ.
 */
export const normalizeMentions = (value: unknown): Message["mentions"] => {
  if (!Array.isArray(value)) return [];
  const result: NonNullable<Message["mentions"]> = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const userId = entry.trim();
      if (userId) result.push({ userId, displayName: "" });
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const userId =
      asStringValue(record.userId) ??
      asStringValue(record.user_id) ??
      asStringValue(record.id);
    if (!userId) continue;
    const displayName =
      asStringValue(record.displayName) ??
      asStringValue(record.display_name) ??
      asStringValue(record.fullName) ??
      "";
    const employeeCode =
      asStringValue(record.employeeCode) ?? asStringValue(record.employee_code);
    const avatarUrl =
      asStringValue(record.avatarUrl) ?? asStringValue(record.avatar_url);
    result.push({
      userId,
      displayName,
      ...(employeeCode ? { employeeCode } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    });
  }
  return result;
};

/**
 * Toạ độ ngoài phạm vi hợp lệ hoặc thiếu mốc thời gian → coi như không có vị
 * trí, thà không hiển thị còn hơn ghim sai chỗ trên bản đồ.
 */
export const normalizeLocationPayload = (
  source: Record<string, unknown>,
): Message["location"] => {
  const content = asRecord(source.content);
  const metadata = asRecord(source.metadata);
  const location =
    asRecord(source.location) ??
    asRecord(content?.location) ??
    asRecord(metadata?.location) ??
    asRecord(source.locationData);

  if (!location) return undefined;

  const latitude =
    asNumberValue(location.latitude) ?? asNumberValue(location.lat);
  const longitude =
    asNumberValue(location.longitude) ?? asNumberValue(location.lng);
  const capturedAt =
    asStringValue(location.capturedAt) ?? asStringValue(location.captured_at);

  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !capturedAt
  ) {
    return undefined;
  }

  const accuracyM =
    asNumberValue(location.accuracyM) ?? asNumberValue(location.accuracy_m);

  return {
    latitude,
    longitude,
    ...(accuracyM !== undefined ? { accuracyM } : {}),
    capturedAt,
  };
};
