import { Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorStatus, getErrorMessage } from '@/api/error/error';
import type { TimeRange } from '@/api/types/metrics/metrics';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { DashboardCard } from '@/components/DashboardCard/DashboardCard';
import { PageShell } from '@/components/PageShell/PageShell';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { TimeRangePicker } from '@/components/TimeRangePicker/TimeRangePicker';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber, formatPercent, formatRate } from '@/utils/formatters/formatters';
import { getFreshnessLabel, riskStateToStatus } from '@/features/monitoring/monitoringView/monitoringView';
import { DashboardHighchartsPanel } from '../../components/DashboardHighchartsPanel/DashboardHighchartsPanel';
import { useDashboardOverview } from '../../hooks/useDashboardOverview/useDashboardOverview';
import { buildActivityTimeline, buildInsights, summarizeTrend } from '../../utils/dashboardView/dashboardView';

import './DashboardPage-01.css';
import './DashboardPage-02.css';
import './DashboardPage.figma-01.css';
import './DashboardPage.figma-02.css';
export const DashboardPage = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('1h');
  const {
    totalUsersQuery,
    activeUsersQuery,
    pendingUsersQuery,
    pendingAdminAccessQuery,
    monitoringQuery,
    serviceHealthQuery,
    incidents,
  } = useDashboardOverview(range);

  const totalUsers = totalUsersQuery.data?.pagination.total ?? 0;
  const activeUsers = activeUsersQuery.data?.pagination.total ?? 0;
  const pendingUsers = pendingUsersQuery.data?.pagination.total ?? 0;
  const pendingAdminAccess = pendingAdminAccessQuery.data?.pagination.total ?? null;
  const overview = monitoringQuery.data;
  const serviceHealth = serviceHealthQuery.data;
  const servicesSummary = serviceHealth?.summary;
  const activationRate = totalUsers > 0 ? activeUsers / totalUsers : 0;

  const refetchDashboard = () => {
    void monitoringQuery.refetch();
    void serviceHealthQuery.refetch();
    void totalUsersQuery.refetch();
    void activeUsersQuery.refetch();
    void pendingUsersQuery.refetch();
    void pendingAdminAccessQuery.refetch();
  };

  const pageHeader = {
    eyebrow: 'Tổng quan',
    title: 'Tổng quan hệ thống',
    description: 'Theo dõi người dùng, truy cập, realtime và hoạt động hệ thống.',
  };

  const isInitialLoading =
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data &&
    !activeUsersQuery.data &&
    [
      monitoringQuery,
      serviceHealthQuery,
      totalUsersQuery,
      activeUsersQuery,
      pendingAdminAccessQuery,
    ].some((query) => query.isLoading);

  if (isInitialLoading) {
    return (
      <PageShell {...pageHeader}>
        <div className="ds-ops-skeleton-grid" aria-hidden>
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--metric" />
          <div className="ds-ops-skeleton ds-ops-skeleton--panel" />
          <div className="ds-ops-skeleton ds-ops-skeleton--panel" />
        </div>
      </PageShell>
    );
  }

  const hasBlockingError =
    monitoringQuery.isError &&
    serviceHealthQuery.isError &&
    !overview &&
    !serviceHealth &&
    !totalUsersQuery.data;

  if (hasBlockingError) {
    const monitoringStatus = getApiErrorStatus(monitoringQuery.error);

    return (
      <PageShell {...pageHeader}>
        <ErrorState
          title={
            monitoringStatus === 403
              ? 'Bạn không có quyền xem telemetry'
              : 'Không thể tải tổng quan hệ thống'
          }
          description={getErrorMessage(
            monitoringQuery.error ?? serviceHealthQuery.error,
            'Nguồn dữ liệu tổng quan tạm thời không khả dụng.',
          )}
          onRetry={refetchDashboard}
        />
      </PageShell>
    );
  }

  const trafficTrend = summarizeTrend(overview?.realtimeHealth.connectionsTrend ?? [], [
    'connection',
  ]);
  const insights = buildInsights({ overview, serviceHealth, incidents });
  const activityTimeline = buildActivityTimeline({ overview, serviceHealth, incidents });
  const servicesTotal = servicesSummary?.total ?? 0;
  const apiErrorRate = overview?.systemOverview.partialFailuresPerMinute ?? null;

  const metrics = [
    {
      id: 'total-users',
      label: 'Tổng người dùng',
      value: formatNumber(totalUsers),
      meta: 'Từ API người dùng admin',
      tone: 'default' as const,
      route: '/users',
      icon: 'users' as const,
    },
    {
      id: 'active-users',
      label: 'Người dùng hoạt động',
      value: formatNumber(activeUsers),
      meta: `${formatPercent(activationRate * 100, 0)} tổng tài khoản`,
      tone: pendingUsers > 0 ? ('warning' as const) : ('success' as const),
      route: '/users',
      icon: 'check' as const,
    },
    {
      id: 'pending-access',
      label: 'Truy cập chờ duyệt',
      value: pendingAdminAccess === null ? '-' : formatNumber(pendingAdminAccess),
      meta: 'Hàng đợi duyệt IP',
      tone: (pendingAdminAccess ?? 0) > 0 ? ('warning' as const) : ('success' as const),
      route: '/access-requests',
      icon: 'access' as const,
    },
    {
      id: 'realtime-connections',
      label: 'Kết nối realtime',
      value: formatNumber(overview?.systemOverview.activeConnections),
      meta:
        trafficTrend.delta === null
          ? 'Chưa có dữ liệu xu hướng'
          : `Delta ${trafficTrend.delta >= 0 ? '+' : ''}${formatNumber(trafficTrend.delta)}`,
      tone: 'default' as const,
      route: '/monitoring',
      icon: 'activity' as const,
    },
    {
      id: 'api-errors',
      label: 'Lỗi API',
      value: apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/min'),
      meta: 'Tỷ lệ lỗi một phần',
      tone: (apiErrorRate ?? 0) > 0 ? ('danger' as const) : ('success' as const),
      route: '/monitoring',
      icon: 'warning' as const,
    },
  ];

  const hasOverviewData =
    Boolean(overview) ||
    Boolean(serviceHealth) ||
    incidents.length > 0 ||
    totalUsers > 0 ||
    activeUsers > 0 ||
    pendingUsers > 0 ||
    pendingAdminAccess !== null;

  return (
    <PageShell
      {...pageHeader}
      headerExtra={
        <div className="ds-page-toolbar-stack">
          <div className="ds-page-toolbar-group">
            <TimeRangePicker value={range} onChange={setRange} />
          </div>
          <div className="ds-page-toolbar-group ds-page-toolbar-group--secondary">
            <Button
              icon={<AppIcon name="refresh" size={16} aria-hidden />}
              loading={
                monitoringQuery.isFetching ||
                serviceHealthQuery.isFetching ||
                pendingAdminAccessQuery.isFetching
              }
              onClick={refetchDashboard}
            >
              Làm mới
            </Button>
            {overview?.generatedAt ? (
              <span className="ds-page-toolbar-meta">{formatDateTime(overview.generatedAt)}</span>
            ) : null}
          </div>
        </div>
      }
    >
      {!hasOverviewData ? (
        <div className="ds-ops-panel">
          <EmptyState description="Chưa có dữ liệu vận hành." />
        </div>
      ) : (
        <div className="ds-figma-dashboard">
          <section className="ds-figma-summary-grid" aria-label="Chỉ số vận hành chính">
            {metrics.map((metric) => (
              <button
                key={metric.id}
                type="button"
                className={`ds-figma-summary-card tone-${metric.tone}`}
                onClick={() => navigate(metric.route)}
              >
                <span className="ds-figma-summary-icon" aria-hidden>
                  <AppIcon name={metric.icon} size={34} strokeWidth={1.6} />
                </span>
                <span className="ds-figma-summary-label">{metric.label}</span>
                <strong className="ds-figma-summary-value">{metric.value}</strong>
                <span className="ds-figma-summary-meta">{metric.meta}</span>
              </button>
            ))}
          </section>

          <div className="ds-figma-main-grid">
            <DashboardCard
              title="Sức khỏe dịch vụ"
              action={<Button type="link" onClick={() => navigate('/services/health')}>Mở</Button>}
              className="ds-figma-card ds-figma-health-card"
            >
              <div className="ds-figma-health-visual">
                <DashboardHighchartsPanel type="health" summary={servicesSummary} />
                <div className="ds-figma-health-center" aria-hidden>
                  <strong>
                    {servicesTotal > 0
                      ? formatPercent(((servicesSummary?.up ?? 0) / servicesTotal) * 100, 0)
                      : '-'}
                  </strong>
                  <span>Khỏe mạnh</span>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard
              title="Tổng quan lưu lượng"
              action={<Button type="link" onClick={() => navigate('/monitoring')}>Mở</Button>}
              className="ds-figma-card ds-figma-traffic-card"
            >
              <DashboardHighchartsPanel
                type="traffic"
                series={overview?.realtimeHealth.connectionsTrend}
              />
            </DashboardCard>
          </div>

          <div className="ds-figma-bottom-grid">
            <DashboardCard
              title="Trạng thái Dịch vụ"
              action={<Button type="link" onClick={() => navigate('/services/health')}>Mở</Button>}
              className="ds-figma-card"
            >
              <div className="ds-figma-service-list">
                {(serviceHealth?.items ?? []).slice(0, 4).map((service) => (
                  <button
                    key={service.name}
                    type="button"
                    className="ds-figma-service-row"
                    onClick={() => navigate('/services/health')}
                  >
                    <span>{service.name}</span>
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
                  </button>
                ))}
                {!serviceHealth?.items?.length ? (
                  <div className="ds-figma-service-row is-static">
                    <span>Telemetry</span>
                    <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                  </div>
                ) : null}
              </div>
            </DashboardCard>

            <DashboardCard
              title="Tỷ lệ Lỗi API"
              action={<Button type="link" onClick={() => navigate('/monitoring')}>Mở</Button>}
              className="ds-figma-card ds-figma-api-card"
            >
              <div className="ds-figma-api-state">
                <strong>{apiErrorRate === null ? '-' : formatRate(apiErrorRate, '/phút')}</strong>
                <span className={(apiErrorRate ?? 0) > 0 ? 'is-warning' : 'is-ok'}>
                  <AppIcon name={(apiErrorRate ?? 0) > 0 ? 'warning' : 'check'} size={14} aria-hidden />
                  {(apiErrorRate ?? 0) > 0
                    ? 'Có lỗi cần kiểm tra'
                    : 'Hệ thống hoạt động ổn định'}
                </span>
                <dl>
                  <div>
                    <dt>Telemetry</dt>
                    <dd>
                      <StatusBadge status={overview ? getFreshnessLabel(overview.freshness) : 'unknown'} />
                    </dd>
                  </div>
                  <div>
                    <dt>Nền tải</dt>
                    <dd>
                      <StatusBadge
                        status={
                          overview
                            ? riskStateToStatus(overview.capacityBaseline.currentRiskState)
                            : 'unknown'
                        }
                      />
                    </dd>
                  </div>
                </dl>
              </div>
            </DashboardCard>
          </div>

          <DashboardCard
            title="Hoạt động vận hành gần đây"
            action={<Button type="link" onClick={() => navigate('/audit')}>Mở audit</Button>}
            className="ds-figma-card"
          >
            <div className="ds-ops-activity-list">
              {activityTimeline.slice(0, 4).length > 0 ? (
                activityTimeline.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ds-ops-activity-row ${item.highlight ? 'is-highlighted' : ''}`}
                    onClick={() => navigate(item.route)}
                  >
                    <div className="ds-ops-activity-main">
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <div className="ds-ops-activity-side">
                      <span>{formatDateTime(item.timestamp)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState description="Chưa có hoạt động gần đây." compact />
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Hàng đợi xử lý" className="ds-figma-card">
            <div className="ds-ops-list">
              {[
                ...(pendingUsers > 0
                  ? [
                      {
                        id: 'pending-users',
                        title: `${pendingUsers} tài khoản chờ xác minh`,
                        description: 'Rà soát trạng thái trước khi bật truy cập.',
                        route: '/users',
                        status: 'warning',
                      },
                    ]
                  : []),
                ...insights.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  route: item.ctaTo,
                  status:
                    item.tone === 'critical'
                      ? 'down'
                      : item.tone === 'warning'
                        ? 'warning'
                        : 'healthy',
                })),
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ds-ops-list-row"
                  onClick={() => navigate(item.route)}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              ))}
              {pendingUsers === 0 && insights.length === 0 ? (
                <EmptyState description="Không có mục nào cần xử lý." compact />
              ) : null}
            </div>
          </DashboardCard>
        </div>
      )}
    </PageShell>
  );
};
