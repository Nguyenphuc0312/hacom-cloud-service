/**
 * @fileoverview FileMessage - Router component that dispatches to the correct attachment renderer.
 *
 * This is the main entry point for all file/media messages in chat.
 * It detects the file type and renders the appropriate component.
 *
 * Supports:
 * - Document files (PDF, DOCX, XLSX, etc.)
 * - Images (inline display)
 * - Images (as file attachment)
 * - Videos
 * - Stickers
 */

import React, { useMemo } from "react";
import type { Attachment, ImageClickPayload } from "../../types";
import type { PreviewType } from "../../utils/formatFileSize";
import {
  getPreviewType,
} from "../../utils/formatFileSize";
import { isImageFile, isVideoFile, isAudioFile } from "../../utils/fileCategoryUtils";
import { DocumentAttachment } from "./DocumentAttachment";
import { ImageMessage } from "./ImageMessage";
import { ImageFileAttachment } from "./ImageFileAttachment";
import { VideoMessage } from "./VideoMessage";
import { StickerMessage } from "./StickerMessage";

interface FileMessageProps {
  conversationId: string;
  attachment: Attachment;
  isOwn: boolean;
  messageType?: "image" | "file" | "sticker" | "video";
  caption?: string;
  /** Called when user wants to preview the file */
  onPreview?: (attachment: Attachment, previewType: PreviewType) => void;
  /** Called when user wants to preview the image (lightbox) */
  onImageClick?: (payload: ImageClickPayload) => void;
  /** Upload progress (0-100) */
  uploadProgress?: number;
  className?: string;
}

/**
 * Detect the appropriate renderer based on message type and attachment
 */
export const FileMessage: React.FC<FileMessageProps> = ({
  conversationId,
  attachment,
  isOwn,
  messageType = "file",
  caption,
  onPreview,
  onImageClick,
  uploadProgress,
  className,
}) => {
  // Get file info
  const previewType = getPreviewType(attachment.mimeType, attachment.fileName);

  // Determine render mode based on message type and attachment characteristics
  const renderMode = useMemo(() => {
    // Force image mode if message type is IMAGE
    if (messageType === "image") {
      // Check if it's an image sent as attachment (not inline)
      // Small images that can be displayed inline: use ImageMessage
      // Large images (>10MB): use HD-aware ImageMessage
      return "inline-image";
    }

    // Sticker
    if (messageType === "sticker") {
      return "sticker";
    }

    // Video
    if (isVideoFile(attachment.mimeType, attachment.fileName) || messageType === "video") {
      return "video";
    }

    // Audio - currently handled by VoiceMessage, but could add here
    if (isAudioFile(attachment.mimeType, attachment.fileName)) {
      // Audio is handled separately by VoiceMessage
      return "audio";
    }

    // Images sent as file attachment (not inline)
    if (isImageFile(attachment.mimeType, attachment.fileName)) {
      return "image-file";
    }

    // All other files: document card
    return "document";
  }, [messageType, attachment]);

  // Render appropriate component
  switch (renderMode) {
    case "inline-image":
      return (
        <ImageMessage
          conversationId={conversationId}
          attachment={attachment}
          isOwn={isOwn}
          caption={caption}
          onClick={onImageClick}
          uploadProgress={uploadProgress}
          className={className}
        />
      );

    case "image-file":
      return (
        <ImageFileAttachment
          conversationId={conversationId}
          attachment={attachment}
          isOwn={isOwn}
          onPreview={(att) => onPreview?.(att, "image")}
          uploadProgress={uploadProgress}
          className={className}
        />
      );

    case "video":
      return (
        <VideoMessage
          conversationId={conversationId}
          attachment={attachment}
          onPreview={(att) => onPreview?.(att, previewType as PreviewType)}
          uploadProgress={uploadProgress}
          className={className}
        />
      );

    case "sticker":
      return (
        <StickerMessage
          conversationId={conversationId}
          attachment={attachment}
          className={className}
        />
      );

    case "audio":
      // Audio is handled by VoiceMessage in MessageBodyRenderer
      // Return null here as we don't have audio rendering in this component
      return null;

    case "document":
    default:
      return (
        <DocumentAttachment
          conversationId={conversationId}
          attachment={attachment}
          isOwn={isOwn}
          onPreview={onPreview}
          uploadProgress={uploadProgress}
          className={className}
        />
      );
  }
};

export default FileMessage;
