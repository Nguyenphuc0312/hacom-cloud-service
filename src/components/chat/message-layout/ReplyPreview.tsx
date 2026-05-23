import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftIcon,
  DocumentIcon,
  PhotoIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "../../../types";
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";

const ReplyTypeIcon: React.FC<{ type?: string; className?: string }> = ({
  type,
  className,
}) => {
  switch (type) {
    case "image":
      return <PhotoIcon className={className} />;
    case "file":
      return <DocumentIcon className={className} />;
    case "voice":
      return <SpeakerWaveIcon className={className} />;
    default:
      return <ChatBubbleLeftIcon className={className} />;
  }
};

interface ReplyPreviewProps {
  replyToMessage: NonNullable<Message["replyToMessage"]>;
  replySenderDisplayName: string | null;
  replyTargetMessageId: string | undefined;
  isSelectionMode: boolean;
  isOwn: boolean;
  replyPreviewClass: string;
  onClick: () => void;
}

export const ReplyPreview: React.FC<ReplyPreviewProps> = ({
  replyToMessage,
  replySenderDisplayName,
  replyTargetMessageId,
  isSelectionMode,
  isOwn,
  replyPreviewClass,
  onClick,
}) => {
  const { t } = useTranslation();

  const deletedText = replyToMessage.lifecycleStatus === "deleted_admin"
    ? t("chat:message.deletedByAdmin", {
        defaultValue: "Tin nhắn đã bị xóa bởi quản trị viên",
      })
    : replyToMessage.lifecycleStatus === "recalled"
      ? t("chat:message.recalled", {
          defaultValue: "Tin nhắn đã được thu hồi",
        })
      : t("chat:message.deleted", {
          defaultValue: "Tin nhắn đã được thu hồi",
        });

  const previewText = replyToMessage.isDeleted
    ? deletedText
    : getPreviewFromMessage({
        contentFormat: replyToMessage.contentFormat,
        content: replyToMessage.content,
      });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!replyTargetMessageId || isSelectionMode}
      className={clsx(
        "flex w-full items-center border-l-[3px] text-left transition-colors",
        replyPreviewClass,
        replyTargetMessageId && !isSelectionMode
          ? "cursor-pointer hover:opacity-90"
          : "cursor-default",
        isOwn
          ? "border-primary bg-primary/[0.07] text-text-primary dark:bg-primary/15"
          : "border-primary/45 bg-text-primary/[0.04] text-text-primary",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <ReplyTypeIcon
          type={replyToMessage.type}
          className="h-3.5 w-3.5 shrink-0 text-text-muted"
        />
        <div className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-bold leading-none text-primary">
            {replySenderDisplayName}
          </span>
          <p className="mt-1 truncate text-[12.5px] leading-tight text-text-secondary">
            {previewText}
          </p>
        </div>
      </div>
    </button>
  );
};
