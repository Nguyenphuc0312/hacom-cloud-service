import type { Message } from "../../../types";

/**
 * Dấu tick đã gửi/đã đọc gộp về cuối cụm là đúng, nhưng "đã chỉnh sửa" thuộc về
 * TỪNG tin: nếu chỉ tin cuối cụm render meta thì nhãn của tin bị sửa ở giữa cụm
 * biến mất và người đọc hiểu nhầm tin cuối mới là tin bị sửa → sai thông tin.
 */
export const shouldShowMessageMeta = (
  isGroupTail: boolean,
  message: Pick<Message, "isEdited">,
): boolean => isGroupTail || Boolean(message.isEdited);
