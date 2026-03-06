import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Input, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types';
import { JsonDiffDrawer } from '@/components/JsonDiffDrawer';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

interface AuditFilterState {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  resource?: string;
}

export const AuditLogPage = () => {
  const [filters, setFilters] = useState<AuditFilterState>({});
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);

  const queryParams = useMemo<AuditQuery>(() => ({ ...filters }), [filters]);

  const auditQuery = useQuery({
    queryKey: queryKeys.audit(JSON.stringify(queryParams)),
    queryFn: () => auditClient.getAudit(queryParams),
  });

  const columns = useMemo<ColumnsType<AuditEntry>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'time',
        render: (value: string) => formatDateTime(value),
        width: 180,
      },
      {
        title: 'Actor',
        dataIndex: 'actor',
        width: 220,
      },
      {
        title: 'Action',
        dataIndex: 'action',
        width: 180,
      },
      {
        title: 'Resource',
        dataIndex: 'resource',
      },
      {
        title: 'IP',
        dataIndex: 'ip',
        render: (value?: string) => value ?? '-',
        width: 150,
      },
      {
        title: 'Diff',
        width: 120,
        render: (_, record) => (
          <Button size="small" onClick={() => setSelectedAudit(record)}>
            View diff
          </Button>
        ),
      },
    ],
    [],
  );

  if (auditQuery.isLoading) {
    return <LoadingState tip="Đang tải audit log..." />;
  }

  if (auditQuery.isError) {
    return <ErrorState subTitle="Không thể tải audit logs." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Audit Logs" description="Theo dõi hành động quản trị và thay đổi cấu hình" />

      <Card>
        <Space wrap>
          <DatePicker.RangePicker
            showTime
            onChange={(dates) => {
              setFilters((prev) => ({
                ...prev,
                from: dates?.[0] ? dayjs(dates[0]).toISOString() : undefined,
                to: dates?.[1] ? dayjs(dates[1]).toISOString() : undefined,
              }));
            }}
          />
          <Input
            style={{ width: 180 }}
            placeholder="Actor"
            allowClear
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, actor: event.target.value || undefined }))
            }
          />
          <Input
            style={{ width: 180 }}
            placeholder="Action"
            allowClear
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, action: event.target.value || undefined }))
            }
          />
          <Input
            style={{ width: 180 }}
            placeholder="Resource"
            allowClear
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, resource: event.target.value || undefined }))
            }
          />
          <Button onClick={() => auditQuery.refetch()}>Apply filters</Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={auditQuery.data?.items ?? []}
          pagination={{ pageSize: 12 }}
          locale={{ emptyText: <EmptyState description="Không có audit record" /> }}
        />
      </Card>

      <JsonDiffDrawer
        open={Boolean(selectedAudit)}
        onClose={() => setSelectedAudit(null)}
        title={`Diff - ${selectedAudit?.action ?? ''}`}
        before={selectedAudit?.before}
        after={selectedAudit?.after}
      />
    </Space>
  );
};
