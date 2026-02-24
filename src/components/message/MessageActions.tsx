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
      label: "Trả lời",
      onClick: onReply,
    },
    {
      id: "forward",
      icon: ArrowUturnRightIcon,
      label: "Chuyển tiếp",
      onClick: onForward,
    },
    {
      id: "copy",
      icon: ClipboardDocumentIcon,
      label: "Sao chép",
      onClick: onCopy,
    },
    ...(isOwn && onEdit
      ? [{ id: "edit", icon: PencilIcon, label: "Chỉnh sửa", onClick: onEdit }]
      : []),
    {
      id: "delete",
      icon: TrashIcon,
      label: "Xóa",
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <div
      className={clsx(
        "flex items-center gap-1 p-1 rounded-lg bg-white shadow-lg border border-gray-100",
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
            "p-2 rounded-md transition-colors",
            action.danger
              ? "text-red-500 hover:bg-red-50"
              : "text-gray-600 hover:bg-gray-100",
          )}
          aria-label={action.label}
          title={action.label}
          tabIndex={isVisible ? 0 : -1}
        >
          <action.icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default MessageActions;
