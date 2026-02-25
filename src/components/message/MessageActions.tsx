import React from "react";
import clsx from "clsx";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";

interface MessageActionsProps {
  isOwn: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  isVisible?: boolean;
  onClose?: () => void;
  className?: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  isOwn,
  onReply,
  onForward,
  onCopy,
  onEdit,
  onDelete,
  isVisible = true,
  onClose,
  className,
}) => {
  const actions = [
    {
      id: "reply",
      icon: ArrowUturnLeftIcon,
      label: "Reply",
      onClick: onReply,
    },
    {
      id: "forward",
      icon: ArrowUturnRightIcon,
      label: "Forward",
      onClick: onForward,
    },
    {
      id: "copy",
      icon: ClipboardDocumentIcon,
      label: "Copy",
      onClick: onCopy,
    },
    ...(isOwn && onEdit
      ? [{ id: "edit", icon: PencilIcon, label: "Edit", onClick: onEdit }]
      : []),
    {
      id: "delete",
      icon: TrashIcon,
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <div
      className={clsx(
        "flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-elev2",
        "animate-fade-in",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose?.();
        }
      }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={action.onClick}
          className={clsx(
            "rounded-md p-2 transition-colors",
            action.danger
              ? "text-danger hover:bg-danger/10"
              : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
          )}
          aria-label={action.label}
          title={action.label}
          tabIndex={isVisible ? 0 : -1}
        >
          <action.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
};

export default MessageActions;
