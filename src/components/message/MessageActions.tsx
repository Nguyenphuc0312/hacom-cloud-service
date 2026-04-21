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
import type { MessageActionId } from "../../utils/messageActionPolicy";

type MessageActionsMode = "rail" | "inline" | "sheet";

interface MessageActionsProps {
  mode: MessageActionsMode;
  actions: MessageActionId[];
  isOpen?: boolean;
  onAction: (actionId: MessageActionId) => void;
  onClose?: () => void;
  className?: string;
}

interface ActionDescriptor {
  id: MessageActionId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  danger?: boolean;
}

const baseButtonClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors";

export const MessageActions: React.FC<MessageActionsProps> = ({
  mode,
  actions,
  isOpen = false,
  onAction,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const actionMap = React.useMemo<Record<MessageActionId, ActionDescriptor>>(
    () => ({
      react: {
        id: "react",
        label: t("chat:message.actions.react", { defaultValue: "React" }),
        icon: FaceSmileIcon,
      },
      reply: {
        id: "reply",
        label: t("chat:message.actions.reply"),
        icon: ArrowUturnLeftIcon,
      },
      copy: {
        id: "copy",
        label: t("chat:message.actions.copy"),
        icon: ClipboardDocumentIcon,
      },
      edit: {
        id: "edit",
        label: t("chat:message.actions.edit"),
        icon: PencilIcon,
      },
      retry: {
        id: "retry",
        label: t("chat:message.status.retry", { defaultValue: "Retry" }),
        icon: ArrowPathIcon,
      },
      delete: {
        id: "delete",
        label: t("chat:message.actions.delete"),
        icon: TrashIcon,
        danger: true,
      },
      more: {
        id: "more",
        label: t("chat:header.moreActions"),
        icon: EllipsisHorizontalIcon,
      },
    }),
    [t],
  );
  const descriptors = actions
    .map((actionId) => actionMap[actionId])
    .filter(Boolean);

  if (mode === "rail") {
    return (
      <div
        className={clsx(
          "flex items-center gap-0.5 rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill)/0.9)] p-1 shadow-xs backdrop-blur-sm",
          className,
        )}
      >
        {descriptors.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            data-testid={`message-action-${action.id}`}
            className="rounded-full p-2 text-text-secondary transition-fast hover:bg-white/6 hover:text-text-primary"
            aria-label={action.label}
            title={action.label}
          >
            <action.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  }

  if (mode === "inline") {
    return (
      <div
        className={clsx(
          "inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-[hsl(var(--chat-panel-bg))/0.96] p-1 shadow-xs backdrop-blur-sm",
          className,
        )}
      >
        {descriptors.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            data-testid={`message-action-${action.id}`}
            className={clsx(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
              action.danger && "hover:bg-danger/10 hover:text-danger",
            )}
            aria-label={action.label}
            title={action.label}
          >
            <action.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    );
  }

  if (!isOpen || typeof document === "undefined" || descriptors.length === 0) {
    return null;
  }

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
          {descriptors.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action.id)}
              data-testid={`message-action-${action.id}`}
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
