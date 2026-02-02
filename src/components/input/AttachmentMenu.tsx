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
    color: "text-purple-500 bg-purple-100",
  },
  {
    id: "document",
    label: "Tài liệu",
    icon: DocumentIcon,
    color: "text-blue-500 bg-blue-100",
  },
  {
    id: "location",
    label: "Vị trí",
    icon: MapPinIcon,
    color: "text-green-500 bg-green-100",
  },
  {
    id: "contact",
    label: "Liên hệ",
    icon: UserIcon,
    color: "text-orange-500 bg-orange-100",
  },
  {
    id: "audio",
    label: "Âm thanh",
    icon: MusicalNoteIcon,
    color: "text-pink-500 bg-pink-100",
  },
  {
    id: "poll",
    label: "Khảo sát",
    icon: ChartBarIcon,
    color: "text-cyan-500 bg-cyan-100",
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
        "bg-white rounded-xl shadow-xl border border-gray-200",
        "p-2 min-w-[180px] animate-slide-in-up",
        className,
      )}
    >
      {attachmentTypes.map((type) => (
        <button
          key={type.id}
          onClick={() => onSelect(type.id)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className={clsx("p-2 rounded-lg", type.color)}>
            <type.icon className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {type.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default AttachmentMenu;
