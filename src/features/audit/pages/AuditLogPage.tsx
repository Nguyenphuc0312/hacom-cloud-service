import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types';
import { AppIcon } from '@/components/AppIcon';
import { AppTooltip } from '@/components/AppTooltip';
import { DataTableShell } from '@/components/DataTableShell';
import { DetailPanel } from '@/components/DetailPanel';
import { FilterBar } from '@/components/FilterBar';
import { JsonDiffDrawer } from '@/components/JsonDiffDrawer';
import { PageShell } from '@/components/PageShell';
import { QueryStateView } from '@/components/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime, formatRelativeTime } from '@/utils/date';

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
        title: 'Thời gian',
        dataIndex: 'time',
        width: 168,
        render: (value: string) => (
          <AppTooltip title={formatDateTime(value)}>
            <span>{formatRelativeTime(value)}</span>
          </AppTooltip>
        ),
      },
      {
        title: 'Actor',
        dataIndex: 'actorEmail',
        render: (value: string | null) => value ?? 'System actor',
      },
      {
        title: 'Action',
        dataIndex: 'action',
        width: 180,
      },
      {
        title: 'Target',
        key: 'entity',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.entityType ?? '-'}</strong>
            <span>{record.entityId ?? 'Không có entity ID'}</span>
          </div>
        ),
      },
      {
        title: 'Kết quả',
        width: 140,
        key: 'actionResult',
        render: (_, record) => (
          <StatusBadge
            status={readMetaValue(record.metadata, 'actionResult') ?? (record.action ? 'success' : '-')}
          />
        ),
      },
      {
        title: '',
        key: 'detail',
        width: 72,
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Mở chi tiết',
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

  const activeFilterCount = getActiveFilterCount(filters);

  const pageHeader = {
    eyebrow: 'Vận hành',
    title: 'Audit trail',
    description: 'Theo dõi actor, action, target và mở metadata sâu chỉ khi cần điều tra.',
  };

  if (query.isPending && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải audit trail..." />
      </PageShell>
    );
  }

  if (query.isError && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải audit trail."
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
            Làm mới
          </Button>
        </div>
      }
    >
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar>
            <Form form={form} layout="inline" className="ds-toolbar-form">
              <Form.Item name="action" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Action" />
              </Form.Item>
              <Form.Item name="actorEmail" className="ds-toolbar-field ds-toolbar-field--lg">
                <Input allowClear placeholder="Email actor" />
              </Form.Item>
              <Form.Item name="entityType" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Target type" />
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
                    Áp dụng
                  </Button>
                  <Button onClick={resetFilters}>Đặt lại</Button>
                </Space>
              </Form.Item>
            </Form>
            <div className="ds-filter-toolbar-meta">
              <span>{data?.pagination.total ?? 0} sự kiện</span>
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Không có bộ lọc'}</span>
              <span>
                Đồng bộ gần nhất:{' '}
                {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
              </span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Administrative events"
            meta="Bảng chính để scan nhanh các thay đổi; metadata và before/after được giữ trong inspector."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={query.isFetching && !query.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="Không có bản ghi nào khớp với bộ lọc hiện tại." />}
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
          title={selectedEntry?.action ?? 'Chi tiết audit'}
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
                  <StatusBadge
                    status={
                      readMetaValue(selectedEntry.metadata, 'actionResult') ?? (selectedEntry.action ? 'success' : '-')
                    }
                  />
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Tóm tắt</h3>
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
                    <dt>Source</dt>
                    <dd>{selectedEntry.source ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{formatDateTime(selectedEntry.time)}</dd>
                  </div>
                </dl>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Request context</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>IP</dt>
                    <dd>{selectedEntry.ipAddress ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Request ID</dt>
                    <dd>{readMetaValue(selectedEntry.metadata, 'requestId') ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>User agent</dt>
                    <dd>{selectedEntry.userAgent ?? '-'}</dd>
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
                <h3>Change set</h3>
                <div className="ds-admin-inline-actions">
                  <Button
                    disabled={!selectedEntry.before && !selectedEntry.after}
                    onClick={() => setDiffOpen(true)}
                  >
                    Mở before/after
                  </Button>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Chọn một bản ghi để xem metadata và change set." />
          )}
        </DetailPanel>

        <JsonDiffDrawer
          open={diffOpen}
          title={selectedEntry ? `So sánh thay đổi · ${selectedEntry.action}` : 'So sánh thay đổi'}
          before={selectedEntry?.before}
          after={selectedEntry?.after}
          onClose={() => setDiffOpen(false)}
        />
      </div>
    </PageShell>
  );
};
