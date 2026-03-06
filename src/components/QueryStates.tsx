import { Empty, Result, Spin } from 'antd';
import type { ReactNode } from 'react';

interface LoadingStateProps {
  tip?: string;
}

export const LoadingState = ({ tip = 'Loading...' }: LoadingStateProps) => (
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
  title = 'Không thể tải dữ liệu',
  subTitle,
  extra,
}: ErrorStateProps) => (
  <Result status="error" title={title} subTitle={subTitle} extra={extra} />
);

interface EmptyStateProps {
  description?: string;
}

export const EmptyState = ({ description = 'Không có dữ liệu' }: EmptyStateProps) => (
  <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />
);
