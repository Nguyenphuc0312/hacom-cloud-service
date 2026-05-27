/**
 * @fileoverview StickerPackTabs - Horizontal scrollable tab bar for sticker packs.
 *
 * Features:
 * - Horizontal scroll
 * - Uses first sticker of each pack as icon
 * - Active tab has primary color underline
 * - "Recent" tab with clock icon
 */

import React, { useRef, useEffect } from "react";
import clsx from "clsx";
import { ClockIcon } from "@heroicons/react/24/outline";

interface StickerPackTab {
  id: string;
  name: string;
  thumbnailUrl?: string;
}

interface StickerPackTabsProps {
  tabs: StickerPackTab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  className?: string;
}

export const StickerPackTabs: React.FC<StickerPackTabsProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTabId]);

  return (
    <div
      ref={scrollRef}
      className={clsx(
        "flex overflow-x-auto scroll-smooth py-1",
        "[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0",
        "[&::-ms-overflow-style:none] [&scrollbar-width:none]",
        className,
      )}
      role="tablist"
      aria-label="Sticker packs"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isRecent = tab.id === "recent";

        return (
          <button
            key={tab.id}
            ref={isActive ? activeTabRef : undefined}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabClick(tab.id)}
            className={clsx(
              "group/tab relative shrink-0 px-3 py-2 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC857]/30",
              isActive
                ? "text-[#C41E3A]"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <div className="flex items-center gap-1.5">
              {/* Tab icon */}
              {isRecent ? (
                <ClockIcon className="h-4 w-4" />
              ) : tab.thumbnailUrl ? (
                <img
                  src={tab.thumbnailUrl}
                  alt=""
                  className="h-4 w-4 rounded object-cover"
                />
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded bg-surface-overlay text-[8px] font-bold text-text-secondary">
                  {tab.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Tab name */}
              <span className="max-w-[80px] truncate">{tab.name}</span>
            </div>

            {/* Active indicator */}
            <div
              className={clsx(
                "absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#C41E3A] transition-transform",
                isActive ? "scale-x-100" : "scale-x-0 group-hover/tab:scale-x-50",
              )}
            />
          </button>
        );
      })}
    </div>
  );
};

export default StickerPackTabs;
