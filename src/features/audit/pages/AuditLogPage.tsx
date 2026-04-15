import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { FilterBar } from '@/components/FilterBar';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';

const getActiveFilterCount = (filters: AuditQuery) =>
  [filters.action, filters.actorEmail, filters.entityType, filters.source, filters.from, filters.to]
    .filter(Boolean).length;

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

  const readMetaValue = (metadata: unknown, key: string): string | null => {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const record = metadata as Record<string, unknown>;
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : null;
  };

  const columns = useMemo<ColumnsType<AuditEntry>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'time',
        width: 188,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Actor',
        dataIndex: 'actorEmail',
        render: (value: string | null) =>
          value ? <Typography.Text strong>{value}</Typography.Text> : '-',
      },
      {
        title: 'Action',
        dataIndex: 'action',
        render: (value: string) => <Typography.Text>{value}</Typography.Text>,
      },
      {
        title: 'Entity',
        key: 'entity',
        render: (_, record) => {
          const type = record.entityType ?? '-';
          const id = record.entityId ?? '-';

          return (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{type}</Typography.Text>
              <Typography.Text type="secondary">{id}</Typography.Text>
            </Space>
          );
        },
      },
      {
        title: 'Source',
        dataIndex: 'source',
        render: (value: string | null) => (
          <Typography.Text type="secondary">{value ?? '-'}</Typography.Text>
        ),
      },
      {
        title: 'IP',
        dataIndex: 'ipAddress',
        render: (value: string | null | undefined) =>
          value ? <Typography.Text code>{value}</Typography.Text> : '-',
      },
      {
        title: 'Request ID',
        key: 'requestId',
        render: (_, record) => {
          const requestId = readMetaValue(record.metadata, 'requestId');

          return requestId ? (
            <Typography.Text code ellipsis style={{ maxWidth: 180 }}>
              {requestId}
            </Typography.Text>
          ) : (
            '-'
          );
        },
      },
      {
        title: 'Result',
        key: 'actionResult',
        render: (_, record) => (
          <StatusBadge
            status={readMetaValue(record.metadata, 'actionResult') ?? (record.action ? 'success' : '-')}
            mode="tag"
          />
        ),
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

  const resetFilters = () => {
    form.resetFields();
    setFilters({ page: 1, limit: 20 });
  };

  const activeFilterCount = getActiveFilterCount(filters);

  if (query.isLoading) {
    return (
      <PageShell
        title="Audit Logs"
        description="Trace admin actions, request correlation, and outcome signals."
      >
        <QueryStateView kind="loading" title="Loading audit logs..." />
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell
        title="Audit Logs"
        description="Trace admin actions, request correlation, and outcome signals."
      >
        <QueryStateView
          kind="error"
          description="Unable to load audit logs."
          onRetry={() => {
            void query.refetch();
          }}
        />
      </PageShell>
    );
  }

  const data = query.data;

  return (
    <PageShell
      title="Audit Logs"
      description="Search the event stream by actor, action, entity, source, and time range."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            Refresh
          </Button>
        </div>
      }
    >
      <FilterBar>
        <Form form={form} layout="inline" className="ds-toolbar-form">
          <Form.Item name="action" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Action" />
          </Form.Item>
          <Form.Item name="actorEmail" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Actor email" />
          </Form.Item>
          <Form.Item name="entityType" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Entity type" />
          </Form.Item>
          <Form.Item name="source" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Source" />
          </Form.Item>
          <Form.Item name="range" className="ds-toolbar-field ds-toolbar-field--range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item className="ds-toolbar-field ds-toolbar-actions">
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Apply filters
              </Button>
              <Button onClick={resetFilters}>Reset</Button>
            </Space>
          </Form.Item>
        </Form>
        <div className="ds-filter-toolbar-meta">
          <span>
            {data?.pagination.total ?? 0} matched event{(data?.pagination.total ?? 0) === 1 ? '' : 's'}
          </span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}`
              : 'No active filters'}
          </span>
          <span>
            Last sync:{' '}
            {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
          </span>
        </div>
      </FilterBar>

      <DataTableShell
        title="Audit records"
        meta="Primary surface for investigation and correlation."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">Page {data?.pagination.page ?? 1}</span>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={360}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="No audit records matched the current query." />}
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
      </DataTableShell>
    </PageShell>
  );
};
