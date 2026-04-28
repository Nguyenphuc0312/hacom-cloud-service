import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Form, Input, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { auditClient } from '@/api/clients/auditClient/auditClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { AuditEntry, AuditQuery } from '@/api/types/audit/audit';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DateTimeCell } from '@/components/DateTimeCell/DateTimeCell';
import { DetailPanel } from '@/components/DetailPanel/DetailPanel';
import { FilterBar } from '@/components/FilterBar/FilterBar';
import { JsonDiffDrawer } from '@/components/JsonDiffDrawer/JsonDiffDrawer';
import { MetaCell } from '@/components/MetaCell/MetaCell';
import { PageShell } from '@/components/PageShell/PageShell';
import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { DataTable } from '@/components/ui/DataTable/DataTable';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { formatDateTime } from '@/utils/date/date';
import './AuditLogPage.css';

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
        width: 160,
        render: (value: string) => <DateTimeCell value={value} />,
      },
      {
        title: 'Cấp độ',
        key: 'level',
        width: 120,
        render: (_, record) => (
          <StatusBadge status={readMetaValue(record.metadata, 'level') ?? 'info'} />
        ),
      },
      {
        title: 'Dịch vụ',
        dataIndex: 'source',
        width: 160,
        render: (value: string | null) => <MetaCell primary={value ?? 'admin'} />,
      },
      {
        title: 'Thông điệp',
        key: 'message',
        width: 360,
        ellipsis: true,
        render: (_, record) => (
          <MetaCell
            primary={record.action}
            secondary={`${record.entityType ?? 'đối tượng'} / ${record.entityId ?? '-'}`}
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
        title: 'Người dùng/IP',
        key: 'userIp',
        width: 220,
        render: (_, record) => <MetaCell primary={record.actorEmail ?? 'Hệ thống'} secondary={record.ipAddress ?? '-'} />,
      },
      {
        title: 'Thao tác',
        key: 'detail',
        width: 84,
        fixed: 'right',
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Xem chi tiết',
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
    eyebrow: 'Kiểm soát truy cập',
    title: 'Nhật ký audit',
    description: 'Theo dõi thao tác quản trị, quyết định truy cập và sự kiện hệ thống.',
  };

  if (query.isPending && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView kind="loading" title="Đang tải nhật ký audit..." />
      </PageShell>
    );
  }

  if (query.isError && !query.data) {
    return (
      <PageShell {...pageHeader}>
        <QueryStateView
          kind="error"
          description="Không thể tải nhật ký audit."
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
            Làm mới
          </Button>
        </div>
      }
    >
      <div className="ds-page-with-detail">
        <div className="ds-page-main-stack">
          <FilterBar className="audit-log-page-filter">
            <Form form={form} layout="inline" className="ds-toolbar-form">
              <Form.Item name="action" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Tìm hành động" />
              </Form.Item>
              <Form.Item name="actorEmail" className="ds-toolbar-field ds-toolbar-field--lg">
                <Input allowClear placeholder="Email người thao tác" />
              </Form.Item>
              <Form.Item name="source" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Dịch vụ" />
              </Form.Item>
              <Form.Item name="entityType" className="ds-toolbar-field ds-toolbar-field--sm">
                <Input allowClear placeholder="Loại đối tượng" />
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
              <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang bật` : 'Chưa lọc'}</span>
              <span>
                Đồng bộ:{' '}
                {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
              </span>
            </div>
          </FilterBar>

          <DataTableShell
            title="Sự kiện quản trị"
            meta="Metadata dài và payload trước/sau chỉ hiển thị trong panel chi tiết."
          >
            <DataTable
              rowKey="id"
              columns={columns}
              minHeight={420}
              loading={query.isFetching && !query.isPending}
              dataSource={data?.items ?? []}
              emptyNode={<EmptyState description="Không có bản ghi audit khớp bộ lọc hiện tại." />}
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
          width={760}
          className="ds-ops-detail-panel"
        >
          {selectedEntry ? (
            <div className="ds-ops-detail-stack">
              <section className="ds-ops-detail-section">
                <div className="ds-ops-detail-header">
                  <div>
                    <strong>{selectedEntry.actorEmail ?? 'Tác nhân hệ thống'}</strong>
                    <p>{selectedEntry.entityType ?? 'Đối tượng không rõ'}</p>
                  </div>
                  <StatusBadge status={readMetaValue(selectedEntry.metadata, 'actionResult') ?? 'info'} />
                </div>
              </section>

              <section className="ds-ops-detail-section">
                <h3>Tóm tắt</h3>
                <dl className="ds-ops-fact-list">
                  <div>
                    <dt>Hành động</dt>
                    <dd>{selectedEntry.action}</dd>
                  </div>
                  <div>
                    <dt>Đối tượng</dt>
                    <dd>{selectedEntry.entityId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Dịch vụ</dt>
                    <dd>{selectedEntry.source ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Thời gian</dt>
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
                <h3>Thay đổi</h3>
                <div className="ds-admin-inline-actions">
                  <Button
                    disabled={!selectedEntry.before && !selectedEntry.after}
                    onClick={() => setDiffOpen(true)}
                  >
                    Mở trước/sau
                  </Button>
                </div>
              </section>
            </div>
          ) : (
            <EmptyState description="Chọn một bản ghi để xem metadata và thay đổi." />
          )}
        </DetailPanel>

        <JsonDiffDrawer
          open={diffOpen}
          title={selectedEntry ? `Trước/sau / ${selectedEntry.action}` : 'Trước/sau'}
          before={selectedEntry?.before}
          after={selectedEntry?.after}
          onClose={() => setDiffOpen(false)}
        />
      </div>
    </PageShell>
  );
};
