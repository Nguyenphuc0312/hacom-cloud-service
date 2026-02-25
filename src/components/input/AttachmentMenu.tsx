import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import {
  PhotoIcon,
  DocumentIcon,
  MapPinIcon,
  UserIcon,
  MusicalNoteIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

interface AttachmentMenuProps {
  onSelect: (type: string) => void;
  onClose: () => void;
  className?: string;
}

const attachmentTypes = [
  {
    id: "photo",
    label: "Ảnh/Video",
    icon: PhotoIcon,
    color: "bg-primary/15 text-primary",
  },
  {
    id: "document",
    label: "Tài liệu",
    icon: DocumentIcon,
    color: "bg-secondary/15 text-secondary",
  },
  {
    id: "location",
    label: "Vị trí",
    icon: MapPinIcon,
    color: "bg-success/15 text-success",
  },
  {
    id: "contact",
    label: "Liên hệ",
    icon: UserIcon,
    color: "bg-warning/15 text-warning",
  },
  {
    id: "audio",
    label: "Âm thanh",
    icon: MusicalNoteIcon,
    color: "bg-accent/15 text-accent",
  },
  {
    id: "poll",
    label: "Khảo sát",
    icon: ChartBarIcon,
    color: "bg-danger/15 text-danger",
  },
];

export const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  onSelect,
  onClose,
  className,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={clsx(
        "rounded-xl border border-border bg-surface shadow-elev2",
        "p-2 min-w-44 animate-slide-in-up",
        className,
      )}
    >
      {attachmentTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          onClick={() => onSelect(type.id)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-overlay"
        >
          <div className={clsx("p-2 rounded-lg", type.color)}>
            <type.icon className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-text-secondary">
            {type.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default AttachmentMenu;

