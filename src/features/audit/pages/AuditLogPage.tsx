import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Form, Input, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types';
import { EmptyState, ErrorState, LoadingState } from '@/components/QueryStates';
import { PageHeader } from '@/components/PageHeader';
import { formatDateTime } from '@/utils/date';

export const AuditLogPage = () => {
  const [form] = Form.useForm();

  const [filters, setFilters] = useState<AuditQuery>({
    page: 1,
    limit: 20,
  });

  const query = useQuery({
    queryKey: queryKeys.auditLogs(JSON.stringify(filters)),
    queryFn: () => auditClient.list(filters),
  });

  const columns = useMemo<ColumnsType<AuditEntry>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'time',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Actor',
        dataIndex: 'actorEmail',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Action',
        dataIndex: 'action',
      },
      {
        title: 'Entity',
        key: 'entity',
        render: (_, record) => {
          const type = record.entityType ?? '-';
          const id = record.entityId ?? '-';
          return `${type} / ${id}`;
        },
      },
      {
        title: 'Source',
        dataIndex: 'source',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'IP',
        dataIndex: 'ipAddress',
        render: (value: string | null | undefined) => value ?? '-',
      },
    ],
    [],
  );

  const applyFilters = () => {
    const values = form.getFieldsValue() as {
      action?: string;
      actorEmail?: string;
      entityType?: string;
      source?: string;
      range?: [Dayjs | null, Dayjs | null];
    };

    setFilters((prev) => ({
      ...prev,
      page: 1,
      action: values.action?.trim() || undefined,
      actorEmail: values.actorEmail?.trim() || undefined,
      entityType: values.entityType || undefined,
      source: values.source || undefined,
      from: values.range?.[0] ? values.range[0].toISOString() : undefined,
      to: values.range?.[1] ? values.range[1].toISOString() : undefined,
    }));
  };

  if (query.isLoading) {
    return <LoadingState tip="Đang tải audit logs..." />;
  }

  if (query.isError) {
    return (
      <ErrorState
        subTitle="Không thể tải audit logs."
        extra={<Button onClick={() => query.refetch()}>Thử lại</Button>}
      />
    );
  }

  const data = query.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Audit Logs"
        description="Theo dõi lịch sử thao tác quản trị ở chế độ read-only"
      />

      <Card>
        <Form form={form} layout="inline">
          <Form.Item name="action">
            <Input allowClear placeholder="Action" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="actorEmail">
            <Input allowClear placeholder="Actor email" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="entityType">
            <Input allowClear placeholder="Entity type" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="source">
            <Input allowClear placeholder="Source" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Áp dụng
              </Button>
              <Button
                onClick={() => {
                  form.resetFields();
                  setFilters({ page: 1, limit: 20 });
                }}
              >
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          locale={{ emptyText: <EmptyState description="Không có audit record phù hợp." /> }}
          pagination={{
            current: data?.pagination.page,
            pageSize: data?.pagination.limit,
            total: data?.pagination.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setFilters((prev) => ({ ...prev, page, limit: pageSize }));
            },
          }}
        />
      </Card>
    </Space>
  );
};
