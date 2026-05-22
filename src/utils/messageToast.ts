import React from "react";
import toastLib from "react-hot-toast";
import { MessageToastCard } from "../components/ui/MessageToastCard";

export const MESSAGE_TOAST_ID = "hc-new-message-toast";

const MEDIA_PREVIEW_MAP: Record<string, string> = {
  image: "Đã gửi một hình ảnh",
  images: "Đã gửi nhiều hình ảnh",
  file: "Đã gửi một tệp",
  audio: "Đã gửi một tin nhắn thoại",
  voice: "Đã gửi một tin nhắn thoại",
  video: "Đã gửi một video",
  contact: "Đã chia sẻ một danh thiếp",
  sticker: "Đã gửi một nhãn dán",
};

const MAX_PREVIEW_LENGTH = 80;

export const formatMessagePreview = (
  content: string,
  messageType?: string,
): string => {
  if (content && content.trim()) {
    return content.length > MAX_PREVIEW_LENGTH
      ? `${content.slice(0, MAX_PREVIEW_LENGTH)}…`
      : content;
  }
  const type = messageType?.toLowerCase();
  if (type && MEDIA_PREVIEW_MAP[type]) {
    return MEDIA_PREVIEW_MAP[type];
  }
  return "Tin nhắn mới";
};

export interface SingletonMessageToastOptions {
  senderName: string;
  conversationName?: string;
  isGroup?: boolean;
  avatarUrl?: string | null;
  messageType?: string;
  preview: string;
  conversationId: string;
  messageId?: string;
}

export const showSingletonMessageToast = (
  opts: SingletonMessageToastOptions,
): void => {
  const isGroup = opts.isGroup ?? false;
  const conversationName = opts.conversationName || opts.senderName;

  // Use toast.custom() so we can render the full card with avatar.
  // Pass a transparent/borderless style override on the library's outer wrapper
  // so MessageToastCard is fully in control of its own visual appearance.
  toastLib.custom(
    (t) =>
      React.createElement(MessageToastCard, {
        toastId: t.id,
        visible: t.visible,
        senderName: opts.senderName,
        conversationName,
        isGroup,
        avatarUrl: opts.avatarUrl ?? null,
        preview: opts.preview,
        conversationId: opts.conversationId,
        messageId: opts.messageId,
      }),
    {
      id: MESSAGE_TOAST_ID,
      duration: 5000,
      // Strip all default library wrapper styling so our card owns visuals.
      style: {
        background: "transparent",
        boxShadow: "none",
        border: "none",
        padding: 0,
        maxWidth: "none",
        minWidth: "auto",
        borderRadius: 0,
      },
      // Remove the toast-library class that would otherwise add sizing/borders
      // on top of our card's own styling.
      className: "",
    },
  );
};
