/**
 * ReactionPicker - Unified emoji picker component.
 *
 * Features:
 * - Popover positioned relative to trigger (296px width, 16px border-radius)
 * - Tab bar: Recent | Smileys | Gestures | Objects
 * - Search input to filter emojis by English name
 * - Recent section from localStorage
 * - Quick reactions section with 12 fixed emojis
 * - Auto-positioning (open up/down based on viewport)
 * - Click outside or Escape to close
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { clsx } from "clsx";
import { Search, X } from "lucide-react";
import { EmojiButton } from "./EmojiButton";
import {
  QUICK_REACTIONS,
  EMOJI_CATEGORIES,
  EMOJI_NAME_MAP,
  getRecentEmojis,
  saveRecentEmoji,
  type EmojiCategory,
} from "./emoji-data";
import type { PickerPosition } from "./useReactionPicker";

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  style?: React.CSSProperties;
  position?: PickerPosition;
  currentUserReaction?: string | null;
}

type TabId = EmojiCategory | "quick";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "recent", label: "Gần đây", icon: "⏱" },
  { id: "smileys", label: "Smileys", icon: "😊" },
  { id: "gestures", label: "Gestures", icon: "👋" },
  { id: "objects", label: "Objects", icon: "💡" },
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onSelect,
  style,
  currentUserReaction,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const recentEmojis = useMemo(() => getRecentEmojis(), []);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      saveRecentEmoji(emoji);
      onSelect(emoji);
    },
    [onSelect],
  );

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }, []);

  // Filter emojis based on search query
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) {
      return null; // Show all emojis for current tab
    }

    const query = searchQuery.toLowerCase();
    const allEmojis = Object.entries(EMOJI_NAME_MAP)
      .filter(([, name]) => name.toLowerCase().includes(query))
      .map(([emoji]) => emoji);

    return allEmojis;
  }, [searchQuery]);

  // Get emojis to display based on active tab and search
  const displayEmojis = useMemo(() => {
    // If searching, show filtered results
    if (filteredEmojis !== null) {
      return filteredEmojis;
    }

    // If on recent tab but no recent emojis, show quick reactions instead
    if (activeTab === "recent") {
      if (recentEmojis.length > 0) {
        return recentEmojis;
      }
      // Fall back to quick reactions if no recent
      return [...QUICK_REACTIONS];
    }

    // Get emojis from category
    const category = EMOJI_CATEGORIES[activeTab as EmojiCategory];
    return category?.emojis ?? [];
  }, [activeTab, filteredEmojis, recentEmojis]);

  // Determine what to show in the main content area
  const showRecentSection = activeTab === "recent" && recentEmojis.length > 0 && !searchQuery;
  const showQuickSection = !searchQuery && (activeTab !== "recent" || recentEmojis.length === 0);

  return (
    <div
      className={clsx(
        "w-[296px] overflow-hidden rounded-2xl border border-border bg-surface shadow-elev3",
        "animate-scale-in-emoji",
      )}
      style={style}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Reaction picker"
    >
      {/* Header with search */}
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-secondary))] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm emoji..."
            className={clsx(
              "min-w-0 flex-1 bg-transparent text-sm text-text-primary",
              "outline-none placeholder:text-text-muted",
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      {!searchQuery && (
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={clsx(
                "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs",
                "transition-colors duration-100",
                activeTab === tab.id
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="max-h-[240px] overflow-y-auto p-2">
        {/* Recent section */}
        {showRecentSection && (
          <div className="mb-3">
            <p className="mb-1 px-1 text-xs font-medium text-text-muted">
              Gần đây
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {recentEmojis.map((emoji) => (
                <EmojiButton
                  key={emoji}
                  emoji={emoji}
                  onClick={handleEmojiSelect}
                  isHighlighted={emoji === currentUserReaction}
                />
              ))}
            </div>
          </div>
        )}

        {/* Quick reactions section */}
        {showQuickSection && (
          <div className="mb-3">
            <p className="mb-1 px-1 text-xs font-medium text-text-muted">
              Phản ứng nhanh
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {QUICK_REACTIONS.map((emoji) => (
                <EmojiButton
                  key={emoji}
                  emoji={emoji}
                  onClick={handleEmojiSelect}
                  isHighlighted={emoji === currentUserReaction}
                />
              ))}
            </div>
          </div>
        )}

        {/* Category emojis or search results */}
        {filteredEmojis !== null ? (
          <div>
            {filteredEmojis.length > 0 ? (
              <>
                <p className="mb-1 px-1 text-xs font-medium text-text-muted">
                  Kết quả tìm kiếm
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {filteredEmojis.slice(0, 32).map((emoji) => (
                    <EmojiButton
                      key={emoji}
                      emoji={emoji}
                      onClick={handleEmojiSelect}
                      isHighlighted={emoji === currentUserReaction}
                    />
                  ))}
                </div>
                {filteredEmojis.length > 32 && (
                  <p className="mt-2 px-1 text-xs text-text-muted">
                    Hiển thị 32/{filteredEmojis.length} kết quả
                  </p>
                )}
              </>
            ) : (
              <p className="py-4 text-center text-sm text-text-muted">
                Không tìm thấy emoji
              </p>
            )}
          </div>
        ) : activeTab !== "recent" && (
          <div className="grid grid-cols-8 gap-0.5">
            {displayEmojis.map((emoji: string) => (
              <EmojiButton
                key={emoji}
                emoji={emoji}
                onClick={handleEmojiSelect}
                isHighlighted={emoji === currentUserReaction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReactionPicker;
