import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  PhotoIcon,
  DocumentIcon,
  MapPinIcon,
  UserIcon,
  MusicalNoteIcon,
  ChartBarIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

interface AttachmentMenuProps {
  onSelect: (type: string) => void;
  onClose: () => void;
  canShareContact?: boolean;
  canPoll?: boolean;
  disabledItemIds?: string[];
  className?: string;
}

export const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  onSelect,
  onClose,
  canShareContact = false,
  canPoll = false,
  disabledItemIds = [],
  className,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  const attachmentTypes = [
    {
      id: "photo",
      label: t("chat:attachment.types.photo"),
      icon: PhotoIcon,
      color: "bg-[#1976D2]/10 text-[#1565C0]",
      enabled: true,
    },
    {
      id: "document",
      label: t("chat:attachment.types.document"),
      icon: DocumentIcon,
      color: "bg-secondary/15 text-secondary",
      enabled: true,
    },
    {
      id: "location",
      label: t("chat:attachment.types.location"),
      subtitle: t("chat:location.sendCurrent", { defaultValue: "Gửi vị trí hiện tại" }),
      icon: MapPinIcon,
      color: "bg-success/15 text-success",
      enabled: true,
    },
    {
      id: "contact",
      label: t("chat:attachment.types.contact"),
      icon: UserIcon,
      color: "bg-warning/15 text-warning",
      enabled: canShareContact,
    },
    {
      id: "audio",
      label: t("chat:attachment.types.audio"),
      icon: MusicalNoteIcon,
      color: "bg-accent/15 text-accent",
      enabled: false,
    },
    {
      id: "poll",
      label: t("chat:attachment.types.poll"),
      icon: ChartBarIcon,
      color: "bg-[#1976D2]/10 text-[#1565C0]",
      enabled: canPoll,
      disabledReason: t("chat:attachment.pollGroupOnly", { defaultValue: "Chỉ dành cho nhóm" }),
    },
    {
      id: "reminder",
      label: t("chat:attachment.types.reminder", { defaultValue: "Nhắc hẹn" }),
      icon: BellIcon,
      color: "bg-warning/15 text-warning",
      enabled: true,
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    // Focus the first menu item on mount
    const firstButton = menuRef.current?.querySelector<HTMLButtonElement>(
      "button[role='menuitem']",
    );
    firstButton?.focus();
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[role='menuitem']",
      );
      if (!items || items.length === 0) return;

      const currentIndex = Array.from(items).indexOf(
        document.activeElement as HTMLButtonElement,
      );

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          items[(currentIndex + 1) % items.length]?.focus();
          break;
        case "ArrowUp":
          event.preventDefault();
          items[(currentIndex - 1 + items.length) % items.length]?.focus();
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    },
    [onClose],
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      className={clsx(
        "rounded-xl border border-border bg-surface shadow-elev2",
        "p-2 min-w-44 animate-slide-in-up",
        className,
      )}
    >
      {attachmentTypes.map((type) => {
        const isDisabled = !type.enabled || disabledItemIds.includes(type.id);
        return (
        <button
          key={type.id}
          type="button"
          role="menuitem"
          tabIndex={0}
          onClick={() => {
            if (!isDisabled) onSelect(type.id);
          }}
          disabled={isDisabled}
          title={!type.enabled ? (type.disabledReason ?? t("common:toast.featureInDevelopment", { defaultValue: "Coming soon" })) : undefined}
          className={clsx(
            "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            !isDisabled
              ? "hover:bg-surface-overlay active:bg-surface-active"
              : "cursor-not-allowed opacity-55",
          )}
        >
          <div className={clsx("p-2 rounded-lg", type.color)}>
            <type.icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-text-secondary">
              {type.label}
            </span>
            {type.subtitle && !isDisabled && (
              <p className="text-[11px] text-text-muted">{type.subtitle}</p>
            )}
            {!type.enabled && (
              <p className="text-[11px] text-text-muted">
                {type.disabledReason ?? t("common:toast.featureInDevelopment", { defaultValue: "Coming soon" })}
              </p>
            )}
          </div>
        </button>
        );
      })}
    </div>
  );
};

export default AttachmentMenu;
