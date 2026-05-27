/**
 * @fileoverview StickerPicker - Sticker selection panel (Zalo-style).
 *
 * Features:
 * - Search input with debounce
 * - Tab bar for sticker packs
 * - Grid of stickers (4 columns mobile, 5 columns desktop)
 * - Recent stickers tab
 * - Hover scale animation
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { StickerGrid } from "./StickerGrid";
import { StickerPackTabs } from "./StickerPackTabs";

/**
 * Sticker data structure
 */
export interface Sticker {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl?: string;
  isHd?: boolean;
  packId?: string;
}

/**
 * Sticker pack data structure
 */
export interface StickerPack {
  id: string;
  name: string;
  thumbnailUrl?: string;
  stickers: Sticker[];
}

/**
 * Default sticker packs for demo purposes
 */
const DEFAULT_STICKER_PACKS: StickerPack[] = [
  {
    id: "emoji",
    name: "Emoji",
    thumbnailUrl: undefined,
    stickers: [
      { id: "1", name: "Laugh", imageUrl: "", packId: "emoji" },
      { id: "2", name: "Sleepy", imageUrl: "", packId: "emoji" },
      { id: "3", name: "Sad", imageUrl: "", packId: "emoji" },
      { id: "4", name: "Angry", imageUrl: "", packId: "emoji" },
      { id: "5", name: "Love", imageUrl: "", packId: "emoji" },
      { id: "6", name: "Wow", imageUrl: "", packId: "emoji" },
    ],
  },
  {
    id: "animals",
    name: "Animals",
    thumbnailUrl: undefined,
    stickers: [
      { id: "7", name: "Cat", imageUrl: "", packId: "animals" },
      { id: "8", name: "Dog", imageUrl: "", packId: "animals" },
      { id: "9", name: "Bunny", imageUrl: "", packId: "animals" },
      { id: "10", name: "Panda", imageUrl: "", packId: "animals" },
    ],
  },
];

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: Sticker) => void;
  recentStickers?: Sticker[];
  stickerPacks?: StickerPack[];
  className?: string;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({
  isOpen,
  onClose,
  onSelectSticker,
  recentStickers = [],
  stickerPacks = DEFAULT_STICKER_PACKS,
  className,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Lazy initialization - only set default on mount
  const [activePackId, setActivePackId] = useState<string | null>(() => {
    if (stickerPacks.length > 0) {
      return stickerPacks[0].id;
    }
    return null;
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  const handleSelectSticker = useCallback((sticker: Sticker) => {
    onSelectSticker(sticker);
    onClose();
  }, [onSelectSticker, onClose]);

  // Filter stickers by search query
  const filteredStickers = useMemo(() => {
    if (!debouncedQuery) {
      return activePackId
        ? stickerPacks.find(p => p.id === activePackId)?.stickers || []
        : [];
    }

    // Search across all packs
    return stickerPacks.flatMap(pack =>
      pack.stickers.filter(sticker =>
        sticker.name.toLowerCase().includes(debouncedQuery.toLowerCase())
      )
    );
  }, [debouncedQuery, activePackId, stickerPacks]);

  // Determine which tabs to show
  const showRecentTab = recentStickers.length > 0;
  const isSearching = debouncedQuery.length > 0;

  // Tabs: Recent (if any) + All packs
  const tabs = useMemo(() => {
    const result: { id: string; name: string; thumbnailUrl?: string }[] = [];

    if (showRecentTab) {
      result.push({
        id: "recent",
        name: t("chat:sticker.recent", { defaultValue: "Gần đây" }),
        thumbnailUrl: undefined,
      });
    }

    result.push(...stickerPacks.map(pack => ({
      id: pack.id,
      name: pack.name,
      thumbnailUrl: pack.thumbnailUrl,
    })));

    return result;
  }, [showRecentTab, stickerPacks, t]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={clsx(
        "absolute bottom-full mb-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-elev3",
        "animate-slide-up-fade",
        className,
      )}
      role="dialog"
      aria-label={t("chat:sticker.picker", { defaultValue: "Sticker picker" })}
    >
      {/* Search input */}
      <div className="border-b border-border p-2">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={t("chat:sticker.search", { defaultValue: "Tìm sticker..." })}
            className={clsx(
              "w-full rounded-lg border border-border bg-surface-overlay py-2 pl-9 pr-8 text-sm",
              "placeholder:text-text-muted",
              "focus:border-[#FFC857]/60 focus:outline-none focus:ring-2 focus:ring-[#FFC857]/15",
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              aria-label={t("common:actions.clear")}
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <StickerPackTabs
          tabs={tabs}
          activeTabId={isSearching ? "search" : (activePackId || tabs[0]?.id)}
          onTabClick={(tabId) => {
            if (tabId !== "search") {
              setActivePackId(tabId === "recent" ? "recent" : tabId);
            }
          }}
        />
      </div>

      {/* Sticker grid */}
      <div className="max-h-64 overflow-y-auto p-2">
        {isSearching ? (
          filteredStickers.length > 0 ? (
            <StickerGrid
              stickers={filteredStickers}
              onSelect={handleSelectSticker}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <span className="text-4xl">🔍</span>
              <p className="mt-2 text-sm">
                {t("chat:sticker.noResults", { defaultValue: "Không tìm thấy sticker" })}
              </p>
            </div>
          )
        ) : activePackId === "recent" ? (
          <StickerGrid
            stickers={recentStickers}
            onSelect={handleSelectSticker}
          />
        ) : (
          <StickerGrid
            stickers={filteredStickers}
            onSelect={handleSelectSticker}
          />
        )}
      </div>
    </div>
  );
};

export default StickerPicker;
