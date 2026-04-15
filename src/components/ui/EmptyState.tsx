import type { ReactNode } from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState = ({
  title = 'No data available',
  description = 'Try changing filters or wait for the next refresh window.',
  action,
  icon,
  compact = false,
  className,
}: EmptyStateProps) => (
  <div className={clsx('ds-empty-state', compact && 'is-compact', className)}>
    {icon ? <div className="ds-empty-state-icon">{icon}</div> : null}
    <div className="ds-empty-state-copy">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
    {action ? <div className="ds-empty-state-action">{action}</div> : null}
  </div>
);
