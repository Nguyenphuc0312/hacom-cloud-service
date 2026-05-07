import type { ReactNode } from 'react';
import clsx from 'clsx';

import { FilterBar } from '@/components/FilterBar/FilterBar';

interface CompactFilterBarProps {
  children: ReactNode;
  actions?: ReactNode;
  chips?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export const CompactFilterBar = ({
  children,
  actions,
  chips,
  meta,
  className,
}: CompactFilterBarProps) => (
  <FilterBar className={clsx('ds-compact-filter-bar', className)}>
    <div className="ds-compact-filter-row">
      <div className="ds-compact-filter-main">{children}</div>
      {actions ? <div className="ds-compact-filter-actions">{actions}</div> : null}
    </div>
    {chips || meta ? (
      <div className="ds-compact-filter-meta">
        {chips}
        {meta}
      </div>
    ) : null}
  </FilterBar>
);
