import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  DocumentIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  FaceSmileIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "../../../types";
import { MessageType } from "../../../types";
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";
import { resolvePublicResourceUrl } from "../../../config";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileExt(fileName?: string, mimeType?: string): string {
  const name = fileName ?? "";
  const dot = name.lastIndexOf(".");
  const fromName = dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
  const fromMime = mimeType?.split("/").pop()?.toUpperCase() ?? "";
  return (fromName || fromMime || "").slice(0, 4);
}

function extBadgeClass(ext: string): string {
  // Use semi-transparent colors so badge looks good on any bubble background
  const map: Record<string, string> = {
    PDF: "bg-red-500/20 text-red-600 dark:text-red-400",
    DOC: "bg-blue-500/20 text-blue-600 dark:text-blue-300",
    DOCX: "bg-blue-500/20 text-blue-600 dark:text-blue-300",
    XLS: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    XLSX: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    PPT: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
    PPTX: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
    ZIP: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    RAR: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    TXT: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    CSV: "bg-teal-500/20 text-teal-600 dark:text-teal-400",
  };
  return map[ext] ?? "bg-gray-500/15 text-gray-600 dark:text-gray-400";
}

// ── Media meta ────────────────────────────────────────────────────────────────

interface MediaMeta { icon: React.ReactNode; label: string }

const MEDIA_META: Partial<Record<string, MediaMeta>> = {
  [MessageType.IMAGE]:   { icon: <PhotoIcon className="h-3.5 w-3.5" />, label: "Hình ảnh" },
  [MessageType.VIDEO]:   { icon: <VideoCameraIcon className="h-3.5 w-3.5" />, label: "Video" },
  [MessageType.FILE]:    { icon: <DocumentIcon className="h-3.5 w-3.5" />, label: "Tệp đính kèm" },
  [MessageType.VOICE]:   { icon: <SpeakerWaveIcon className="h-3.5 w-3.5" />, label: "Tin nhắn thoại" },
  [MessageType.AUDIO]:   { icon: <MusicalNoteIcon className="h-3.5 w-3.5" />, label: "Audio" },
  [MessageType.STICKER]: { icon: <FaceSmileIcon className="h-3.5 w-3.5" />, label: "Sticker" },
  [MessageType.GIF]:     { icon: <PhotoIcon className="h-3.5 w-3.5" />, label: "GIF" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReplyPreviewProps {
  replyToMessage: NonNullable<Message["replyToMessage"]>;
  replySenderDisplayName: string | null;
  replyTargetMessageId: string | undefined;
  isSelectionMode: boolean;
  isOwn: boolean;
  replyPreviewClass?: string;
  onClick: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ReplyPreview: React.FC<ReplyPreviewProps> = ({
  replyToMessage,
  replySenderDisplayName,
  replyTargetMessageId,
  isSelectionMode,
  isOwn,
  onClick,
}) => {
  const { t } = useTranslation();

  const isDeleted =
    replyToMessage.isDeleted ||
    replyToMessage.lifecycleStatus === "recalled" ||
    replyToMessage.lifecycleStatus === "deleted_admin";

  const deletedText =
    replyToMessage.lifecycleStatus === "deleted_admin"
      ? t("chat:message.deletedByAdmin", { defaultValue: "Tin nhắn đã bị xóa bởi quản trị viên" })
      : t("chat:message.recalled", { defaultValue: "Tin nhắn đã được thu hồi" });

  const msgType = replyToMessage.type as string;
  const mediaMeta = MEDIA_META[msgType];
  const isMedia = !!mediaMeta;
  const isFile = msgType === MessageType.FILE;
  const isImageOrVideo = msgType === MessageType.IMAGE || msgType === MessageType.VIDEO;

  const firstAttachment = replyToMessage.attachments?.[0];
  const thumbnailUrl = resolvePublicResourceUrl(
    firstAttachment?.thumbnailUrl ?? (isImageOrVideo ? firstAttachment?.url : undefined),
  );
  const hasThumb = !!thumbnailUrl && isImageOrVideo;

  const fileName = firstAttachment?.fileName;
  const mimeType = firstAttachment?.mimeType;
  const ext = isFile ? getFileExt(fileName, mimeType) : "";
  const badgeClass = ext ? extBadgeClass(ext) : "";

  const previewText = isDeleted
    ? deletedText
    : isImageOrVideo
      ? (replyToMessage.content?.trim() || mediaMeta?.label || "")
      : isFile
        ? (fileName ?? mediaMeta?.label ?? "Tệp đính kèm")
        : isMedia
          ? (mediaMeta?.label ?? "")
          : getPreviewFromMessage({
              contentFormat: replyToMessage.contentFormat,
              content: replyToMessage.content,
            });

  const isClickable = !!replyTargetMessageId && !isSelectionMode;

  return (
    <div className="mb-2.5">
      {/* Reply card */}
      <button
        type="button"
        onClick={onClick}
        disabled={!isClickable}
        className={clsx(
          "w-full overflow-hidden text-left transition-opacity",
          isClickable ? "cursor-pointer hover:opacity-70 active:opacity-50" : "cursor-default",
        )}
      >
        <div className="flex items-stretch">
          {/* Left accent stripe */}
          <div
            className={clsx(
              "w-[3px] flex-shrink-0 self-stretch rounded-full",
              isOwn ? "bg-white/70" : "bg-primary",
            )}
          />

          {/* Thumbnail for image/video */}
          {hasThumb && (
            <div className="flex-shrink-0 py-1.5 pl-2">
              <img
                src={thumbnailUrl}
                alt=""
                className="h-10 w-10 rounded-lg object-cover"
              />
            </div>
          )}

          {/* Text area */}
          <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-2">
            {/* Sender name */}
            <span
              className={clsx(
                "block truncate text-[11.5px] font-semibold leading-tight",
                isOwn ? "text-white/70" : "text-text-secondary",
              )}
            >
              {replySenderDisplayName}
            </span>

            {/* Media / file row */}
            {isMedia && !isDeleted ? (
              <div
                className={clsx(
                  "mt-0.5 flex items-center gap-1.5",
                  isOwn ? "text-white/50" : "text-text-muted",
                )}
              >
                {isFile && ext ? (
                  /* PDF / DOCX / etc — colored badge + filename */
                  <>
                    <span
                      className={clsx(
                        "inline-flex h-[18px] min-w-[1.9rem] flex-shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold leading-none",
                        badgeClass,
                      )}
                    >
                      {ext}
                    </span>
                    <span className="truncate text-[12px] leading-tight">{previewText}</span>
                  </>
                ) : (
                  /* Image / Video / Voice / Sticker — type icon + label */
                  <>
                    <span className="flex-shrink-0">{mediaMeta!.icon}</span>
                    <span className="truncate text-[12px] leading-tight">{previewText}</span>
                  </>
                )}
              </div>
            ) : (
              <p
                className={clsx(
                  "mt-0.5 line-clamp-2 text-[12px] leading-tight",
                  isDeleted
                    ? "italic opacity-40"
                    : isOwn
                      ? "text-white/50"
                      : "text-text-muted",
                )}
              >
                {previewText}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
};
