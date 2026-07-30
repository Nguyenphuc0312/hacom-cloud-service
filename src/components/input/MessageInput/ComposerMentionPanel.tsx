import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { UserGroupIcon } from "@heroicons/react/24/solid";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Avatar } from "../../common/Avatar";
import type { MentionCandidate } from "./types";

interface ComposerMentionPanelProps {
  mentionListId: string;
  activeMentionIndex: number;
  mentionSuggestions: MentionCandidate[];
  onSelectMention: (candidate: MentionCandidate) => void;
}

// Fixed row height (avatar h-8 + py-2). Fixed size means the virtualizer never
// re-measures — no ResizeObserver churn, which is what keeps a long member list
// smooth. Keep in sync with the row markup below if padding/avatar size change.
const ROW_HEIGHT = 44;
// Below this, plain render — the virtual scroll container isn't worth its
// overhead for a handful of rows, and small groups stay dead simple.
// ponytail: threshold heuristic; raise if a group of ~24 still needs to feel snappy.
const VIRTUALIZE_THRESHOLD = 24;

interface MentionRowProps {
  candidate: MentionCandidate;
  index: number;
  isActive: boolean;
  optionId: string;
  primaryLabel: string;
  secondaryLabel: string | null;
  isMentionAll: boolean;
  onSelect: (candidate: MentionCandidate) => void;
}

// Memoized so scrolling / arrow-key nav only re-renders the two rows whose
// active state actually changed, not every visible row.
const MentionRow = React.memo<MentionRowProps>(
  ({
    candidate,
    index,
    isActive,
    optionId,
    primaryLabel,
    secondaryLabel,
    isMentionAll,
    onSelect,
  }) => (
    <button
      id={optionId}
      data-index={index}
      type="button"
      role="option"
      aria-selected={isActive}
      className={clsx(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
        "transition-colors",
        isActive
          ? isMentionAll
            ? "bg-amber-500/10 text-text-primary"
            : "bg-[#1976D2]/10 text-text-primary"
          : "text-text-secondary hover:bg-surface-hover",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(candidate);
      }}
    >
      {isMentionAll ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <Avatar src={candidate.avatarUrl} alt={primaryLabel} size="sm" />
      )}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          className={clsx(
            "shrink-0 truncate text-sm font-medium",
            isMentionAll && "text-amber-600 dark:text-amber-400",
          )}
        >
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="min-w-0 truncate text-xs text-text-muted">
            {secondaryLabel}
          </span>
        )}
      </span>
    </button>
  ),
);
MentionRow.displayName = "MentionRow";

// Người xem đặt "tên gợi nhớ" thì thấy đúng cái tên đó — ở đây, trong bong bóng
// chat, và ở mọi chỗ khác. Nhãn chỉ là chuyện hiển thị; chữ ghi vào tin nhắn vẫn
// là `mentionInsertName` (tên chung), nên alias không rời khỏi máy người xem.
const resolveCanonicalName = (candidate: MentionCandidate): string =>
  candidate.mentionInsertName ||
  candidate.resolvedName ||
  candidate.displayName ||
  candidate.username;

const resolvePrimaryLabel = (
  candidate: MentionCandidate,
  isMentionAll: boolean,
  mentionAllLabel: string,
): string =>
  isMentionAll
    ? mentionAllLabel
    : candidate.aliasLabel?.trim() || resolveCanonicalName(candidate);

// Dòng phụ chỉ là phòng ban · công ty. KHÔNG kèm tên thật: người đặt "tên gợi
// nhớ" là để khỏi phải đọc tên thật nữa, hiện lại thành ra rối.
const resolveSecondaryLabel = (
  candidate: MentionCandidate,
  isMentionAll: boolean,
  mentionAllDescription: string,
): string | null =>
  isMentionAll
    ? mentionAllDescription
    : [candidate.departmentName, candidate.companyName]
        .filter(Boolean)
        .join(" · ") || null;

export const ComposerMentionPanel: React.FC<ComposerMentionPanelProps> = ({
  mentionListId,
  activeMentionIndex,
  mentionSuggestions,
  onSelectMention,
}) => {
  const { t } = useTranslation();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const mentionAllLabel = t("chat:composer.mentionAllLabel");
  const mentionAllDescription = t("chat:composer.mentionAllDescription");

  const shouldVirtualize = mentionSuggestions.length > VIRTUALIZE_THRESHOLD;

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: mentionSuggestions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    getItemKey: (index) =>
      `${mentionSuggestions[index]?.id}:${mentionSuggestions[index]?.username}`,
  });

  // Keep the active option in view for keyboard nav in both paths. Scroll the
  // panel container directly (not scrollIntoView, which can scroll the whole
  // page or mis-handle the p-1 padding) so the highlight always follows ↑/↓.
  React.useEffect(() => {
    if (mentionSuggestions.length === 0) return;
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(activeMentionIndex, { align: "auto" });
      return;
    }
    const container = scrollRef.current;
    const row = container?.querySelector<HTMLElement>(
      `[data-index="${activeMentionIndex}"]`,
    );
    if (!container || !row) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    if (rowTop < container.scrollTop) {
      container.scrollTop = rowTop;
    } else if (rowBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = rowBottom - container.clientHeight;
    }
  }, [activeMentionIndex, shouldVirtualize, virtualizer, mentionSuggestions.length]);

  const renderRow = (candidate: MentionCandidate, index: number) => {
    const isMentionAll = candidate.id === "all";
    return (
      <MentionRow
        key={`${candidate.id}:${candidate.username}`}
        candidate={candidate}
        index={index}
        isActive={index === activeMentionIndex}
        optionId={`${mentionListId}-option-${index}`}
        primaryLabel={resolvePrimaryLabel(candidate, isMentionAll, mentionAllLabel)}
        secondaryLabel={resolveSecondaryLabel(
          candidate,
          isMentionAll,
          mentionAllDescription,
        )}
        isMentionAll={isMentionAll}
        onSelect={onSelectMention}
      />
    );
  };

  return (
    <div
      ref={scrollRef}
      id={mentionListId}
      role="listbox"
      aria-label={t("chat:composer.mentionList")}
      aria-activedescendant={`${mentionListId}-option-${activeMentionIndex}`}
      className={clsx(
        "absolute bottom-full left-2 right-2 z-dropdown mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-elev2",
        "p-1",
      )}
    >
      {mentionSuggestions.length === 0 ? (
        <p className="px-3 py-2 text-xs text-text-muted">
          {t("chat:composer.noMentionResults")}
        </p>
      ) : shouldVirtualize ? (
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const candidate = mentionSuggestions[virtualItem.index];
            if (!candidate) return null;
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderRow(candidate, virtualItem.index)}
              </div>
            );
          })}
        </div>
      ) : (
        mentionSuggestions.map(renderRow)
      )}
    </div>
  );
};
