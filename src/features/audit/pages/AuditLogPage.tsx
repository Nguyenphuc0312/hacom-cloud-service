import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { DataTableShell } from '@/components/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { JsonDiffDrawer } from '@/components/JsonDiffDrawer';
import { MetaCell } from '@/components/MetaCell';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/utils/date';

const getActiveFilterCount = (filters: AuditQuery) =>
  [filters.action, filters.actorEmail, filters.entityType, filters.source, filters.from, filters.to]
    .filter(Boolean)
    .length;

const readMetaValue = (metadata: unknown, key: string): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

export const AuditLogPage = () => {
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<AuditQuery>({
    page: 1,
    limit: 20,
  });
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => auditClient.list(filters),
    placeholderData: keepPreviousData,
  });

  const selectedEntry = selectedEntryId
    ? query.data?.items.find((entry) => entry.id === selectedEntryId) ?? null
    : null;

  const columns = useMemo<ColumnsType<AuditEntry>>(
    () => [
      {
        title: 'Time',
        dataIndex: 'time',
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Level',
        key: 'level',
        width: 120,
        render: (_, record) => (
          <StatusBadge status={readMetaValue(record.metadata, 'level') ?? 'info'} />
        ),
      },
      {
        title: 'Service',
        dataIndex: 'source',
        width: 160,
        render: (value: string | null) => <MetaCell primary={value ?? 'admin'} />,
      },
      {
        title: 'Message',
        key: 'message',
        width: 360,
        ellipsis: true,
        render: (_, record) => (
          <MetaCell
            primary={record.action}
            secondary={`${record.entityType ?? 'target'} / ${record.entityId ?? '-'}`}
          />
        ),
      },
      {
        title: 'Request ID',
        key: 'requestId',
        width: 180,
        ellipsis: true,
        render: (_, record) => <MetaCell primary={readMetaValue(record.metadata, 'requestId') ?? '-'} />,
      },
      {
        title: 'User/IP',
        key: 'userIp',
        width: 220,
        render: (_, record) => <MetaCell primary={record.actorEmail ?? 'System'} secondary={record.ipAddress ?? '-'} />,
      },
      {
        title: 'Actions',
        key: 'detail',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Open detail',
                icon: <AppIcon name="eye" size={14} aria-hidden />,
                onClick: () => setSelectedEntryId(record.id),
              },
            ]}
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

  const pageHeader = {
    eyebrow: 'Access Control',
    title: 'Audit Logs',
    description: 'Track administrative actions, access decisions, and system events.',
  };

  if (query.isPending && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Loading audit logs..." />
      </PageShell>
    );
  }

  if (query.isError && !query.data) {
    return (
      <PageShell {...pageHeader}>
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
  const activeFilterCount = getActiveFilterCount(filters);

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<AppIcon name="refresh" size={16} aria-hidden />}
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
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar>
            <Form form={form} layout="inline" className="ds-toolbar-form">
              <Form.Item name="action" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Search action" />
              </Form.Item>
              <Form.Item name="actorEmail" className="ds-toolbar-field ds-toolbar-field--lg">
                <Input allowClear placeholder="Actor email" />
              </Form.Item>
              <Form.Item name="source" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Service" />
              </Form.Item>
              <Form.Item name="entityType" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Target type" />
              </Form.Item>
              <Form.Item name="range" className="ds-toolbar-field ds-toolbar-field--range">
                <DatePicker.RangePicker showTime />
              </Form.Item>
              <Form.Item className="ds-toolbar-field ds-toolbar-actions">
                <Space>
                  <Button type="primary" onClick={applyFilters}>
                    Apply
                  </Button>
                  <Button onClick={resetFilters}>Reset</Button>
                </Space>
              </Form.Item>
            </Form>
            <div className="ds-filter-toolbar-meta">
              <span>{data?.pagination.total ?? 0} events</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} active filters` : 'No filters'}</span>
              <span>
                Synced:{' '}
                {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
              </span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Administrative Events"
            meta="Long metadata and before/after payloads stay in the inspector."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={query.isFetching && !query.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="No audit records match the current filters." />}
              onRow={(record) => ({
                onClick: () => setSelectedEntryId(record.id),
                style: { cursor: 'pointer' },
              })}
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
        </div>

        <DetailPanel
          open={Boolean(selectedEntry)}
          title={selectedEntry?.action ?? 'Audit Detail'}
          onClose={() => setSelectedEntryId(null)}
          width={400}
          className="ds-ops-detail-panel"
        >
          {selectedEntry ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <div>
                    <strong>{selectedEntry.actorEmail ?? 'System actor'}</strong>
                    <p>{selectedEntry.entityType ?? 'Unknown target'}</p>
                  </div>
                  <StatusBadge status={readMetaValue(selectedEntry.metadata, 'actionResult') ?? 'info'} />
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Summary</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Action</dt>
                    <dd>{selectedEntry.action}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{selectedEntry.entityId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Service</dt>
                    <dd>{selectedEntry.source ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{formatDateTime(selectedEntry.time)}</dd>
                  </div>
                  <div>
                    <dt>Request ID</dt>
                    <dd>{readMetaValue(selectedEntry.metadata, 'requestId') ?? '-'}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Metadata</h3>
                <div className="ds-ops-code-block">
                  <pre>{JSON.stringify(selectedEntry.metadata ?? {}, null, 2)}</pre>
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Change Set</h3>
                <div className="ds-admin-inline-actions">
                  <Button
                    disabled={!selectedEntry.before && !selectedEntry.after}
                    onClick={() => setDiffOpen(true)}
                  >
                    Open before/after
                  </Button>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Select a record to inspect metadata and change set." />
          )}
        </DetailPanel>

        <JsonDiffDrawer
          open={diffOpen}
          title={selectedEntry ? `Before/after / ${selectedEntry.action}` : 'Before/after'}
          before={selectedEntry?.before}
          after={selectedEntry?.after}
          onClose={() => setDiffOpen(false)}
        />
      </div>
    </PageShell>
  );
};
