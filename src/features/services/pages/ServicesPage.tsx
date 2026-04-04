import { useQuery } from '@tanstack/react-query';
import { Button, Card, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';

import { serviceHealthClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ServiceHealthItem } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

export const ServicesPage = () => {
  const healthQuery = useQuery({
    queryKey: queryKeys.serviceHealth,
    queryFn: serviceHealthClient.getServiceHealth,
    refetchInterval: 30_000,
  });

  const columns = useMemo<ColumnsType<ServiceHealthItem>>(
    () => [
      {
        title: 'Service',
        dataIndex: 'name',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (value: string) => <StatusBadge status={value} mode="badge" />,
      },
      {
        title: 'Checked at',
        dataIndex: 'checkedAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Latency',
        dataIndex: 'latencyMs',
        render: (value: number) => formatMs(value),
      },
      {
        title: 'Summary',
        dataIndex: 'summary',
        render: (value: string) => (
          <Typography.Text ellipsis style={{ maxWidth: 260 }}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: 'Version/Build/Env',
        key: 'meta',
        render: (_, record) => {
          const parts = [record.version, record.build, record.env].filter(Boolean);
          return parts.length > 0 ? parts.join(' | ') : '-';
        },
      },
    ],
    [],
  );

  if (healthQuery.isLoading) {
    return <LoadingState tip="Đang tải service health..." />;
  }

  if (healthQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải service health."
        extra={<Button onClick={() => healthQuery.refetch()}>Thử lại</Button>}
      />
    );
  }

  const data = healthQuery.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Services"
        description="Giám sát trạng thái vận hành cơ bản của các service theo contract Phase 1"
        extra={<Button onClick={() => healthQuery.refetch()}>Refresh</Button>}
      />

      <Card>
        <Space size={16} wrap>
          <Typography.Text strong>Total: {data?.summary.total ?? 0}</Typography.Text>
          <Typography.Text type="success">Up: {data?.summary.up ?? 0}</Typography.Text>
          <Typography.Text type="warning">Degraded: {data?.summary.degraded ?? 0}</Typography.Text>
          <Typography.Text type="danger">Down: {data?.summary.down ?? 0}</Typography.Text>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="name"
          columns={columns}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <EmptyState description="Không có dữ liệu service health." /> }}
        />
      </Card>
    </Space>
  );
};
