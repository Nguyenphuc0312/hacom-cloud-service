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
import { isFailedMessage } from "../../../utils/messageTimeline";
import type { ChatDensity } from "../../../stores/uiStore";
import { getTimelineDensityContract } from "../timelineDensity";

interface MessageMetaProps {
  message: Message;
  isOwn: boolean;
  showStatus?: boolean;
  density?: ChatDensity;
  layout?: "block" | "inline";
  className?: string;
}

const MessageStatusGlyph: React.FC<{ message: Message }> = React.memo(({ message }) => {
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

  if (isFailedMessage(message)) {
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
});

export const MessageMeta: React.FC<MessageMetaProps> = React.memo(
  ({
    message,
    isOwn,
    showStatus = false,
    density,
    layout = "block",
    className,
  }) => {
    const { t } = useTranslation();
    const contract = getTimelineDensityContract(density);
    const timeStr = formatMessageTime(new Date(message.createdAt));
    const fullTimestamp = new Date(message.createdAt).toLocaleString();
    const editedLabel = t("chat:message.edited");
    const editedTitle = message.editedAt
      ? t("chat:message.editedAtNoHistory", {
          time: formatRelativeDate(new Date(message.editedAt)),
          defaultValue: `Edited ${formatRelativeDate(new Date(message.editedAt))}. Previous versions are not available.`,
        })
      : t("chat:message.editedNoHistory", {
          defaultValue: "Message was edited. Previous versions are not available.",
        });

    return (
      <div
        className={clsx(
          "flex min-h-4 items-center text-[11px] leading-4",
          contract.cluster.meta,
          layout === "inline" ? "gap-1.5" : "flex-wrap gap-2",
          isOwn ? "justify-end text-text-muted/92" : "text-text-muted/84",
          layout === "inline" && "whitespace-nowrap",
          className,
        )}
        title={fullTimestamp}
      >
        {message.isEdited && (
          <span
            className="inline-flex items-center gap-1"
            title={editedTitle}
            aria-label={editedTitle}
          >
            <PencilIcon className="h-3 w-3" />
            <span>{editedLabel}</span>
          </span>
        )}
        <span>{timeStr}</span>
        {isOwn && showStatus && (
          <span className="inline-flex items-center text-text-muted/82">
            <MessageStatusGlyph message={message} />
          </span>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.isOwn === next.isOwn &&
    prev.showStatus === next.showStatus &&
    prev.density === next.density &&
    prev.layout === next.layout &&
    prev.className === next.className,
);

export default MessageMeta;
