import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { commonEmojis } from "../../data/mockData";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

const categories = [
  { id: "recent", label: "🕐", name: "Gần đây" },
  { id: "smileys", label: "😀", name: "Mặt cười" },
  { id: "gestures", label: "👍", name: "Cử chỉ" },
  { id: "hearts", label: "❤️", name: "Trái tim" },
  { id: "symbols", label: "🎉", name: "Biểu tượng" },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  className,
}) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Filter emojis based on search
  const filteredEmojis = search
    ? commonEmojis.filter((emoji) => emoji.includes(search))
    : commonEmojis;

  return (
    <div
      ref={pickerRef}
      className={clsx(
        "bg-surface rounded-xl shadow-elev2 border border-border",
        "w-80 animate-slide-in-up",
        className,
      )}
    >
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm emoji..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-surface-overlay border-none focus:outline-none focus:ring-2 focus:ring-focus/30 focus:bg-surface"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={clsx(
              "flex-1 py-2 rounded-md text-lg transition-colors",
              activeCategory === cat.id ? "bg-surface-overlay" : "hover:bg-surface-hover",
            )}
            title={cat.name}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-2 h-48 overflow-y-auto">
        <div className="grid grid-cols-8 gap-1">
          {filteredEmojis.map((emoji, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-overlay text-xl transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>

        {filteredEmojis.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Không tìm thấy emoji
          </div>
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;


