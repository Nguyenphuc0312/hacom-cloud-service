import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  PencilIcon,
} from "@heroicons/react/24/solid";
import {
  ClockIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
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

const MessageStatusGlyph: React.FC<{ message: Message }> = ({ message }) => {
  const { t } = useTranslation();
  const { status, sendState } = message;

  if (status === "uploading") {
    return (
      <ClockIcon
        className="h-3 w-3"
        title={t("chat:message.status.uploading", {
          defaultValue: "Uploading",
        })}
      />
    );
  }

  if (
    sendState === "queued" ||
    sendState === "sending" ||
    sendState === "retrying" ||
    status === MessageStatus.SENDING
  ) {
    return (
      <ClockIcon
        className="h-3 w-3"
        title={t("chat:message.status.sending")}
      />
    );
  }

  if (sendState === "failed" || status === MessageStatus.FAILED) {
    return (
      <ExclamationCircleIcon
        className="h-3 w-3 text-danger"
        title={t("chat:message.status.failedInline", {
          defaultValue: "Failed to send",
        })}
      />
    );
  }

  if (status === MessageStatus.READ) {
    return (
      <span
        className="flex -space-x-1 text-secondary"
        title={t("chat:message.status.read", { defaultValue: "Read" })}
      >
        <CheckIcon className="h-3 w-3" />
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }

  if (status === MessageStatus.DELIVERED) {
    return (
      <span
        className="flex -space-x-1"
        title={t("chat:message.status.delivered", {
          defaultValue: "Delivered",
        })}
      >
        <CheckIcon className="h-3 w-3" />
        <CheckIcon className="h-3 w-3" />
      </span>
    );
  }

  if (status === MessageStatus.SENT || sendState === "sent") {
    return (
      <CheckIcon
        className="h-3 w-3"
        title={t("chat:message.status.sent")}
      />
    );
  }

  return null;
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
        <PencilIcon
          className="h-3 w-3"
          title={
            message.editedAt
              ? t("chat:message.editedAt", {
                  time: formatRelativeDate(new Date(message.editedAt)),
                  defaultValue: `Edited ${formatRelativeDate(new Date(message.editedAt))}`,
                })
              : t("chat:message.edited")
          }
        />
      )}
      <span>{timeStr}</span>
      {isOwn && showStatus && <MessageStatusGlyph message={message} />}
    </div>
  );
};

export default MessageMeta;
