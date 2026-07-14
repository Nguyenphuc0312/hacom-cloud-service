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
  save: "Lưu tin nhắn",
  unsave: "Bỏ lưu",
  select: "Chọn nhiều tin nhắn",
  more: "Thêm",
};

export const fallbackMessageActionToasts = {
  saveSuccess: "Đã lưu tin nhắn",
  unsaveSuccess: "Đã bỏ lưu tin nhắn",
} as const;

export type MessageActionToastId = keyof typeof fallbackMessageActionToasts;

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

export const translateMessageActionToast = (
  t: TFunction,
  toastId: MessageActionToastId,
): string =>
  translateWithFallback(
    t,
    `chat:message.${toastId}`,
    fallbackMessageActionToasts[toastId],
  );
