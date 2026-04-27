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
  title = 'Chưa có dữ liệu',
  description = 'Hãy thử đổi bộ lọc hoặc chờ đợt làm mới tiếp theo.',
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
