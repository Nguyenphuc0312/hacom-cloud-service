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
        title: 'Service',
        dataIndex: 'name',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (value: string) => <StatusBadge status={value} mode="badge" />,
      },
      {
        title: 'Checked at',
        dataIndex: 'checkedAt',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Latency',
        dataIndex: 'latencyMs',
        render: (value: number) => formatMs(value),
      },
      {
        title: 'Summary',
        dataIndex: 'summary',
        render: (value: string) => (
          <Typography.Text ellipsis style={{ maxWidth: 260 }}>
            {value}
          </Typography.Text>
        ),
      },
      {
        title: 'Version / Build / Env',
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
        title="Services"
        description="Dependency health and service configuration for the admin runtime."
      >
        <QueryStateView kind="loading" title="Loading service health..." />
      </PageShell>
    );
  }

  if (activeSection === 'health' && healthQuery.isError) {
    return (
      <PageShell
        title="Services"
        description="Dependency health and service configuration for the admin runtime."
      >
        <QueryStateView
          kind="error"
          description="Unable to load service health."
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
      title="Services"
      description="Keep dependency health, SMTP runtime, and outbound template controls inside one disciplined settings workspace."
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            {activeSection === 'health' ? (
              <span className="ds-shell-chip">
                {data?.summary.total ?? 0} tracked service{(data?.summary.total ?? 0) === 1 ? '' : 's'}
              </span>
            ) : null}
            <span className="ds-shell-chip ds-shell-chip--ghost">
              {activeSection === 'health' ? 'Health workspace' : activeSection === 'smtp' ? 'SMTP workspace' : 'Email template workspace'}
            </span>
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            {activeSection === 'health' ? (
              <>
                <Button
                  icon={<ReloadOutlined />}
                  loading={healthQuery.isFetching}
                  onClick={() => {
                    void healthQuery.refetch();
                  }}
                >
                  Refresh
                </Button>
                <span className="ds-page-toolbar-meta">
                  Last sync:{' '}
                  {healthQuery.dataUpdatedAt
                    ? formatDateTime(new Date(healthQuery.dataUpdatedAt).toISOString())
                    : '-'}
                </span>
              </>
            ) : null}
          </div>
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
            label: 'Service Health',
            children: (
              <div className="ds-tab-page">
                {focusedService ? (
                  <SurfaceCard
                    eyebrow="Focused service"
                    title={
                      focusedServiceRecord
                        ? focusedServiceRecord.name
                        : `No service matched '${focusedService}'`
                    }
                    description={
                      focusedServiceRecord
                        ? focusedServiceRecord.summary || 'No summary available.'
                        : 'The service name may have changed or was not present in the latest health check.'
                    }
                    status={
                      focusedServiceRecord ? <StatusBadge status={focusedServiceRecord.status} /> : null
                    }
                    actions={
                      <Button size="small" onClick={clearFocusedService}>
                        Clear focus
                      </Button>
                    }
                  />
                ) : null}

                <div className="ds-data-summary-grid">
                  <div className="ds-summary-tile">
                    <span className="ds-summary-tile-label">Healthy</span>
                    <strong className="ds-summary-tile-value">{data?.summary.up ?? 0}</strong>
                    <span className="ds-summary-tile-meta">Dependencies fully available in the latest run.</span>
                  </div>
                  <div className="ds-summary-tile">
                    <span className="ds-summary-tile-label">Degraded</span>
                    <strong className="ds-summary-tile-value">{data?.summary.degraded ?? 0}</strong>
                    <span className="ds-summary-tile-meta">Serving but not within the expected latency or quality band.</span>
                  </div>
                  <div className="ds-summary-tile">
                    <span className="ds-summary-tile-label">Down</span>
                    <strong className="ds-summary-tile-value">{data?.summary.down ?? 0}</strong>
                    <span className="ds-summary-tile-meta">Needs operator attention or dependency escalation.</span>
                  </div>
                </div>

                <DataTableShell
                  title="Dependency health"
                  meta="Keep latency, status, and release metadata readable without mixing them with SMTP or template controls."
                  toolbar={
                    <DataTableToolbar>
                      {focusedService ? (
                        <span className="ds-shell-chip ds-shell-chip--ghost">Filter: {focusedService}</span>
                      ) : null}
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
                    emptyNode={<EmptyState description="No service health data is available." />}
                  />
                </DataTableShell>
              </div>
            ),
          },
          {
            key: 'smtp',
            label: 'SMTP Settings',
            children: <SmtpSettingsCard />,
          },
          {
            key: 'email-templates',
            label: 'Email Templates',
            children: <EmailTemplatesCard />,
          },
        ]}
      />
    </PageShell>
  );
};
