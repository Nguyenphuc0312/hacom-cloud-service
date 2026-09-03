import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@heroicons/react/24/solid";
import {
  ClockIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "../../../types";
import { MessageStatus } from "../../../types";
import {
  formatMessageTime,
  formatRelativeDate,
  formatCalendarDateTime,
} from "../../../utils/formatTime";
import { isFailedMessage } from "../../../utils/messageTimeline";
import type { ChatDensity } from "../../../stores/uiStore";
import { getTimelineDensityContract } from "../timelineDensity";
import { areMessagesRenderEquivalent } from "../../../utils/messageRenderSignature";

interface MessageMetaProps {
  message: Message;
  isOwn: boolean;
  showStatus?: boolean;
  density?: ChatDensity;
  layout?: "block" | "inline";
  className?: string;
  onRetry?: (message: Message) => void;
  onViewEditHistory?: (messageId: string) => void;
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
    const label = t("chat:message.status.read", { defaultValue: "Read" });
    return (
      <span
        className="flex -space-x-1 text-secondary"
        title={label}
        aria-label={label}
      >
        <CheckIcon className="h-3 w-3" aria-hidden="true" />
        <CheckIcon className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }

  if (status === MessageStatus.DELIVERED) {
    const label = t("chat:message.status.delivered", { defaultValue: "Delivered" });
    return (
      <span
        className="flex -space-x-1"
        title={label}
        aria-label={label}
      >
        <CheckIcon className="h-3 w-3" aria-hidden="true" />
        <CheckIcon className="h-3 w-3" aria-hidden="true" />
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
}, (prev, next) => areMessagesRenderEquivalent(prev.message, next.message));

export const MessageMeta: React.FC<MessageMetaProps> = React.memo(
  ({
    message,
    isOwn,
    showStatus = false,
    density,
    layout = "block",
    className,
    onRetry,
    onViewEditHistory,
  }) => {
    const { t } = useTranslation();
    const contract = getTimelineDensityContract(density);
    const timeStr = formatMessageTime(new Date(message.createdAt));
    const fullTimestamp = formatCalendarDateTime(new Date(message.createdAt));
    const editedLabel = t("chat:message.edited");
    const editedTitle = message.editedAt
      ? t("chat:message.editedAtNoHistory", {
          time: formatRelativeDate(new Date(message.editedAt)),
          defaultValue: `Edited ${formatRelativeDate(new Date(message.editedAt))}. Previous versions are not available.`,
        })
      : t("chat:message.editedNoHistory", {
          defaultValue: "Message was edited. Previous versions are not available.",
        });
    const isFailed = isFailedMessage(message);
    const isRetrying =
      message.sendState === "retrying" ||
      message.sendState === "sending" ||
      message.status === MessageStatus.SENDING;
    const canRetry =
      isOwn &&
      isFailed &&
      Boolean(onRetry) &&
      ![
        "DIRECT_CHAT_FRIENDSHIP_REQUIRED",
        "AUTH_FORBIDDEN",
        "FORBIDDEN",
        "PERMISSION_DENIED",
        "ROOM_INSUFFICIENT_PERMISSIONS",
        "USER_BLOCKED",
        "VALIDATION_ERROR",
        "VALIDATION_FAILED",
      ].includes(String(message.errorCode || "").toUpperCase()) &&
      message.failureReason !== "permission";

    return (
      <div
        className={clsx(
          "flex min-h-4 max-w-full min-w-0 items-center text-[11px] leading-4",
          contract.cluster.meta,
          layout === "inline" ? "gap-1" : "flex-wrap gap-1",
          isOwn ? "justify-end text-text-muted/92" : "text-text-muted/84",
          className,
        )}
        title={fullTimestamp}
      >
        {message.isEdited && (
          onViewEditHistory ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center rounded-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title={t("chat:message.editHistory.viewTitle", {
                defaultValue: "Xem lịch sử chỉnh sửa",
              })}
              aria-label={t("chat:message.editHistory.viewTitle", {
                defaultValue: "Xem lịch sử chỉnh sửa",
              })}
              onClick={() => onViewEditHistory(message.id)}
            >
              <span>{editedLabel}</span>
            </button>
          ) : (
            <span
              className="inline-flex shrink-0 items-center"
              title={editedTitle}
              aria-label={editedTitle}
            >
              <span>{editedLabel}</span>
            </span>
          )
        )}
        {message.isEdited && (
          <span className="select-none opacity-60" aria-hidden="true">
            ·
          </span>
        )}
        <span className="shrink-0">{timeStr}</span>
        {isFailed && (
          <span
            className={clsx(
              "inline-flex min-w-0 items-center gap-1 text-danger",
              layout === "inline" ? "whitespace-nowrap" : "flex-wrap",
            )}
          >
            <ExclamationCircleIcon className="h-3 w-3 shrink-0" />
            <span className="min-w-0">
              {t("chat:message.status.failedInline", {
                defaultValue: "Không gửi được",
              })}
            </span>
          </span>
        )}
        {canRetry && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center rounded-full border border-danger/30 px-2 py-0.5 text-[11px] font-medium leading-4 text-danger transition-colors hover:bg-danger/10 focus:outline-none focus:ring-2 focus:ring-danger/25 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRetrying}
            onClick={() => onRetry?.(message)}
          >
            {isRetrying
              ? t("chat:message.status.retrying", {
                  defaultValue: "Đang gửi lại",
                })
              : t("chat:message.status.retry", {
                  defaultValue: "Nhắn lại",
                })}
          </button>
        )}
        {isOwn && showStatus && !isFailed && (
          <span className="inline-flex items-center text-text-muted/82">
            <MessageStatusGlyph message={message} />
          </span>
        )}
      </div>
    );
  },
  (prev, next) =>
    areMessagesRenderEquivalent(prev.message, next.message) &&
    prev.isOwn === next.isOwn &&
    prev.showStatus === next.showStatus &&
    prev.density === next.density &&
    prev.layout === next.layout &&
    prev.className === next.className &&
    prev.onRetry === next.onRetry &&
    prev.onViewEditHistory === next.onViewEditHistory,
);

export default MessageMeta;
