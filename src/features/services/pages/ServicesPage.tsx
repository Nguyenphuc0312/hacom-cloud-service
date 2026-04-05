import { useQuery } from '@tanstack/react-query';
import { Button, Card, Space, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { serviceHealthClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ServiceHealthItem } from '@/api/types';
import { DataTableShell } from '@/components/DataTableShell';
import { AdminTable } from '@/components/AdminTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { EmailTemplatesCard } from '../components/EmailTemplatesCard';
import { SmtpSettingsCard } from '../components/SmtpSettingsCard';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

const SECTION_KEYS = ['health', 'smtp', 'email-templates'] as const;

export const ServicesPage = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const activeSection = SECTION_KEYS.includes(
    (section ?? 'health') as (typeof SECTION_KEYS)[number],
  )
    ? (section ?? 'health')
    : 'health';

  useEffect(() => {
    if (!section || !SECTION_KEYS.includes(section as (typeof SECTION_KEYS)[number])) {
      navigate('/services/health', { replace: true });
    }
  }, [navigate, section]);

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
    return (
      <PageShell
        title="Services"
        description="Service health + SMTP + Email templates cho vận hành admin"
      >
        <LoadingState tip="Đang tải service health..." />
      </PageShell>
    );
  }

  if (healthQuery.isError) {
    return (
      <PageShell
        title="Services"
        description="Service health + SMTP + Email templates cho vận hành admin"
      >
        <ErrorState
          subTitle="Không thể tải service health."
          extra={<Button onClick={() => healthQuery.refetch()}>Thử lại</Button>}
        />
      </PageShell>
    );
  }

  const data = healthQuery.data;

  return (
    <PageShell
      title="Services"
      description="Giám sát service health và cấu hình mail runtime theo mô hình control panel"
      headerExtra={<Button onClick={() => healthQuery.refetch()}>Refresh health</Button>}
    >
      <Tabs
        activeKey={activeSection}
        onChange={(nextKey) => navigate(`/services/${nextKey}`)}
        items={[
          {
            key: 'health',
            label: 'Service Health',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card>
                  <Space size={16} wrap>
                    <Typography.Text strong>Total: {data?.summary.total ?? 0}</Typography.Text>
                    <Typography.Text type="success">Up: {data?.summary.up ?? 0}</Typography.Text>
                    <Typography.Text type="warning">
                      Degraded: {data?.summary.degraded ?? 0}
                    </Typography.Text>
                    <Typography.Text type="danger">Down: {data?.summary.down ?? 0}</Typography.Text>
                  </Space>
                </Card>

                <DataTableShell
                  title="Dependency health table"
                  meta="Theo dõi latency, status và build metadata cho các service phụ thuộc"
                >
                  <AdminTable
                    rowKey="name"
                    columns={columns}
                    minHeight={300}
                    dataSource={data?.items ?? []}
                    pagination={{ pageSize: 10 }}
                    emptyNode={<EmptyState description="Không có dữ liệu service health." />}
                  />
                </DataTableShell>
              </Space>
            ),
          },
          {
            key: 'smtp',
            label: 'SMTP Settings',
            children: <SmtpSettingsCard />,
          },
          {
            key: 'email-templates',
            label: 'Email Templates',
            children: <EmailTemplatesCard />,
          },
        ]}
      />
    </PageShell>
  );
};
