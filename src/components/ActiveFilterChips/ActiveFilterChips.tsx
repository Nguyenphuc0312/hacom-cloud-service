import type { ReactNode } from 'react';

import { FilterBadge } from '@/components/FilterBadge/FilterBadge';
import type { FilterBadgeVariant } from '@/components/FilterBadge/FilterBadge';

export interface ActiveFilterChip {
  key: string;
  label: string;
  value?: ReactNode;
  variant?: FilterBadgeVariant;
  onRemove?: () => void;
}

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  summary?: ReactNode;
  onClearAll?: () => void;
  clearAllLabel?: string;
}

export const ActiveFilterChips = ({
  chips,
  summary,
  onClearAll,
  clearAllLabel = 'Xóa tất cả',
}: ActiveFilterChipsProps) => {
  if (chips.length === 0 && !summary) {
    return null;
  }

  return (
    <div className="ds-active-filter-chips" aria-label="Bộ lọc đang áp dụng">
      {summary ? <span className="ds-active-filter-summary">{summary}</span> : null}
      {chips.map((chip) => (
        <FilterBadge
          key={chip.key}
          label={chip.label}
          value={chip.value}
          variant={chip.variant}
          onRemove={chip.onRemove}
        />
      ))}
      {chips.length >= 2 && onClearAll ? (
        <button
          type="button"
          className="ds-active-filter-clear"
          aria-label="Xóa tất cả bộ lọc"
          onClick={onClearAll}
        >
          {clearAllLabel}
        </button>
      ) : null}
    </div>
  );
};
