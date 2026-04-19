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
        title: 'Thời gian',
        dataIndex: 'time',
        width: 188,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Người thao tác',
        dataIndex: 'actorEmail',
        render: (value: string | null) =>
          value ? <Typography.Text strong>{value}</Typography.Text> : '-',
      },
      {
        title: 'Hành động',
        dataIndex: 'action',
        render: (value: string) => <Typography.Text>{value}</Typography.Text>,
      },
      {
        title: 'Đối tượng',
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
        title: 'Nguồn',
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
        title: 'Mã request',
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
        title: 'Kết quả',
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
        title="Nhật ký kiểm toán"
        description="Lần theo thao tác quản trị, tương quan request và tín hiệu kết quả."
      >
        <QueryStateView kind="loading" title="Đang tải nhật ký kiểm toán..." />
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell
        title="Nhật ký kiểm toán"
        description="Lần theo thao tác quản trị, tương quan request và tín hiệu kết quả."
      >
        <QueryStateView
          kind="error"
          description="Không thể tải nhật ký kiểm toán."
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
      title="Nhật ký kiểm toán"
      description="Tìm trong dòng sự kiện theo người thao tác, hành động, đối tượng, nguồn và khoảng thời gian."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<ReloadOutlined />}
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
      <FilterBar>
        <Form form={form} layout="inline" className="ds-toolbar-form">
          <Form.Item name="action" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Hành động" />
          </Form.Item>
          <Form.Item name="actorEmail" className="ds-toolbar-field ds-toolbar-field--lg">
            <Input allowClear placeholder="Email người thao tác" />
          </Form.Item>
          <Form.Item name="entityType" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Loại đối tượng" />
          </Form.Item>
          <Form.Item name="source" className="ds-toolbar-field ds-toolbar-field--sm">
            <Input allowClear placeholder="Nguồn" />
          </Form.Item>
          <Form.Item name="range" className="ds-toolbar-field ds-toolbar-field--range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item className="ds-toolbar-field ds-toolbar-actions">
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Áp dụng bộ lọc
              </Button>
              <Button onClick={resetFilters}>Đặt lại</Button>
            </Space>
          </Form.Item>
        </Form>
        <div className="ds-filter-toolbar-meta">
          <span>
            {data?.pagination.total ?? 0} sự kiện phù hợp
          </span>
          <span>
            {activeFilterCount > 0
              ? `${activeFilterCount} bộ lọc đang hoạt động`
              : 'Không có bộ lọc đang hoạt động'}
          </span>
          <span>
            Đồng bộ gần nhất:{' '}
            {query.dataUpdatedAt ? formatDateTime(new Date(query.dataUpdatedAt).toISOString()) : '-'}
          </span>
        </div>
      </FilterBar>

      <DataTableShell
        title="Bản ghi kiểm toán"
        meta="Bề mặt chính để điều tra và đối chiếu tương quan."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">Trang {data?.pagination.page ?? 1}</span>
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="id"
          columns={columns}
          minHeight={360}
          dataSource={data?.items ?? []}
          emptyNode={<EmptyState description="Không có bản ghi kiểm toán nào khớp với truy vấn hiện tại." />}
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
