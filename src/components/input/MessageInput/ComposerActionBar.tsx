import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  EllipsisHorizontalIcon,
  PaperClipIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { EmojiButton } from "../EmojiButton";
import { AttachmentMenu } from "../AttachmentMenu";
import type { ComposerVisualStyles } from "./types";

interface ComposerActionBarProps {
  composerVisualStyles: ComposerVisualStyles;
  draftValue: string;
  disabled: boolean;
  disableAttachmentActions: boolean;
  isFormatModeExpanded: boolean;
  showAttachmentMenu: boolean;
  canShareContact: boolean;
  onEmojiChange: (value: string) => void;
  onEmojiInsert: (emoji: string) => void;
  onOpenFilePicker: () => void;
  onToggleFormatMode: () => void;
  onToggleAttachmentMenu: () => void;
  onCloseAttachmentMenu: () => void;
  onAttachmentSelect: (type: string) => void;
}

export const ComposerActionBar: React.FC<ComposerActionBarProps> = ({
  composerVisualStyles,
  draftValue,
  disabled,
  disableAttachmentActions,
  isFormatModeExpanded,
  showAttachmentMenu,
  canShareContact,
  onEmojiChange,
  onEmojiInsert,
  onOpenFilePicker,
  onToggleFormatMode,
  onToggleAttachmentMenu,
  onCloseAttachmentMenu,
  onAttachmentSelect,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx(
        "chat-composer-action-group ml-1 flex shrink-0 items-end gap-1 border-l pl-2",
        composerVisualStyles.attachmentDivider,
      )}
    >
      <EmojiButton
        value={draftValue}
        onChange={onEmojiChange}
        onEmojiSelect={onEmojiInsert}
        disabled={disabled}
      />

      <button
        type="button"
        onClick={onOpenFilePicker}
        className={clsx(
          "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
          composerVisualStyles.attachmentButton,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          disableAttachmentActions && "cursor-not-allowed opacity-50",
        )}
        aria-label={t("chat:composer.attachFile")}
        disabled={disableAttachmentActions}
      >
        <PaperClipIcon className="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        onClick={onToggleFormatMode}
        className={clsx(
          "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
          isFormatModeExpanded
            ? "bg-surface-active text-text-primary"
            : composerVisualStyles.attachmentButton,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
        aria-label={t("chat:composer.formatLabel")}
        title={t("chat:composer.formatHint")}
        disabled={disabled}
      >
        <div
          className={clsx(
            "relative flex items-center justify-center",
            "h-[18px] w-[18px]",
          )}
        >
          <span className="font-bold text-sm tracking-tighter">A</span>
          <PencilIcon
            className="absolute bottom-[2px] -right-[4px] h-[10px] w-[10px]"
            strokeWidth={2.5}
          />
        </div>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={onToggleAttachmentMenu}
          className={clsx(
            "chat-composer-attachment inline-flex h-[var(--control-height-md)] w-[var(--control-height-md)] items-center justify-center rounded-md transition-colors",
            showAttachmentMenu
              ? "bg-surface-active text-text-primary"
              : composerVisualStyles.attachmentButton,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            disableAttachmentActions && "cursor-not-allowed opacity-50",
          )}
          aria-label={t("chat:header.moreActions", {
            defaultValue: "Thêm hành động",
          })}
          aria-haspopup="menu"
          aria-expanded={showAttachmentMenu}
          disabled={disableAttachmentActions}
        >
          <EllipsisHorizontalIcon className="h-[20px] w-[20px]" />
        </button>

        {showAttachmentMenu && (
          <AttachmentMenu
            onSelect={onAttachmentSelect}
            onClose={onCloseAttachmentMenu}
            canShareContact={canShareContact}
            className="absolute bottom-full right-0 z-dropdown mb-2"
          />
        )}
      </div>
    </div>
  );
};
