import React from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Copy,
  CornerUpLeft,
  Forward,
  ListChecks,
  MoreHorizontal,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SmilePlus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  fallbackMessageActionLabels,
  translateWithFallback,
} from "../../utils/messageActionLabels";
import type { MessageActionId } from "../../utils/messageActionPolicy";

type MessageActionsMode = "rail" | "inline" | "sheet" | "dropdown";

interface MessageActionsProps {
  mode: MessageActionsMode;
  actions: MessageActionId[];
  isOpen?: boolean;
  onAction: (actionId: MessageActionId) => void;
  onClose?: () => void;
  className?: string;
  actionLabelOverrides?: Partial<Record<MessageActionId, string>>;
  /** Required for mode="dropdown": viewport rect of the trigger button. */
  anchorRect?: { left: number; top: number; bottom: number };
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
  "flex items-center gap-2 rounded-full bg-surface px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)]";

const BTN_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-text-secondary ring-1 ring-border transition-all duration-150 hover:bg-surface-hover hover:text-text-primary active:scale-95 dark:bg-surface-overlay dark:text-text-secondary dark:ring-white/10 dark:hover:bg-surface-active dark:hover:text-text-primary";

export const MessageActions: React.FC<MessageActionsProps> = ({
  mode,
  actions,
  isOpen = false,
  onAction,
  onClose,
  className,
  actionLabelOverrides,
  anchorRect,
}) => {
  const { t } = useTranslation();
  const translateActionLabel = React.useCallback(
    (actionId: MessageActionId, key: string) => {
      return translateWithFallback(t, key, fallbackMessageActionLabels[actionId]);
    },
    [t],
  );

  const actionMap = React.useMemo<Record<MessageActionId, ActionDescriptor>>(
    () => ({
      react: {
        id: "react",
        label: translateActionLabel("react", "chat:message.actions.react"),
        icon: SmilePlus,
      },
      reply: {
        id: "reply",
        label: translateActionLabel("reply", "chat:message.actions.reply"),
        icon: CornerUpLeft,
      },
      forward: {
        id: "forward",
        label: translateActionLabel("forward", "chat:message.actions.forward"),
        icon: Forward,
      },
      copy: {
        id: "copy",
        label: translateActionLabel("copy", "chat:message.actions.copy"),
        icon: Copy,
      },
      retry: {
        id: "retry",
        label: translateActionLabel("retry", "chat:message.status.retry"),
        icon: RefreshCw,
      },
      pin: {
        id: "pin",
        label: translateActionLabel("pin", "chat:message.actions.pin"),
        icon: Pin,
      },
      unpin: {
        id: "unpin",
        label: translateActionLabel("unpin", "chat:message.actions.unpin"),
        icon: PinOff,
      },
      recall: {
        id: "recall",
        label: translateActionLabel(
          "recall",
          "chat:message.actions.deleteForEveryone",
        ),
        icon: RotateCcw,
        danger: true,
      },
      adminDelete: {
        id: "adminDelete",
        label: translateActionLabel(
          "adminDelete",
          "chat:message.actions.deleteForEveryoneAdmin",
        ),
        icon: ShieldAlert,
        danger: true,
      },
      deleteForMe: {
        id: "deleteForMe",
        label: translateActionLabel(
          "deleteForMe",
          "chat:message.actions.deleteForMe",
        ),
        icon: Trash2,
        danger: true,
      },
      select: {
        id: "select",
        label: translateActionLabel("select", "chat:message.actions.select"),
        icon: ListChecks,
      },
      more: {
        id: "more",
        label: translateActionLabel("more", "chat:header.moreActions"),
        icon: MoreHorizontal,
      },
    }),
    [translateActionLabel],
  );

  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [isOpen, onClose]);

  // Position the dropdown against the viewport after it renders (flip up when
  // it would overflow the bottom). Mutates the DOM node directly — the menu
  // mounts hidden and becomes visible once placed.
  React.useLayoutEffect(() => {
    if (mode !== "dropdown" || !isOpen || !anchorRect) return;
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(anchorRect.left, window.innerWidth - width - margin),
    );
    let top = anchorRect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - height - 6);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [mode, isOpen, anchorRect]);

  const descriptors = actions
    .map((actionId) => {
      const base = actionMap[actionId];
      if (!base) return base;
      const overrideLabel = actionLabelOverrides?.[actionId];
      return overrideLabel ? { ...base, label: overrideLabel } : base;
    })
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
              action.danger &&
                "hover:!bg-red-50 hover:!text-red-500 dark:hover:!bg-red-500/10 dark:hover:!text-red-400",
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

  if (mode === "dropdown") {
    return createPortal(
      <div className="fixed inset-0 z-[70]">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          aria-label={t("common:actions.close")}
          tabIndex={-1}
        />
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("chat:header.moreActions")}
          className={clsx(
            "fixed w-56 rounded-xl border border-border bg-surface p-1.5 shadow-elev3",
            "animate-slide-up-fade",
            className,
          )}
          style={{
            left: anchorRect?.left ?? 0,
            top: anchorRect?.bottom ?? 0,
            visibility: "hidden",
          }}
        >
          {descriptors.map((action, index) => (
            <React.Fragment key={action.id}>
              {action.danger && !descriptors[index - 1]?.danger && (
                <div role="separator" className="mx-2 my-1 h-px bg-border" />
              )}
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(action.id);
                }}
                data-testid={`message-action-${action.id}`}
                title={action.label}
                aria-label={action.label}
                className={clsx(
                  baseButtonClass,
                  "w-full text-left",
                  action.danger
                    ? "text-danger hover:bg-danger/8"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <action.icon size={17} strokeWidth={1.9} className="shrink-0" />
                <span>{action.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 md:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label={t("common:actions.close")}
      />
      <div
        className={clsx(
          "relative w-full max-w-sm rounded-2xl border border-border bg-surface p-3 shadow-elev3",
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
            className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={t("common:actions.close")}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-1">
          {descriptors.map((action, index) => (
            <React.Fragment key={action.id}>
              {action.danger && !descriptors[index - 1]?.danger && (
                <div role="separator" className="mx-2 my-1 h-px bg-border" />
              )}
              <button
                type="button"
                onClick={() => onAction(action.id)}
                data-testid={`message-action-${action.id}`}
                title={action.label}
                aria-label={action.label}
                className={clsx(
                  baseButtonClass,
                  "w-full text-left",
                  action.danger
                    ? "text-danger hover:bg-danger/8"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <action.icon size={18} strokeWidth={1.9} className="shrink-0" />
                <span>{action.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MessageActions;
