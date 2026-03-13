import React from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ClipboardDocumentIcon,
  EllipsisHorizontalIcon,
  FaceSmileIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type MessageActionsMode = "rail" | "sheet";

interface MessageActionsProps {
  mode: MessageActionsMode;
  isOwn: boolean;
  isOpen?: boolean;
  onReact?: () => void;
  onReply?: () => void;
  onMore?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
}

interface ActionDescriptor {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  danger?: boolean;
}

const baseButtonClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors";

export const MessageActions: React.FC<MessageActionsProps> = ({
  mode,
  isOwn,
  isOpen = false,
  onReact,
  onReply,
  onMore,
  onCopy,
  onEdit,
  onDelete,
  onRetry,
  onClose,
  className,
}) => {
  const { t } = useTranslation();

  if (mode === "rail") {
    return (
      <div
        className={clsx(
          "flex items-center gap-1 rounded-full bg-[hsl(var(--color-chat-pill)/0.92)] p-1 shadow-xs backdrop-blur-sm",
          className,
        )}
      >
        {onReact && (
          <button
            type="button"
            onClick={onReact}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary"
            aria-label={t("chat:message.actions.react", {
              defaultValue: "React",
            })}
            title={t("chat:message.actions.react", { defaultValue: "React" })}
          >
            <FaceSmileIcon className="h-4 w-4" />
          </button>
        )}
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary"
            aria-label={t("chat:message.actions.reply")}
            title={t("chat:message.actions.reply")}
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </button>
        )}
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-white/6 hover:text-text-primary"
            aria-label={t("chat:header.moreActions")}
            title={t("chat:header.moreActions")}
          >
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const actions: ActionDescriptor[] = [
    {
      id: "react",
      label: t("chat:message.actions.react", { defaultValue: "React" }),
      icon: FaceSmileIcon,
      onClick: onReact,
    },
    {
      id: "reply",
      label: t("chat:message.actions.reply"),
      icon: ArrowUturnLeftIcon,
      onClick: onReply,
    },
    ...(onCopy
      ? [
          {
            id: "copy",
            label: t("chat:message.actions.copy"),
            icon: ClipboardDocumentIcon,
            onClick: onCopy,
          },
        ]
      : []),
    ...(isOwn && onEdit
      ? [
          {
            id: "edit",
            label: t("chat:message.actions.edit"),
            icon: PencilIcon,
            onClick: onEdit,
          },
        ]
      : []),
    ...(onRetry
      ? [
          {
            id: "retry",
            label: t("chat:message.status.retry", { defaultValue: "Retry" }),
            icon: ArrowPathIcon,
            onClick: onRetry,
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            id: "delete",
            label: t("chat:message.actions.delete"),
            icon: TrashIcon,
            onClick: onDelete,
            danger: true,
          },
        ]
      : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-text-primary/30 p-3 md:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label={t("common:actions.close")}
      />
      <div
        className={clsx(
          "relative w-full max-w-sm rounded-[1.25rem] border border-white/8 bg-[hsl(var(--color-sidebar-surface))] p-3 shadow-elev3",
          "animate-slide-up-fade",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={t("chat:header.moreActions")}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("chat:header.moreActions")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label={t("common:actions.close")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={clsx(
                baseButtonClass,
                "w-full text-left",
                action.danger
                  ? "text-danger hover:bg-danger/8"
                  : "text-text-secondary hover:bg-white/6 hover:text-text-primary",
              )}
            >
              <action.icon className="h-5 w-5 shrink-0" />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MessageActions;
