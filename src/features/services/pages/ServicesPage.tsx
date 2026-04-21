import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { serviceHealthClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ServiceHealthItem } from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { AppIcon } from '@/components/AppIcon';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

export const ServicesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const healthQuery = useQuery({
    queryKey: queryKeys.serviceHealth,
    queryFn: serviceHealthClient.getServiceHealth,
    refetchInterval: 30_000,
  });

  const focusedService = searchParams.get('service')?.trim() ?? '';
  const focusedServiceNormalized = focusedService.toLowerCase();
  const healthItemsForTable = useMemo(() => {
    const healthItems = healthQuery.data?.items ?? [];

    if (!focusedServiceNormalized) {
      return healthItems;
    }

    const exactMatch = healthItems.find(
      (item) => item.name.toLowerCase() === focusedServiceNormalized,
    );

    if (exactMatch) {
      return [
        exactMatch,
        ...healthItems.filter((item) => item.name.toLowerCase() !== focusedServiceNormalized),
      ];
    }

    return healthItems.filter((item) => item.name.toLowerCase().includes(focusedServiceNormalized));
  }, [focusedServiceNormalized, healthQuery.data?.items]);

  const clearFocusedService = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('service');
    setSearchParams(next, { replace: true });
  };

  const columns = useMemo<ColumnsType<ServiceHealthItem>>(
    () => [
      {
        title: 'Dịch vụ',
        dataIndex: 'name',
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
    ],
    [],
  );

  if (healthQuery.isLoading && !healthQuery.data) {
    return (
      <PageShell
        eyebrow="Hệ thống"
        title="Trạng thái dịch vụ"
        description="Workspace để sàng lọc dịch vụ suy giảm và mở rộng điều tra từ bảng chính."
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
        description="Workspace để sàng lọc dịch vụ suy giảm và mở rộng điều tra từ bảng chính."
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

  return (
    <PageShell
      eyebrow="Hệ thống"
      title="Trạng thái dịch vụ"
      description="Page này chỉ giữ một nhiệm vụ: rà soát service health. Mọi tóm tắt phụ được nén về thanh meta."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
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
      <DataTableShell
        title="Dependency status"
        meta="Bảng là trọng tâm. Chỉ giữ trạng thái, độ trễ và metadata phát hành đủ để điều tra."
        toolbar={
          <DataTableToolbar>
            <span className="ds-toolbar-summary">
              {data?.summary.total ?? 0} dịch vụ · {data?.summary.degraded ?? 0} suy giảm ·{' '}
              {data?.summary.down ?? 0} ngừng
            </span>
            {focusedService ? (
              <>
                <span className="ds-shell-chip ds-shell-chip--ghost">
                  Đang lọc: {focusedService}
                </span>
                <Button size="small" onClick={clearFocusedService}>
                  Bỏ lọc
                </Button>
              </>
            ) : (
              <span className="ds-shell-chip ds-shell-chip--ghost">
                Đồng bộ: {data ? formatDateTime(data.checkedAt) : '-'}
              </span>
            )}
          </DataTableToolbar>
        }
      >
        <AdminTable
          rowKey="name"
          columns={columns}
          minHeight={360}
          dataSource={healthItemsForTable}
          rowClassName={(record) =>
            record.name.toLowerCase() === focusedServiceNormalized ? 'service-row-focused' : ''
          }
          pagination={{ pageSize: 12 }}
          emptyNode={<EmptyState description="Chưa có dữ liệu sức khỏe dịch vụ." />}
        />
      </DataTableShell>
    </PageShell>
  );
};
