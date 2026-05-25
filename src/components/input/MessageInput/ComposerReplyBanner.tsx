import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  PhotoIcon,
  DocumentIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  FaceSmileIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "../../../types";
import { MessageType } from "../../../types";
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";
import { resolvePublicResourceUrl } from "../../../config";
import { resolveUserDisplayName } from "../../../features/chat/identity/resolveUserDisplayName";

function getFileExtInfo(
  mimeType?: string,
  fileName?: string,
): { ext: string; colorClass: string } | null {
  const name = fileName ?? "";
  const dotIdx = name.lastIndexOf(".");
  const extFromName = dotIdx >= 0 ? name.slice(dotIdx + 1).toUpperCase() : "";
  const extFromMime = mimeType?.split("/").pop()?.toUpperCase() ?? "";
  const ext = (extFromName || extFromMime || "").slice(0, 4);
  if (!ext) return null;

  const colors: Record<string, string> = {
    PDF: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    DOC: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    DOCX: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    XLS: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    XLSX: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    PPT: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    PPTX: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    ZIP: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    RAR: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    TXT: "bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400",
    CSV: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
  };
  return { ext, colorClass: colors[ext] ?? "bg-surface-active text-text-muted" };
}

const MEDIA_META: Record<string, { icon: React.ReactNode; label: string }> = {
  [MessageType.IMAGE]: {
    icon: <PhotoIcon className="h-3.5 w-3.5" />,
    label: "Hình ảnh",
  },
  [MessageType.VIDEO]: {
    icon: <VideoCameraIcon className="h-3.5 w-3.5" />,
    label: "Video",
  },
  [MessageType.FILE]: {
    icon: <DocumentIcon className="h-3.5 w-3.5" />,
    label: "Tệp đính kèm",
  },
  [MessageType.VOICE]: {
    icon: <SpeakerWaveIcon className="h-3.5 w-3.5" />,
    label: "Tin nhắn thoại",
  },
  [MessageType.AUDIO]: {
    icon: <SpeakerWaveIcon className="h-3.5 w-3.5" />,
    label: "Audio",
  },
  [MessageType.STICKER]: {
    icon: <FaceSmileIcon className="h-3.5 w-3.5" />,
    label: "Sticker",
  },
  [MessageType.GIF]: {
    icon: <PhotoIcon className="h-3.5 w-3.5" />,
    label: "GIF",
  },
};

interface ComposerReplyBannerProps {
  replyToMessage: Message;
  onCancelReply?: () => void;
}

export const ComposerReplyBanner: React.FC<ComposerReplyBannerProps> = ({
  replyToMessage,
  onCancelReply,
}) => {
  const { t } = useTranslation();

  const msgType = replyToMessage.type as string;
  const mediaMeta = MEDIA_META[msgType];
  const isMedia = !!mediaMeta;
  const isFile = msgType === MessageType.FILE;
  const isImageOrVideo =
    msgType === MessageType.IMAGE || msgType === MessageType.VIDEO;

  const firstAttachment = replyToMessage.attachments?.[0];
  const thumbnailUrl = resolvePublicResourceUrl(
    firstAttachment?.thumbnailUrl ?? (isImageOrVideo ? firstAttachment?.url : undefined),
  );
  const hasThumb = !!thumbnailUrl && isImageOrVideo;

  const fileName = firstAttachment?.fileName;
  const mimeType = firstAttachment?.mimeType;
  const fileExtInfo = isFile ? getFileExtInfo(mimeType, fileName) : null;

  const senderDisplayName = resolveUserDisplayName({
    displayName: replyToMessage.senderName,
    username: replyToMessage.senderId,
  });

  const previewText = isImageOrVideo
    ? (replyToMessage.content?.trim() || mediaMeta?.label || "")
    : isFile
      ? (fileName ?? mediaMeta?.label ?? "Tệp đính kèm")
      : isMedia
        ? (mediaMeta?.label ?? "")
        : getPreviewFromMessage({
            contentFormat: replyToMessage.contentFormat,
            plainText: replyToMessage.plainText,
            content: replyToMessage.content,
          });

  return (
    <div className="mb-1.5 flex items-stretch overflow-hidden rounded-xl bg-surface-overlay/60 border border-border/50 animate-slide-up-fade">
      {/* Accent bar */}
      <div className="w-[3px] flex-shrink-0 self-stretch bg-primary rounded-l-xl" />

      {/* Thumbnail (image/video only) */}
      {hasThumb && (
        <div className="flex-shrink-0 my-1.5 ml-2">
          <img
            src={thumbnailUrl}
            alt=""
            className="h-11 w-11 rounded-lg object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-2">
        <p className="text-[11.5px] font-semibold text-primary truncate leading-none">
          {t("chat:composer.replyingTo", { name: senderDisplayName })}
        </p>

        {isMedia ? (
          <div className="mt-1 flex items-center gap-1.5 text-text-muted">
            {isFile && fileExtInfo ? (
              <span
                className={clsx(
                  "inline-flex h-4 min-w-[1.75rem] flex-shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold leading-none",
                  fileExtInfo.colorClass,
                )}
              >
                {fileExtInfo.ext}
              </span>
            ) : (
              <span className="text-text-muted flex-shrink-0">{mediaMeta.icon}</span>
            )}
            <span className="truncate text-[12px] leading-tight">{previewText}</span>
          </div>
        ) : (
          <p className="mt-1 truncate text-[12px] leading-tight text-text-muted">{previewText}</p>
        )}
      </div>

      {/* Cancel button */}
      <button
        type="button"
        onClick={onCancelReply}
        className={clsx(
          "self-center mr-2 ml-1 flex-shrink-0 rounded-full p-1 transition-colors",
          "text-text-muted hover:text-text-primary hover:bg-surface-active",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={t("chat:composer.cancelReply")}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};
