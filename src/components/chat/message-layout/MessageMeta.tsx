import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CheckIcon, PencilIcon } from "@heroicons/react/24/solid";
import type { Message } from "../../../types";
import { MessageStatus } from "../../../types";
import {
  formatMessageTime,
  formatRelativeDate,
} from "../../../utils/formatTime";

interface MessageMetaProps {
  message: Message;
  isOwn: boolean;
  showStatus?: boolean;
  className?: string;
}

const MessageStatusLabel: React.FC<{
  status: Message["status"];
}> = ({ status }) => {
  const { t } = useTranslation();

  if (status === "uploading") {
    return null;
  }

  switch (status) {
    case MessageStatus.SENDING:
      return null;
    case MessageStatus.SENT:
      return (
        <span className="inline-flex items-center gap-1">
          <CheckIcon className="h-3 w-3" />
          {t("chat:message.status.sent")}
        </span>
      );
    case MessageStatus.DELIVERED:
      return (
        <span className="inline-flex items-center gap-1">
          <span className="flex -space-x-1">
            <CheckIcon className="h-3 w-3" />
            <CheckIcon className="h-3 w-3" />
          </span>
          {t("chat:message.status.delivered", { defaultValue: "Delivered" })}
        </span>
      );
    case MessageStatus.READ:
      return (
        <span className="inline-flex items-center gap-1 text-secondary">
          <span className="flex -space-x-1">
            <CheckIcon className="h-3 w-3" />
            <CheckIcon className="h-3 w-3" />
          </span>
          {t("chat:message.status.read", { defaultValue: "Read" })}
        </span>
      );
    case MessageStatus.FAILED:
      return null;
    default:
      return null;
  }
};

export const MessageMeta: React.FC<MessageMetaProps> = ({
  message,
  isOwn,
  showStatus = false,
  className,
}) => {
  const { t } = useTranslation();
  const timeStr = formatMessageTime(new Date(message.createdAt));

  return (
    <div
      className={clsx(
        "mt-0.5 flex min-h-4 flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[10px] leading-tight",
        isOwn ? "justify-end text-text-muted" : "text-text-muted/90",
        className,
      )}
    >
      {message.isEdited && (
        <span
          className="inline-flex items-center gap-1"
          title={
            message.editedAt
              ? t("chat:message.editedAt", {
                  time: formatRelativeDate(new Date(message.editedAt)),
                  defaultValue: `Edited ${formatRelativeDate(new Date(message.editedAt))}`,
                })
              : t("chat:message.edited")
          }
        >
          <PencilIcon className="h-3 w-3" />
          {t("chat:message.edited")}
        </span>
      )}
      <span>{timeStr}</span>
      {isOwn && showStatus && (
        <MessageStatusLabel status={message.status} />
      )}
    </div>
  );
};

export default MessageMeta;
