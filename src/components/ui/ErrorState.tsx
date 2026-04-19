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
  title = 'Không thể tải khu vực này',
  description = 'Không thể lấy dữ liệu mới nhất từ hệ thống phía sau.',
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
        Thử lại
      </Button>
    ) : null}
  </div>
);
