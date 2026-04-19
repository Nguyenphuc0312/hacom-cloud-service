import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface ErrorStateProps {
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
  action?: ReactNode;
  onRetry?: () => void;
}

export const ErrorState = ({
  title = 'Unable to load this section',
  description = 'The latest data could not be retrieved from the backend.',
  compact = false,
  className,
  action,
  onRetry,
}: ErrorStateProps) => (
  <div className={clsx('ds-error-state', compact && 'is-compact', className)}>
    <div className="ds-error-state-copy">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
    {action ? (
      <div className="ds-error-state-action">{action}</div>
    ) : onRetry ? (
      <Button icon={<ReloadOutlined />} onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);
