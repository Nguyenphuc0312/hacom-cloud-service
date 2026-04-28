import type { ReactNode } from 'react';
import clsx from 'clsx';

import { AppIcon } from '@/components/AppIcon/AppIcon';

export type FilterBadgeVariant =
  | 'neutral'
  | 'status'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'role'
  | 'department'
  | 'source'
  | 'service'
  | 'level'
  | 'date'
  | 'scope'
  | 'type';

interface FilterBadgeProps {
  label: ReactNode;
  value?: ReactNode;
  variant?: FilterBadgeVariant;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

const toAccessibleLabel = (value: ReactNode) => (typeof value === 'string' ? value : 'bộ lọc');

export const FilterBadge = ({
  label,
  value,
  variant = 'neutral',
  onRemove,
  removeLabel,
  className,
}: FilterBadgeProps) => (
  <span className={clsx('ds-filter-badge', `ds-filter-badge--${variant}`, className)}>
    <span className="ds-filter-badge-label">{label}</span>
    {value ? <span className="ds-filter-badge-value">{value}</span> : null}
    {onRemove ? (
      <button
        type="button"
        className="ds-filter-badge-remove"
        aria-label={removeLabel ?? `Xóa ${toAccessibleLabel(label)}`}
        onClick={onRemove}
      >
        <AppIcon name="close" size={12} aria-hidden />
      </button>
    ) : null}
  </span>
);
