/**
 * @fileoverview Message context menu helpers.
 */

import {
  ArrowUturnLeftIcon,
  ArrowUpTrayIcon,
  LinkIcon,
  DocumentArrowDownIcon,
  BookmarkIcon,
  BookmarkSlashIcon,
} from "@heroicons/react/24/outline";
import { t } from "i18next";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

export interface MessageContextMenuOptions {
  /** Whether the message is from the current user */
  isOwn: boolean;
  /** Whether the message is pinned */
  isPinned?: boolean;
  /** Whether the user can download the attachment */
  hasAttachment?: boolean;
  /** Whether the message contains a URL */
  hasUrl?: boolean;
  /** Callbacks */
  onReply?: () => void;
  onForward?: () => void;
  onCopyLink?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onDownload?: () => void;
}

/**
 * Helper to build context menu items for a message
 */
export function buildMessageContextMenuItems(options: MessageContextMenuOptions): ContextMenuItem[] {
  const {
    isOwn,
    isPinned = false,
    hasAttachment = false,
    hasUrl = false,
    onReply,
    onForward,
    onCopyLink,
    onPin,
    onUnpin,
    onDownload,
  } = options;

  const items: ContextMenuItem[] = [];

  // Reply
  if (onReply) {
    items.push({
      id: "reply",
      label: t("chat:message.actions.reply", { defaultValue: "Trả lời" }),
      icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
      onClick: onReply,
    });
  }

  // Forward
  if (onForward) {
    items.push({
      id: "forward",
      label: t("chat:message.actions.forward", { defaultValue: "Chuyển tiếp" }),
      icon: <ArrowUpTrayIcon className="h-4 w-4" />,
      onClick: onForward,
    });
  }

  // Copy link (only for messages with URLs)
  if (onCopyLink && hasUrl) {
    items.push({
      id: "copyLink",
      label: t("chat:message.actions.copyLink", { defaultValue: "Sao chép link" }),
      icon: <LinkIcon className="h-4 w-4" />,
      onClick: onCopyLink,
    });
  }

  // Pin/Unpin
  if (isPinned && onUnpin) {
    items.push({
      id: "unpin",
      label: t("chat:message.actions.unpin", { defaultValue: "Bỏ ghim" }),
      icon: <BookmarkSlashIcon className="h-4 w-4" />,
      onClick: onUnpin,
    });
  } else if (!isPinned && onPin) {
    items.push({
      id: "pin",
      label: t("chat:message.actions.pin", { defaultValue: "Ghim tin nhắn" }),
      icon: <BookmarkIcon className="h-4 w-4" />,
      onClick: onPin,
    });
  }

  // Download (only for messages with attachments)
  if (onDownload && hasAttachment) {
    items.push({
      id: "download",
      label: t("chat:message.actions.download", { defaultValue: "Tải về" }),
      icon: <DocumentArrowDownIcon className="h-4 w-4" />,
      onClick: onDownload,
    });
  }

  return items;
}
