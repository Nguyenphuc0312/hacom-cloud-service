import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { serviceHealthClient } from '@/api/clients';
import { queryKeys } from '@/api/queryKeys';
import type { ServiceHealthItem } from '@/api/types';
import { AdminTable } from '@/components/AdminTable';
import { DataTableShell } from '@/components/DataTableShell';
import { DataTableToolbar } from '@/components/DataTableToolbar';
import { EmptyState, QueryStateView } from '@/components/QueryStates';
import { PageShell } from '@/components/PageShell';
import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
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
  const healthItems = healthQuery.data?.items;

  const focusedServiceRecord = useMemo(
    () =>
      focusedServiceNormalized
        ? ((healthItems ?? []).find(
            (item) => item.name.toLowerCase() === focusedServiceNormalized,
          ) ?? null)
        : null,
    [focusedServiceNormalized, healthItems],
  );

  const healthItemsForTable = useMemo(() => {
    const baseItems = healthItems ?? [];

    if (!focusedServiceNormalized) {
      return baseItems;
    }

    const exactMatch = baseItems.find(
      (item) => item.name.toLowerCase() === focusedServiceNormalized,
    );

    if (exactMatch) {
      return [
        exactMatch,
        ...baseItems.filter((item) => item.name.toLowerCase() !== focusedServiceNormalized),
      ];
    }

    return baseItems.filter((item) => item.name.toLowerCase().includes(focusedServiceNormalized));
  }, [focusedServiceNormalized, healthItems]);

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
        title: 'Thông tin chính',
        key: 'summary',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.summary}</strong>
            <span>{[record.version, record.build, record.env].filter(Boolean).join(' · ') || 'Không có metadata phát hành'}</span>
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
        description="Workspace theo dõi phụ thuộc, độ trễ và build đang chạy trong môi trường hiện tại."
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
        description="Workspace theo dõi phụ thuộc, độ trễ và build đang chạy trong môi trường hiện tại."
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
      description="Bề mặt service health chỉ giữ runtime status; toàn bộ cấu hình đã được tách sang khu System settings."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          <Button
            icon={<ReloadOutlined />}
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
      <div className="ds-service-health-stack">
        {focusedService ? (
          <SurfaceCard
            eyebrow="Dịch vụ đang tập trung"
            title={
              focusedServiceRecord
                ? focusedServiceRecord.name
                : `Không có dịch vụ nào khớp '${focusedService}'`
            }
            description={
              focusedServiceRecord
                ? focusedServiceRecord.summary || 'Chưa có mô tả tóm tắt.'
                : 'Tên dịch vụ có thể đã thay đổi hoặc không xuất hiện trong lần kiểm tra gần nhất.'
            }
            status={focusedServiceRecord ? <StatusBadge status={focusedServiceRecord.status} /> : null}
            actions={
              <Button size="small" onClick={clearFocusedService}>
                Bỏ tập trung
              </Button>
            }
          />
        ) : null}

        <div className="ds-data-summary-grid">
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Ổn định</span>
            <strong className="ds-summary-tile-value">{data?.summary.up ?? 0}</strong>
            <span className="ds-summary-tile-meta">
              Phụ thuộc đều khả dụng hoàn toàn ở lần chạy gần nhất.
            </span>
          </div>
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Suy giảm</span>
            <strong className="ds-summary-tile-value">{data?.summary.degraded ?? 0}</strong>
            <span className="ds-summary-tile-meta">
              Vẫn phục vụ nhưng đã vượt ra ngoài ngưỡng latency hoặc reliability.
            </span>
          </div>
          <div className="ds-summary-tile">
            <span className="ds-summary-tile-label">Ngừng hoạt động</span>
            <strong className="ds-summary-tile-value">{data?.summary.down ?? 0}</strong>
            <span className="ds-summary-tile-meta">
              Những mục này phải được operator hoặc owner xử lý trước.
            </span>
          </div>
        </div>

        <DataTableShell
          title="Dependency status"
          meta="Danh sách chính ưu tiên trạng thái, độ trễ và phát hành; metadata sâu chỉ hiển thị trong nội dung dòng."
          toolbar={
            <DataTableToolbar>
              <span className="ds-toolbar-summary">
                {focusedService
                  ? `Dịch vụ đang tập trung: ${focusedService}`
                  : `${data?.summary.total ?? 0} dịch vụ đang theo dõi · Đồng bộ gần nhất ${
                      healthQuery.dataUpdatedAt
                        ? formatDateTime(new Date(healthQuery.dataUpdatedAt).toISOString())
                        : '-'
                    }`}
              </span>
            </DataTableToolbar>
          }
        >
          <AdminTable
            rowKey="name"
            columns={columns}
            minHeight={320}
            dataSource={healthItemsForTable}
            rowClassName={(record) =>
              record.name.toLowerCase() === focusedServiceNormalized ? 'service-row-focused' : ''
            }
            pagination={{ pageSize: 10 }}
            emptyNode={<EmptyState description="Chưa có dữ liệu sức khỏe dịch vụ." />}
          />
        </DataTableShell>
      </div>
    </PageShell>
  );
};
