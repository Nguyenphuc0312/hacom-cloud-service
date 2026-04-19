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
    return <EmptyState description={description ?? 'Không tìm thấy dữ liệu phù hợp.'} />;
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
        title={title ?? 'Bạn không có quyền truy cập'}
        subTitle={
          description ?? 'Vai trò hiện tại của bạn không được phép thực hiện thao tác này trong trang quản trị.'
        }
      />
    );
  }

  if (kind === 'feature-disabled') {
    return (
      <Alert
        type="info"
        showIcon
        message={title ?? 'Tính năng này hiện đang bị tắt'}
        description={description ?? 'Các thao tác ghi đang bị tắt theo cấu hình phát hành hiện tại.'}
      />
    );
  }

  if (kind === 'degraded') {
    return (
      <Alert
        type="warning"
        showIcon
        message={title ?? 'Một số hệ thống phụ thuộc đang suy giảm'}
        description={
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {description ??
                'Một hoặc nhiều dịch vụ phụ thuộc đang không ổn định. Dữ liệu có thể chậm hoặc chưa đầy đủ.'}
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
      message={title ?? 'Dữ liệu này có thể đã cũ'}
      description={
        description ??
        'Lần làm mới gần nhất chưa hoàn tất. Ảnh chụp mới hơn sẽ xuất hiện ở lần tải thành công tiếp theo.'
      }
    />
  );
};
