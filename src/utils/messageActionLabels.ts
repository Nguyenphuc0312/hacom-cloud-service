import type { TFunction } from "i18next";
import type { MessageActionId } from "./messageActionPolicy";

export const fallbackMessageActionLabels: Record<MessageActionId, string> = {
  react: "Thả cảm xúc",
  reply: "Trả lời",
  forward: "Chuyển tiếp",
  copy: "Sao chép",
  retry: "Gửi lại",
  pin: "Ghim tin nhắn",
  unpin: "Bỏ ghim",
  select: "Chọn nhiều tin nhắn",
  deleteForMe: "Xóa chỉ ở phía tôi",
  recall: "Thu hồi",
  adminDelete: "Xóa ở mọi người",
  more: "Thêm",
};

export const translateWithFallback = (
  t: TFunction,
  key: string,
  fallback: string,
): string => {
  const resolved = t(key, { defaultValue: fallback });
  return typeof resolved === "string" && resolved.trim() && resolved !== key
    ? resolved
    : fallback;
};
