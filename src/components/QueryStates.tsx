import { Alert, Button, Empty, Result, Skeleton, Space, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';

import { commonMessages } from '../shared/messages/common';

interface LoadingStateProps {
  tip?: string;
}

export const LoadingState = ({ tip = commonMessages.state.loading }: LoadingStateProps) => (
  <div className="center-state">
    <Spin tip={tip} />
  </div>
);

interface ErrorStateProps {
  title?: string;
  subTitle?: string;
  extra?: ReactNode;
}

export const ErrorState = ({
  title = commonMessages.state.error,
  subTitle,
  extra,
}: ErrorStateProps) => <Result status="error" title={title} subTitle={subTitle} extra={extra} />;

interface EmptyStateProps {
  description?: string;
}

export const EmptyState = ({ description = commonMessages.state.empty }: EmptyStateProps) => (
  <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />
);

type QueryStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'permission'
  | 'feature-disabled'
  | 'degraded'
  | 'stale';

interface QueryStateViewProps {
  kind: QueryStateKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  compact?: boolean;
}

export const QueryStateView = ({
  kind,
  title,
  description,
  onRetry,
  retryLabel = commonMessages.actions.retry,
  retrying = false,
  compact = false,
}: QueryStateViewProps) => {
  if (kind === 'loading') {
    return compact ? (
      <Skeleton active paragraph={{ rows: 3 }} />
    ) : (
      <LoadingState tip={title ?? commonMessages.table.loading} />
    );
  }

  if (kind === 'empty') {
    return <EmptyState description={description ?? 'No matching data was found.'} />;
  }

  if (kind === 'error') {
    return (
      <ErrorState
        title={title ?? 'Unable to load data'}
        subTitle={description}
        extra={
          onRetry ? (
            <Button onClick={onRetry} loading={retrying}>
              {retryLabel}
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (kind === 'permission') {
    return (
      <Result
        status="403"
        title={title ?? 'You do not have access'}
        subTitle={
          description ?? 'Your current role does not allow this action in the admin panel.'
        }
      />
    );
  }

  if (kind === 'feature-disabled') {
    return (
      <Alert
        type="info"
        showIcon
        message={title ?? 'This feature is currently disabled'}
        description={description ?? 'Write actions are disabled by the current release settings.'}
      />
    );
  }

  if (kind === 'degraded') {
    return (
      <Alert
        type="warning"
        showIcon
        message={title ?? 'Some upstream systems are degraded'}
        description={
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {description ??
                'One or more upstream dependencies are unstable. Data may be delayed or incomplete.'}
            </Typography.Text>
            {onRetry ? (
              <Button size="small" onClick={onRetry} loading={retrying}>
                {retryLabel}
              </Button>
            ) : null}
          </Space>
        }
      />
    );
  }

  return (
    <Alert
      type="warning"
      showIcon
      message={title ?? 'This data may be stale'}
      description={
        description ??
        'The latest refresh has not completed yet. A newer snapshot will appear on the next successful fetch.'
      }
    />
  );
};
