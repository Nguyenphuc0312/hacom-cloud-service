import React, { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { EMOJI_CATEGORIES, commonEmojis } from "../../constants/emojis";

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
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isScrollingRef = useRef(false);

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

  const handleCategoryClick = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    setSearch("");
    const section = sectionRefs.current[categoryId];
    if (section && scrollRef.current) {
      isScrollingRef.current = true;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    }
  }, []);

  // Update active tab based on scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current || search) return;
      const containerTop = container.getBoundingClientRect().top;
      let current = EMOJI_CATEGORIES[0].id;
      for (const cat of EMOJI_CATEGORIES) {
        const el = sectionRefs.current[cat.id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top - containerTop;
        if (top <= 8) current = cat.id;
      }
      setActiveCategory(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [search]);

  const searchResults = search
    ? commonEmojis.filter((e) => e.includes(search)).slice(0, 80)
    : null;

  return (
    <div
      ref={pickerRef}
      className={clsx(
        "bg-surface rounded-xl shadow-elev2 border border-border flex flex-col",
        "w-80 animate-slide-in-up",
        className,
      )}
      style={{ height: 380 }}
    >
      {/* Search */}
      <div className="p-2 border-b border-border flex-shrink-0">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("chat:emoji.searchPlaceholder")}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-surface-overlay border-none focus:outline-none focus:ring-2 focus:ring-focus/30 focus:bg-surface"
          />
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border flex-shrink-0 overflow-x-auto scrollbar-hide">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id)}
              title={cat.label}
              aria-label={cat.label}
              className={clsx(
                "flex-shrink-0 w-8 h-7 flex items-center justify-center rounded-md text-base transition-colors",
                activeCategory === cat.id
                  ? "bg-surface-active"
                  : "hover:bg-surface-hover",
              )}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-3"
      >
        {searchResults ? (
          <>
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-8 gap-1.5">
                {searchResults.map((emoji, i) => (
                  <EmojiBtn key={i} emoji={emoji} onSelect={onSelect} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-text-muted text-sm">
                {t("chat:attachment.menu.noEmojiFound")}
              </div>
            )}
          </>
        ) : (
          EMOJI_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => { sectionRefs.current[cat.id] = el; }}
            >
              <p className="text-xs font-medium text-text-muted mb-1.5 px-0.5">
                {cat.label}
              </p>
              <div className="grid grid-cols-8 gap-1.5">
                {cat.emojis.map((emoji, i) => (
                  <EmojiBtn key={i} emoji={emoji} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const EmojiBtn: React.FC<{ emoji: string; onSelect: (e: string) => void }> = ({
  emoji,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(emoji)}
    className="w-8 h-8 flex items-center justify-center rounded text-xl hover:bg-surface-overlay transition-transform hover:scale-125 leading-none"
  >
    {emoji}
  </button>
);

export default EmojiPicker;
