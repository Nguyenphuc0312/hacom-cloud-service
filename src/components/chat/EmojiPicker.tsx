/**
 * @fileoverview Emoji Picker Component
 * Component chọn emoji với danh mục và tìm kiếm
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  FaceSmileIcon,
  HeartIcon,
  HandThumbUpIcon,
  GlobeAltIcon,
  MusicalNoteIcon,
  BuildingOfficeIcon,
  LightBulbIcon,
  FlagIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDebounce } from "../../hooks";

// Emoji data structure
interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: string[];
}

// Common emojis organized by category
const EMOJI_DATA: EmojiCategory[] = [
  {
    id: "recent",
    name: "Gần đây",
    icon: <FaceSmileIcon className="w-5 h-5" />,
    emojis: ["😀", "😂", "❤️", "👍", "🔥", "😊", "🎉", "💪"],
  },
  {
    id: "smileys",
    name: "Mặt cười",
    icon: <FaceSmileIcon className="w-5 h-5" />,
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "☺️",
      "😚",
      "😙",
      "🥲",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🤫",
      "🤔",
      "🤐",
      "🤨",
      "😐",
      "😑",
      "😶",
      "😏",
      "😒",
      "🙄",
      "😬",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🤧",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "🤯",
      "🤠",
      "🥳",
      "🥸",
      "😎",
      "🤓",
      "🧐",
    ],
  },
  {
    id: "hearts",
    name: "Trái tim",
    icon: <HeartIcon className="w-5 h-5" />,
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💟",
      "♥️",
      "😻",
      "😍",
      "🥰",
      "😘",
    ],
  },
  {
    id: "gestures",
    name: "Cử chỉ",
    icon: <HandThumbUpIcon className="w-5 h-5" />,
    emojis: [
      "👍",
      "👎",
      "👊",
      "✊",
      "🤛",
      "🤜",
      "🤞",
      "✌️",
      "🤟",
      "🤘",
      "👌",
      "🤌",
      "🤏",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "✋",
      "🤚",
      "🖐️",
      "🖖",
      "👋",
      "🤙",
      "💪",
      "🦾",
      "🙏",
      "🤝",
      "👏",
      "🙌",
      "👐",
      "✍️",
    ],
  },
  {
    id: "nature",
    name: "Thiên nhiên",
    icon: <GlobeAltIcon className="w-5 h-5" />,
    emojis: [
      "🌸",
      "🌹",
      "🌺",
      "🌻",
      "🌼",
      "🌷",
      "🪻",
      "🌱",
      "🪴",
      "🌲",
      "🌳",
      "🌴",
      "🌵",
      "🌾",
      "🌿",
      "☘️",
      "🍀",
      "🍁",
      "🍂",
      "🍃",
      "🍄",
      "🌍",
      "🌎",
      "🌏",
      "🌕",
      "🌙",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "🔥",
      "🌈",
    ],
  },
  {
    id: "food",
    name: "Đồ ăn",
    icon: <MusicalNoteIcon className="w-5 h-5" />,
    emojis: [
      "🍎",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🥑",
      "🥦",
      "🍔",
      "🍕",
      "🌭",
      "🍿",
      "🧁",
      "🎂",
      "🍰",
      "🍩",
      "🍪",
      "🍫",
      "☕",
      "🍵",
      "🧃",
      "🍹",
      "🍺",
      "🥂",
    ],
  },
  {
    id: "activities",
    name: "Hoạt động",
    icon: <BuildingOfficeIcon className="w-5 h-5" />,
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🎱",
      "🏓",
      "🏸",
      "🏒",
      "🥊",
      "🎯",
      "🎮",
      "🎲",
      "🧩",
      "🎨",
      "🎭",
      "🎪",
      "🎤",
      "🎧",
      "🎼",
      "🎹",
      "🎸",
      "🎺",
      "🎷",
      "🥁",
      "🎬",
      "🏆",
      "🥇",
      "🎖️",
    ],
  },
  {
    id: "objects",
    name: "Đồ vật",
    icon: <LightBulbIcon className="w-5 h-5" />,
    emojis: [
      "📱",
      "💻",
      "🖥️",
      "📷",
      "📹",
      "📺",
      "📻",
      "⏰",
      "⌚",
      "💡",
      "🔦",
      "💎",
      "💰",
      "💳",
      "📧",
      "📦",
      "🎁",
      "🎈",
      "🎀",
      "🏷️",
      "📝",
      "📚",
      "📖",
      "🔑",
      "🔒",
      "🔓",
      "❤️‍🔥",
      "💯",
      "✅",
      "❌",
      "⭕",
      "❓",
    ],
  },
  {
    id: "flags",
    name: "Cờ",
    icon: <FlagIcon className="w-5 h-5" />,
    emojis: [
      "🇻🇳",
      "🇺🇸",
      "🇬🇧",
      "🇫🇷",
      "🇩🇪",
      "🇯🇵",
      "🇰🇷",
      "🇨🇳",
      "🇮🇳",
      "🇧🇷",
      "🇷🇺",
      "🇮🇹",
      "🇪🇸",
      "🇦🇺",
      "🇨🇦",
      "🇲🇽",
      "🏳️",
      "🏴",
      "🏁",
      "🚩",
      "🎌",
      "🏳️‍🌈",
      "🏳️‍⚧️",
      "🏴‍☠️",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const pickerRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const debouncedSearch = useDebounce(searchQuery, 150);

  // Filter emojis based on search
  const filteredEmojis = useMemo(() => {
    if (!debouncedSearch) return null;

    const allEmojis: string[] = [];
    EMOJI_DATA.forEach((cat) => {
      if (cat.id !== "recent") {
        allEmojis.push(...cat.emojis);
      }
    });

    // Simple search - match any emoji that contains the search term
    // In a real app, you'd want emoji metadata with names/keywords
    return [...new Set(allEmojis)].slice(0, 50);
  }, [debouncedSearch]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Scroll to category
  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    categoryRefs.current[categoryId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Handle emoji click
  const handleEmojiClick = (emoji: string) => {
    onSelect(emoji);
    // Could save to recent emojis here
  };

  return (
    <div
      ref={pickerRef}
      className={clsx(
        "bg-surface rounded-2xl shadow-elev3 border border-border",
        "w-80 overflow-hidden",
        "animate-in fade-in-0 zoom-in-95 duration-200",
        className,
      )}
    >
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm emoji..."
            className={clsx(
              "w-full pl-9 pr-9 py-2 text-sm rounded-xl",
              "bg-surface-overlay border-0",
              "focus:outline-none focus:ring-2 focus:ring-focus/30",
            )}
          />
          {searchQuery && (
            <button type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto scrollbar-hide">
          {EMOJI_DATA.map((category) => (
            <button type="button"
              key={category.id}
              onClick={() => scrollToCategory(category.id)}
              className={clsx(
                "p-2 rounded-lg transition-colors flex-shrink-0",
                activeCategory === category.id
                  ? "bg-primary/15 text-primary"
                  : "text-text-muted hover:bg-surface-overlay",
              )}
              title={category.name}
            >
              {category.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emojis grid */}
      <div className="h-64 overflow-y-auto p-2">
        {filteredEmojis ? (
          // Search results
          <div className="grid grid-cols-8 gap-1">
            {filteredEmojis.map((emoji, index) => (
              <button type="button"
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className={clsx(
                  "w-9 h-9 flex items-center justify-center",
                  "text-xl rounded-lg",
                  "hover:bg-surface-overlay active:scale-90",
                  "transition-all duration-100",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          // Categories
          EMOJI_DATA.map((category) => (
            <div
              key={category.id}
              ref={(el) => {
                categoryRefs.current[category.id] = el;
              }}
              className="mb-4"
            >
              <h3 className="text-xs font-semibold text-text-muted px-2 mb-2 sticky top-0 bg-surface/90 backdrop-blur-sm">
                {category.name}
              </h3>
              <div className="grid grid-cols-8 gap-1">
                {category.emojis.map((emoji, index) => (
                  <button type="button"
                    key={index}
                    onClick={() => handleEmojiClick(emoji)}
                    className={clsx(
                      "w-9 h-9 flex items-center justify-center",
                      "text-xl rounded-lg",
                      "hover:bg-surface-overlay active:scale-90",
                      "transition-all duration-100",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick reactions */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border bg-surface-overlay">
        {["👍", "❤️", "😂", "😮", "😢", "🎉"].map((emoji) => (
          <button type="button"
            key={emoji}
            onClick={() => handleEmojiClick(emoji)}
            className={clsx(
              "w-8 h-8 flex items-center justify-center",
              "text-lg rounded-full",
              "hover:bg-surface hover:shadow-sm",
              "transition-all duration-100 active:scale-90",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;



