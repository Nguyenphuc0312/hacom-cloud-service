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
  onRetry?: () => void;
  className?: string;
}

const MessageStatusLabel: React.FC<{
  status: Message["status"];
  onRetry?: () => void;
}> = ({ status, onRetry }) => {
  const { t } = useTranslation();

  if (status === "uploading") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        {t("chat:message.status.uploading")}
      </span>
    );
  }

  switch (status) {
    case MessageStatus.SENDING:
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          {t("chat:message.status.sending")}
        </span>
      );
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
      return (
        <span className="inline-flex items-center gap-2 text-danger">
          <span>
            {t("chat:message.status.failedInline", {
              defaultValue: "Khong gui duoc",
            })}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger transition-colors hover:bg-danger/10"
            >
              {t("chat:message.status.retry", { defaultValue: "Thu lai" })}
            </button>
          )}
        </span>
      );
    default:
      return null;
  }
};

export const MessageMeta: React.FC<MessageMetaProps> = ({
  message,
  isOwn,
  showStatus = false,
  onRetry,
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
        <MessageStatusLabel status={message.status} onRetry={onRetry} />
      )}
    </div>
  );
};

export default MessageMeta;
