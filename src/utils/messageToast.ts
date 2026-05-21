import React from "react";
import toastLib from "react-hot-toast";
import { dispatchOpenConversation } from "../features/chat/events/chatUiEvents";

export const MESSAGE_TOAST_ID = "hc-new-message-toast";

const MEDIA_PREVIEW_MAP: Record<string, string> = {
  image: "Đã gửi một hình ảnh",
  file: "Đã gửi một tệp",
  audio: "Đã gửi một tin nhắn thoại",
  contact: "Đã chia sẻ một danh thiếp",
};

export const formatMessagePreview = (
  content: string,
  messageType?: string,
): string => {
  if (messageType && MEDIA_PREVIEW_MAP[messageType]) {
    return MEDIA_PREVIEW_MAP[messageType];
  }
  return content || "Tin nhắn mới";
};

export interface SingletonMessageToastOptions {
  senderName: string;
  conversationName?: string;
  preview: string;
  conversationId: string;
  messageId?: string;
}

const avatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "hsl(215 60% 50%)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
};

const buttonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  maxWidth: 280,
  width: "100%",
};

const renderToastContent = (
  opts: SingletonMessageToastOptions,
  toastId: string,
): React.ReactElement => {
  const displayTitle =
    opts.conversationName && opts.conversationName !== opts.senderName
      ? opts.conversationName
      : opts.senderName;

  const displayBody =
    opts.conversationName && opts.conversationName !== opts.senderName
      ? `${opts.senderName}: ${opts.preview}`
      : opts.preview;

  const initial = opts.senderName.trim().charAt(0).toUpperCase() || "?";

  const handleClick = () => {
    toastLib.dismiss(toastId);
    dispatchOpenConversation({
      conversationId: opts.conversationId,
      messageId: opts.messageId,
    });
  };

  return React.createElement(
    "button",
    { type: "button", style: buttonStyle, onClick: handleClick },
    React.createElement(
      "div",
      { style: avatarStyle },
      initial,
    ),
    React.createElement(
      "div",
      { style: { minWidth: 0, flex: 1 } },
      React.createElement(
        "div",
        { style: { fontWeight: 600, fontSize: 13, lineHeight: "1.3" } },
        displayTitle,
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: 12,
            opacity: 0.75,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: 1,
          },
        },
        displayBody,
      ),
    ),
  );
};

export const showSingletonMessageToast = (
  opts: SingletonMessageToastOptions,
): void => {
  const fullOpts: SingletonMessageToastOptions = {
    ...opts,
    conversationName: opts.conversationName || opts.senderName,
  };
  toastLib.custom((t) => renderToastContent(fullOpts, t.id), {
    id: MESSAGE_TOAST_ID,
    duration: 5500,
  });
};
