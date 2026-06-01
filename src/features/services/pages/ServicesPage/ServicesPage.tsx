import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Input, Progress, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { serviceHealthClient } from '@/api/clients/serviceHealthClient/serviceHealthClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';
import type { ServiceHealthItem } from '@/api/types/service-health/service-health';
import { AdminTable } from '@/components/AdminTable/AdminTable';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DataTableShell } from '@/components/DataTableShell/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates/QueryStates';
import { PageShell } from '@/components/PageShell/PageShell';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { formatDateTime } from '@/utils/date/date';
import { formatMs } from '@/utils/formatters/formatters';

import './ServicesPage.css';

const { Text } = Typography;

interface ServiceStatusCardProps {
  service: ServiceHealthItem;
}

const ServiceStatusCard: React.FC<ServiceStatusCardProps> = ({ service }) => {
  const statusConfig = {
    up: { color: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.05)', border: 'rgba(34, 197, 94, 0.2)' },
    degraded: { color: 'var(--color-warning)', bg: 'rgba(234, 179, 8, 0.05)', border: 'rgba(234, 179, 8, 0.2)' },
    down: { color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.05)', border: 'rgba(239, 68, 68, 0.2)' },
    unknown: { color: 'var(--color-muted)', bg: 'rgba(156, 163, 175, 0.05)', border: 'rgba(156, 163, 175, 0.2)' },
  };

  const config = statusConfig[service.status as keyof typeof statusConfig] || statusConfig.unknown;

  return (
    <Card
      size="small"
      className={`service-card service-card--${service.status}`}
      style={{
        background: config.bg,
        borderColor: config.border,
      }}
    >
      <div className="service-card-header">
        <Text strong className="service-card-name">{service.name}</Text>
        <StatusBadge
          status={
            service.status === 'up'
              ? 'healthy'
              : service.status === 'degraded'
                ? 'warning'
                : service.status === 'down'
                  ? 'down'
                  : 'unknown'
          }
        />
      </div>
      <div className="service-card-body">
        <div className="service-card-metric">
          <Text type="secondary" className="service-card-label">Độ trễ</Text>
          <Text strong>{formatMs(service.latencyMs)}</Text>
        </div>
        <div className="service-card-metric">
          <Text type="secondary" className="service-card-label">Kiểm tra</Text>
          <Text type="secondary" className="service-card-time">
            {formatDateTime(service.checkedAt)}
          </Text>
        </div>
      </div>
      <div className="service-card-footer">
        <Text type="secondary" className="service-card-summary">{service.summary}</Text>
        {(service.version || service.build) && (
          <Text type="secondary" className="service-card-version">
            v{service.version || service.build}
          </Text>
        )}
      </div>
    </Card>
  );
};

export const ServicesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchFilter, setSearchFilter] = useState('');

  const healthQuery = useQuery({
    queryKey: queryKeys.serviceHealth,
    queryFn: serviceHealthClient.getServiceHealth,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const focusedService = searchParams.get('service')?.trim() ?? '';
  const focusedServiceNormalized = focusedService.toLowerCase();

  const filteredItems = useMemo(() => {
    let items = healthQuery.data?.items ?? [];

    // Apply search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.summary?.toLowerCase().includes(search),
      );
    }

    // Apply focused service filter
    if (focusedServiceNormalized) {
      const exactMatch = items.find(
        (item) => item.name.toLowerCase() === focusedServiceNormalized,
      );
      if (exactMatch) {
        items = [
          exactMatch,
          ...items.filter((item) => item.name.toLowerCase() !== focusedServiceNormalized),
        ];
      } else {
        items = items.filter((item) =>
          item.name.toLowerCase().includes(focusedServiceNormalized),
        );
      }
    }

    return items;
  }, [healthQuery.data?.items, searchFilter, focusedServiceNormalized]);

  const clearFocusedService = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('service');
    setSearchParams(next, { replace: true });
  };

  const columns: ColumnsType<ServiceHealthItem> = [
    {
      title: 'Dịch vụ',
      dataIndex: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 140,
      render: (value: string) => <StatusBadge status={value} />,
    },
    {
      title: 'Kiểm tra lúc',
      dataIndex: 'checkedAt',
      width: 188,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Độ trễ',
      dataIndex: 'latencyMs',
      width: 120,
      render: (value: number) => formatMs(value),
    },
    {
      title: 'Tóm tắt',
      key: 'summary',
      render: (_, record) => (
        <div className="ds-table-primary-cell">
          <strong>{record.summary}</strong>
          <span>
            {[record.version, record.build, record.env].filter(Boolean).join(' · ') ||
              'Không có metadata phát hành'}
          </span>
        </div>
      ),
    },
  ];

  if (healthQuery.isLoading && !healthQuery.data) {
    return (
      <PageShell
        eyebrow="Hệ thống"
        title="Trạng thái dịch vụ"
      >
        <QueryStateView kind="loading" title="Đang tải sức khỏe dịch vụ..." />
      </PageShell>
    );
  }

  if (healthQuery.isError && !healthQuery.data) {
    return (
      <PageShell
        eyebrow="Hệ thống"
        title="Trạng thái dịch vụ"
      >
        <QueryStateView
          kind="error"
          description="Không thể tải sức khỏe dịch vụ."
          onRetry={() => {
            void healthQuery.refetch();
          }}
        />
      </PageShell>
    );
  }

  const data = healthQuery.data;
  const summary = data?.summary;
  const healthyPercent = summary?.total
    ? Math.round((summary.up / summary.total) * 100)
    : 0;

  return (
    <PageShell
      eyebrow="Hệ thống"
      title="Trạng thái dịch vụ"
      headerExtra={
        <div className="services-header-actions">
          <div className="view-mode-toggle">
            <Button
              type={viewMode === 'grid' ? 'primary' : 'default'}
              icon={<AppIcon name="grid" size={14} />}
              onClick={() => setViewMode('grid')}
              size="small"
            />
            <Button
              type={viewMode === 'table' ? 'primary' : 'default'}
              icon={<AppIcon name="list" size={14} />}
              onClick={() => setViewMode('table')}
              size="small"
            />
          </div>
          <Button
            icon={<AppIcon name="refresh" size={14} />}
            loading={healthQuery.isFetching}
            onClick={() => {
              void healthQuery.refetch();
            }}
          >
            Làm mới
          </Button>
        </div>
      }
    >
      {/* Summary Banner */}
      <div className="services-summary-banner">
        <div className="services-summary-info">
          <Text strong>
            {summary?.total ?? 0} dịch vụ
          </Text>
          <Text type="secondary">
            {' · '}
            {summary?.up ?? 0} online
            {' · '}
            {summary?.degraded ?? 0} suy giảm
            {' · '}
            {summary?.down ?? 0} ngừng
          </Text>
          {data?.checkedAt && (
            <Text type="secondary" className="services-last-check">
              · Kiểm tra: {formatDateTime(data.checkedAt)}
            </Text>
          )}
        </div>
        <div className="services-summary-progress">
          <Progress
            type="circle"
            percent={healthyPercent}
            size={56}
            strokeColor={{
              '0%': 'var(--color-success)',
              '100%': healthyPercent < 100 ? 'var(--color-warning)' : 'var(--color-success)',
            }}
            format={() => `${healthyPercent}%`}
          />
        </div>
      </div>

      {/* Search Filter */}
      <div className="services-filters">
        <Input.Search
          placeholder="Tìm dịch vụ..."
          allowClear
          onSearch={setSearchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{ width: 300 }}
        />
        {focusedService && (
          <Button size="small" onClick={clearFocusedService}>
            Xóa lọc: {focusedService}
          </Button>
        )}
      </div>

      {/* Grid or Table View */}
      {viewMode === 'grid' ? (
        <div className="services-grid">
          {filteredItems.length > 0 ? (
            filteredItems.map((service) => (
              <ServiceStatusCard key={service.name} service={service} />
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không tìm thấy dịch vụ nào"
            />
          )}
        </div>
      ) : (
        <DataTableShell
          title="Danh sách dịch vụ"
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                {filteredItems.length} dịch vụ
              </span>
            </DataTableToolbar>
          }
        >
          <AdminTable
            rowKey="name"
            columns={columns}
            minHeight={360}
            dataSource={filteredItems}
            rowClassName={(record) =>
              record.name.toLowerCase() === focusedServiceNormalized
                ? 'service-row-focused'
                : ''
            }
            pagination={{ pageSize: 12 }}
            emptyNode={<EmptyState description="Chưa có dữ liệu sức khỏe dịch vụ." />}
          />
        </DataTableShell>
      )}
    </PageShell>
  );
};
