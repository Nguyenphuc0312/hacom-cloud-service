import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

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
import { EmailTemplatesCard } from '../components/EmailTemplatesCard';
import { SmtpSettingsCard } from '../components/SmtpSettingsCard';
import { formatDateTime } from '@/utils/date';
import { formatMs } from '@/utils/formatters';

const SECTION_KEYS = ['health', 'smtp', 'email-templates'] as const;

export const ServicesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { section } = useParams<{ section?: string }>();
  const activeSection = SECTION_KEYS.includes(
    (section ?? 'health') as (typeof SECTION_KEYS)[number],
  )
    ? (section ?? 'health')
    : 'health';

  useEffect(() => {
    if (!section || !SECTION_KEYS.includes(section as (typeof SECTION_KEYS)[number])) {
      navigate('/services/health', { replace: true });
    }
  }, [navigate, section]);

  const healthQuery = useQuery({
    queryKey: queryKeys.serviceHealth,
    queryFn: serviceHealthClient.getServiceHealth,
    enabled: activeSection === 'health',
    refetchInterval: activeSection === 'health' ? 30_000 : false,
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
        render: (value: string) => <StatusBadge status={value} mode="badge" />,
      },
      {
        title: 'Kiểm tra lúc',
        dataIndex: 'checkedAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Độ trễ',
        dataIndex: 'latencyMs',
        render: (value: number) => formatMs(value),
      },
      {
        title: 'Tóm tắt',
        dataIndex: 'summary',
        render: (value: string) => (
          <Typography.Text ellipsis style={{ maxWidth: 260 }}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: 'Version / Build / Môi trường',
        key: 'meta',
        render: (_, record) => {
          const parts = [record.version, record.build, record.env].filter(Boolean);
          return parts.length > 0 ? parts.join(' | ') : '-';
        },
      },
    ],
    [],
  );

  if (activeSection === 'health' && healthQuery.isLoading) {
    return (
      <PageShell
      title="Dịch vụ"
      description="Sức khỏe phụ thuộc và cấu hình dịch vụ."
      >
        <QueryStateView kind="loading" title="Đang tải sức khỏe dịch vụ..." />
      </PageShell>
    );
  }

  if (activeSection === 'health' && healthQuery.isError) {
    return (
      <PageShell
      title="Dịch vụ"
      description="Sức khỏe phụ thuộc và cấu hình dịch vụ."
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
      title="Dịch vụ"
      description="Quản lý sức khỏe dịch vụ, runtime SMTP và kiểm soát mẫu gửi ra ngoài trong một workspace gọn."
      headerExtra={
        <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
          {activeSection === 'health' ? (
            <Button
              icon={<ReloadOutlined />}
              loading={healthQuery.isFetching}
              onClick={() => {
                void healthQuery.refetch();
              }}
            >
              Làm mới
            </Button>
          ) : null}
        </div>
      }
    >
      <Tabs
        className="ds-tab-page"
        activeKey={activeSection}
        onChange={(nextKey) => navigate(`/services/${nextKey}`)}
        items={[
          {
            key: 'health',
            label: 'Sức khỏe dịch vụ',
            children: (
              <div className="ds-tab-page">
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
                    status={
                      focusedServiceRecord ? <StatusBadge status={focusedServiceRecord.status} /> : null
                    }
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
                    <span className="ds-summary-tile-meta">Phụ thuộc đều khả dụng hoàn toàn ở lần chạy gần nhất.</span>
                  </div>
                  <div className="ds-summary-tile">
                    <span className="ds-summary-tile-label">Suy giảm</span>
                    <strong className="ds-summary-tile-value">{data?.summary.degraded ?? 0}</strong>
                    <span className="ds-summary-tile-meta">Vẫn phục vụ nhưng nằm ngoài ngưỡng độ trễ hoặc chất lượng kỳ vọng.</span>
                  </div>
                  <div className="ds-summary-tile">
                    <span className="ds-summary-tile-label">Ngừng hoạt động</span>
                    <strong className="ds-summary-tile-value">{data?.summary.down ?? 0}</strong>
                    <span className="ds-summary-tile-meta">Cần operator xử lý hoặc leo thang cho dịch vụ phụ thuộc.</span>
                  </div>
                </div>

                <DataTableShell
                  title="Sức khỏe phụ thuộc"
                  meta="Bề mặt chính cho trạng thái phụ thuộc, độ trễ và metadata phát hành."
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
                    minHeight={300}
                    dataSource={healthItemsForTable}
                    rowClassName={(record) =>
                      record.name.toLowerCase() === focusedServiceNormalized
                        ? 'service-row-focused'
                        : ''
                    }
                    pagination={{ pageSize: 10 }}
                    emptyNode={<EmptyState description="Chưa có dữ liệu sức khỏe dịch vụ." />}
                  />
                </DataTableShell>
              </div>
            ),
          },
          {
            key: 'smtp',
            label: 'Cấu hình SMTP',
            children: <SmtpSettingsCard />,
          },
          {
            key: 'email-templates',
            label: 'Mẫu email',
            children: <EmailTemplatesCard />,
          },
        ]}
      />
    </PageShell>
  );
};
