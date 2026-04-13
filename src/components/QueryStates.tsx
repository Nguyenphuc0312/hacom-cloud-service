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
  retryLabel = 'Thử lại',
  retrying = false,
  compact = false,
}: QueryStateViewProps) => {
  if (kind === 'loading') {
    return compact ? (
      <Skeleton active paragraph={{ rows: 3 }} />
    ) : (
      <LoadingState tip={title ?? 'Đang tải dữ liệu...'} />
    );
  }

  if (kind === 'empty') {
    return <EmptyState description={description ?? 'Không có dữ liệu phù hợp.'} />;
  }

  if (kind === 'error') {
    return (
      <ErrorState
        title={title ?? 'Không thể tải dữ liệu'}
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
        title={title ?? 'Không đủ quyền truy cập'}
        subTitle={description ?? 'Role hiện tại không có quyền thực hiện thao tác này.'}
      />
    );
  }

  if (kind === 'feature-disabled') {
    return (
      <Alert
        type="info"
        showIcon
        message={title ?? 'Tính năng đang tạm khóa'}
        description={description ?? 'Write actions hiện bị tắt bởi cấu hình release.'}
      />
    );
  }

  if (kind === 'degraded') {
    return (
      <Alert
        type="warning"
        showIcon
        message={title ?? 'Hệ thống đang degraded'}
        description={
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {description ?? 'Một số upstream đang không ổn định. Dữ liệu có thể thiếu hoặc chậm.'}
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
      message={title ?? 'Dữ liệu có thể chưa mới nhất'}
      description={
        description ?? 'Đây là dữ liệu stale và sẽ được đồng bộ lại ở lần fetch tiếp theo.'
      }
    />
  );
};
