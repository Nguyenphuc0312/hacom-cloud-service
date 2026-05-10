import React from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Copy,
  CornerUpLeft,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SmilePlus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
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
  icon: LucideIcon;
  danger?: boolean;
}

const baseButtonClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors";

const PILL_CLASS =
  "flex items-center gap-2 rounded-full bg-white px-3 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.10),0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-[#2a2d34] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.07)]";

const BTN_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f3f7] text-[#52556a] ring-1 ring-[#e3e5ec] transition-all duration-150 hover:bg-[#e6e8f0] hover:text-[#1a1c2e] hover:ring-[#d4d6e0] active:scale-95 dark:bg-white/8 dark:text-white/60 dark:ring-white/10 dark:hover:bg-white/14 dark:hover:text-white";

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
        icon: SmilePlus,
      },
      reply: {
        id: "reply",
        label: t("chat:message.actions.reply"),
        icon: CornerUpLeft,
      },
      copy: {
        id: "copy",
        label: t("chat:message.actions.copy"),
        icon: Copy,
      },
      edit: {
        id: "edit",
        label: t("chat:message.actions.edit"),
        icon: Pencil,
      },
      retry: {
        id: "retry",
        label: t("chat:message.status.retry", { defaultValue: "Retry" }),
        icon: RefreshCw,
      },
      delete: {
        id: "delete",
        label: t("chat:message.actions.delete"),
        icon: Trash2,
        danger: true,
      },
      more: {
        id: "more",
        label: t("chat:header.moreActions"),
        icon: MoreHorizontal,
      },
    }),
    [t],
  );
  const descriptors = actions
    .map((actionId) => actionMap[actionId])
    .filter(Boolean);

  if (mode === "rail") {
    return (
      <div className={clsx(PILL_CLASS, className)}>
        {descriptors.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            data-testid={`message-action-${action.id}`}
            className={BTN_CLASS}
            aria-label={action.label}
            title={action.label}
          >
            <action.icon size={15} strokeWidth={1.75} />
          </button>
        ))}
      </div>
    );
  }

  if (mode === "inline") {
    return (
      <div className={clsx(PILL_CLASS, "inline-flex", className)}>
        {descriptors.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            data-testid={`message-action-${action.id}`}
            className={clsx(
              BTN_CLASS,
              action.danger && "hover:!bg-red-50 hover:!text-red-500 dark:hover:!bg-red-500/10 dark:hover:!text-red-400",
            )}
            aria-label={action.label}
            title={action.label}
          >
            <action.icon size={15} strokeWidth={1.75} />
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
            <X size={16} strokeWidth={2} />
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
              <action.icon size={18} strokeWidth={1.9} className="shrink-0" />
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
