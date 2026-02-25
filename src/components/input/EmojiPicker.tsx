import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { commonEmojis } from "../../data/mockData";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const categories = [
    { id: "recent", label: "🕐", name: t("chat:emoji.category.recent") },
    { id: "smileys", label: "😀", name: t("chat:emoji.category.smileys") },
    { id: "gestures", label: "👍", name: t("chat:emoji.category.gestures") },
    { id: "hearts", label: "❤️", name: t("chat:emoji.category.hearts") },
    { id: "symbols", label: "🎉", name: t("chat:emoji.quickReactions") },
  ];

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const pickerRef = useRef<HTMLDivElement>(null);

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
      <div className="p-2 border-b border-border">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat:emoji.searchPlaceholder")}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-surface-overlay border-none focus:outline-none focus:ring-2 focus:ring-focus/30 focus:bg-surface"
          />
        </div>
      </div>

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
            {t("chat:attachment.menu.noEmojiFound")}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmojiPicker;
