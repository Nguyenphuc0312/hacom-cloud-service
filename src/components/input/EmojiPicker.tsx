import React, { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { EMOJI_CATEGORIES } from "../../constants/emojis";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}

type MainTab = "emoji" | "sticker";

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  className,
}) => {
  const [mainTab, setMainTab] = useState<MainTab>("emoji");
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
    const section = sectionRefs.current[categoryId];
    if (section && scrollRef.current) {
      isScrollingRef.current = true;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    }
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
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
  }, [mainTab]);

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
      {/* Main tabs: STICKER | EMOJI */}
      <div className="flex border-b border-border flex-shrink-0">
        <button
          type="button"
          onClick={() => setMainTab("sticker")}
          className={clsx(
            "flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors",
            mainTab === "sticker"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-text-muted hover:text-text-primary",
          )}
        >
          STICKER
        </button>
        <div className="w-px bg-border my-2" />
        <button
          type="button"
          onClick={() => setMainTab("emoji")}
          className={clsx(
            "flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors",
            mainTab === "emoji"
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-text-muted hover:text-text-primary",
          )}
        >
          EMOJI
        </button>
      </div>

      {mainTab === "sticker" ? (
        <StickerPlaceholder />
      ) : (
        <>
          {/* Category tabs */}
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

          {/* Emoji grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-3">
            {EMOJI_CATEGORIES.map((cat) => (
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
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const StickerPlaceholder: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted select-none">
    <span className="text-5xl">🐱</span>
    <p className="text-sm font-medium text-text-primary">Đang phát triển</p>
    <p className="text-xs text-center px-6 leading-relaxed">
      Tính năng sticker sẽ sớm ra mắt. Hãy chờ đón nhé!
    </p>
  </div>
);

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
