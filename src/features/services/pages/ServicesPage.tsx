import { useQuery } from '@tanstack/react-query';
import { Button, Card, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

import { statusClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { HealthStatus, ServiceStatusItem } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Up', value: 'up' },
  { label: 'Down', value: 'down' },
  { label: 'Degraded', value: 'degraded' },
];

export const ServicesPage = () => {
  const [status, setStatus] = useState<'all' | HealthStatus>('all');

  const servicesQuery = useQuery({
    queryKey: queryKeys.services(status),
    queryFn: () => statusClient.getServices(status),
  });

  const columns = useMemo<ColumnsType<ServiceStatusItem>>(
    () => [
      {
        title: 'Name',
        dataIndex: 'name',
      },
      {
        title: 'Health',
        dataIndex: 'health',
        render: (value: string) => <StatusBadge status={value} />,
      },
      {
        title: 'Ready',
        dataIndex: 'ready',
        render: (value: boolean) => <StatusBadge status={value ? 'up' : 'down'} />,
      },
      {
        title: 'Checked At',
        dataIndex: 'checkedAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Latency',
        dataIndex: 'latencyMs',
        render: (value?: number) => formatMs(value),
      },
      {
        title: 'Error',
        dataIndex: 'error',
        render: (value?: string) => (
          <Typography.Text type="danger" ellipsis style={{ maxWidth: 240 }}>
            {value ?? '-'}
          </Typography.Text>
        ),
      },
    ],
    [],
  );

  if (servicesQuery.isLoading) {
    return <LoadingState tip="Đang tải trạng thái services..." />;
  }

  if (servicesQuery.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải danh sách service."
        extra={<Button onClick={() => servicesQuery.refetch()}>Retry</Button>}
      />
    );
  }

  const items = servicesQuery.data?.items ?? [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Services Status"
        description="Theo dõi health và readiness của từng service"
        extra={
          <Space>
            <Select
              style={{ width: 180 }}
              value={status}
              options={statusOptions}
              onChange={(nextStatus) => setStatus(nextStatus as typeof status)}
            />
            <Button onClick={() => servicesQuery.refetch()}>Refresh now</Button>
          </Space>
        }
      />

      <Card>
        <Table
          rowKey="name"
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: <EmptyState description="Không có service nào phù hợp bộ lọc" />,
          }}
        />
      </Card>
    </Space>
  );
};
