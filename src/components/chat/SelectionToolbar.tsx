/**
 * @fileoverview SelectionToolbar
 * Floating toolbar displayed when message selection mode is active.
 * Allows bulk actions: pin, delete, forward, copy.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  TrashIcon,
  ArrowUturnRightIcon,
  ClipboardDocumentIcon,
  MapPinIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface SelectionToolbarProps {
  selectedCount: number;
  onDelete: () => void;
  onForward?: () => void;
  onCopy: () => void;
  onPin?: () => void;
  onCancel: () => void;
  className?: string;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  onDelete,
  onForward,
  onCopy,
  onPin,
  onCancel,
  className,
}) => {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  const actions = [
    {
      id: "copy",
      icon: ClipboardDocumentIcon,
      label: t("chat:message.actions.copy", { defaultValue: "Copy" }),
      onClick: onCopy,
    },
    ...(onForward
      ? [
          {
            id: "forward",
            icon: ArrowUturnRightIcon,
            label: t("chat:message.actions.forward", {
              defaultValue: "Forward",
            }),
            onClick: onForward,
          },
        ]
      : []),
    ...(onPin
      ? [
          {
            id: "pin",
            icon: MapPinIcon,
            label: t("chat:message.actions.pinSelected", {
              defaultValue: "Ghim tin đã chọn",
            }),
            onClick: onPin,
          },
        ]
      : []),
    {
      id: "delete",
      icon: TrashIcon,
      label: t("chat:message.actions.delete", { defaultValue: "Delete" }),
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <div
      className={clsx(
        "fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-elev3 backdrop-blur-sm",
        "animate-slide-up-fade",
        className,
      )}
      role="toolbar"
      aria-label={t("chat:selection.toolbar", {
        defaultValue: "Selection actions",
      })}
    >
      <span className="mr-2 text-sm font-medium text-text-primary">
        {t("chat:selection.selected", {
          count: selectedCount,
          defaultValue: "{{count}} selected",
        })}
      </span>

      <div className="h-5 w-px bg-border" />

      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-micro",
            action.danger
              ? "text-danger hover:bg-danger/10 active:scale-95"
              : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary active:scale-95",
          )}
          aria-label={action.label}
        >
          <action.icon className="h-4 w-4" />
          <span className="hidden sm:inline">{action.label}</span>
        </button>
      ))}

      <div className="h-5 w-px bg-border" />

      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-micro hover:bg-surface-overlay hover:text-text-primary active:scale-95"
        aria-label={t("common:actions.cancel", { defaultValue: "Cancel" })}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default SelectionToolbar;
